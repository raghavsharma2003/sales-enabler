import { createHash, randomUUID } from 'node:crypto';
import type { AuthUser } from '../server/auth';
import { db, WriteConflictError } from '../server/db';
import { field, HttpError } from '../server/http';
import { getEntity, type Entity } from '../server/store';
import { getRecord, type PlatformRecord } from '../platform/records';
import { getIngestionDetail } from './engine';
import { customerCatalogGuard, existingCustomerMatch } from './customer-catalog';
import type { IngestionCandidate, IngestionProposal } from './contracts';

type Receipt = { sourceId: string; proposalId: string; candidateId: string; contactId: string; name: string; email: string; sourceDigest: string; reviewedBy: string; reviewedAt: string };
export type ContactImportCreated = { status: 'created'; contactId: string; contact: Entity; proposal: IngestionProposal; replayed: boolean };
export type ContactImportConflict = { status: 'conflict'; reason: 'email_match' | 'name_match'; existingContactId: string; existingName: string; existingEmail: string; error: string };
export type ContactImportResult = ContactImportCreated | ContactImportConflict;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const normalized = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const emailsIn = (value: string) => value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function quoteSupportsName(quote: string, name: string): boolean {
  const withoutEmails = quote.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ' ');
  const haystack = withoutEmails.normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase();
  const wanted = normalized(name);
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(wanted)}(?=$|[^\\p{L}\\p{N}])`, 'u').test(haystack);
}

async function findExisting(user: AuthUser, name: string, email: string): Promise<ContactImportConflict | undefined> {
  const match = await existingCustomerMatch(await db(), user.organizationId, name, email);
  if (!match) return undefined;
  return { status: 'conflict', reason: match.reason, existingContactId: match.id, existingName: match.name, existingEmail: match.email,
    error: match.reason === 'email_match' ? 'A customer with this email already exists. Review that record instead of importing a duplicate.' : 'A customer with this name already exists. Review that record before creating another.' };
}

function proposalShape(record: PlatformRecord<Omit<IngestionProposal, 'id' | 'revision' | 'status'>>): IngestionProposal {
  return { id: record.id, ...record.data, revision: record.revision, status: record.status as IngestionProposal['status'] };
}

export async function importReviewedContact(user: AuthUser, body: Record<string, unknown>): Promise<ContactImportResult> {
  const sourceId = field(body, 'sourceId', 100), candidateId = field(body, 'candidateId', 100);
  if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 1) throw new HttpError(400, 'Current proposal revision required.');
  const name = field(body, 'name', 160), email = field(body, 'email', 254, false);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  const detail = await getIngestionDetail(user, sourceId);
  const source = detail.source;
  if (source.status !== 'ready' || !detail.proposal) throw new HttpError(409, 'Source or proposal is unavailable. Refresh and review again.');
  const proposal = await getRecord<Omit<IngestionProposal, 'id' | 'revision' | 'status'>>(user.organizationId, 'ingestion_proposal', detail.proposal.id);
  if (proposal.data.sourceId !== sourceId || proposal.data.sourceDigest !== source.digest) throw new HttpError(409, 'Proposal source changed. Refresh and review again.');
  const candidate = proposal.data.candidates.find(item => item.id === candidateId);
  if (!candidate || candidate.type !== 'contact') throw new HttpError(400, 'Choose a contact suggestion from this proposal.');
  const block = source.blocks.find(item => item.id === candidate.sourceRef.blockId);
  if (!block || candidate.sourceRef.start < block.start || candidate.sourceRef.end > block.end || source.text.slice(candidate.sourceRef.start, candidate.sourceRef.end) !== candidate.quote) throw new HttpError(409, 'Contact evidence no longer matches this source.');
  if (!quoteSupportsName(candidate.quote, name)) throw new HttpError(400, 'The reviewed name must appear in the quoted source evidence, outside an email address.');
  if (email && !emailsIn(candidate.quote).some(item => normalized(item) === normalized(email))) throw new HttpError(400, 'The reviewed email must appear in the quoted source evidence.');
  const receiptId = `contact-import:${sha(JSON.stringify([user.organizationId, proposal.id, candidateId]))}`;
  const oldReceipt = await (async () => { try { return await getRecord<Receipt>(user.organizationId, 'contact_import_receipt', receiptId); } catch (error) { if (error instanceof HttpError && error.status === 404) return undefined; throw error; } })();
  if (oldReceipt) {
    if (normalized(oldReceipt.data.name) !== normalized(name) || normalized(oldReceipt.data.email) !== normalized(email) || candidate.status !== 'linked_customer' || candidate.linkedContactId !== oldReceipt.data.contactId) throw new HttpError(409, 'This suggestion was already linked with different details. Refresh and review the customer.');
    return { status: 'created', contactId: oldReceipt.data.contactId, contact: await getEntity(user.organizationId, 'contact', oldReceipt.data.contactId), proposal: proposalShape(proposal), replayed: true };
  }
  if (candidate.status !== 'review_only' || proposal.revision !== body.revision) throw new HttpError(409, 'Contact suggestion changed. Refresh and review again.');
  const database = await db();
  // Serializes imports against other imports; manual customer writes use a separate path.
  const catalogGuard = await customerCatalogGuard(database, user.organizationId);
  const conflict = await findExisting(user, name, email);
  if (conflict) return conflict;
  const now = new Date().toISOString();
  const contactId = `ingestion-contact:${sha(JSON.stringify([user.organizationId, proposal.id, candidateId]))}`;
  const contactData = { name, email, stage: 'New', notes: '', identityVerified: false, source: 'Reviewed ingestion',
    sourceArtifactId: source.id, sourceDigest: source.digest, sourceQuote: candidate.quote, sourceRef: candidate.sourceRef,
    proposalId: proposal.id, candidateId, reviewedBy: user.id, reviewedAt: now };
  const receipt: Receipt = { sourceId, proposalId: proposal.id, candidateId, contactId, name, email, sourceDigest: source.digest, reviewedBy: user.id, reviewedAt: now };
  const updatedCandidates: IngestionCandidate[] = proposal.data.candidates.map(item => item.id === candidateId ? { ...item, status: 'linked_customer', linkedContactId: contactId } : item);
  const unresolved = updatedCandidates.some(item => item.status === 'pending' || item.status === 'review_only');
  const saved = updatedCandidates.some(item => item.status === 'applied' || item.status === 'linked_customer');
  const proposalStatus = unresolved ? (saved ? 'partially_applied' : 'pending') : saved ? 'completed' : 'rejected';
  const before = JSON.stringify({ revision: proposal.revision, updatedAt: proposal.updatedAt, data: proposal.data });
  const updatedData = { ...proposal.data, candidates: updatedCandidates, updatedAt: now };
  const after = JSON.stringify({ revision: proposal.revision + 1, updatedAt: now, data: updatedData });
  const [sourceRow] = await database.all('SELECT data,status FROM entities WHERE id=? AND organization_id=? AND kind=?', [source.id, user.organizationId, 'platform:ingestion_source']);
  if (!sourceRow || sourceRow.status !== 'ready') throw new HttpError(409, 'Source changed. Refresh and review again.');
  const storedSource = JSON.parse(String(sourceRow.data));
  if (storedSource.revision !== 1 || storedSource.data.digest !== source.digest || storedSource.data.text !== source.text) throw new HttpError(409, 'Source artifact changed. Refresh and review again.');
  try {
    await database.batch([
      catalogGuard,
      { sql: 'UPDATE entities SET data=data WHERE id=? AND organization_id=? AND kind=? AND data=? AND status=?', params: [source.id, user.organizationId, 'platform:ingestion_source', String(sourceRow.data), 'ready'], expectedChanges: 1 },
      { sql: 'UPDATE entities SET data=?,status=? WHERE id=? AND organization_id=? AND kind=? AND data=? AND status=?', params: [after, proposalStatus, proposal.id, user.organizationId, 'platform:ingestion_proposal', before, proposal.status], expectedChanges: 1 },
      { sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [contactId, user.organizationId, 'contact', null, JSON.stringify(contactData), now] },
      { sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [receiptId, user.organizationId, 'platform:contact_import_receipt', 'created', JSON.stringify({ revision: 1, updatedAt: now, data: receipt }), now] },
      { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, contactId, 'contact.created:ingestion_reviewed', now] },
      { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, proposal.id, `ingestion.contact.linked:r${proposal.revision + 1}`, now] },
    ]);
  } catch (error) {
    if (error instanceof WriteConflictError || error instanceof Error && /unique|duplicate|constraint/i.test(error.message)) {
      const currentReceipt = await (async () => { try { return await getRecord<Receipt>(user.organizationId, 'contact_import_receipt', receiptId); } catch { return undefined; } })();
      if (currentReceipt && normalized(currentReceipt.data.name) === normalized(name) && normalized(currentReceipt.data.email) === normalized(email)) {
        const currentProposal = await getRecord<Omit<IngestionProposal, 'id' | 'revision' | 'status'>>(user.organizationId, 'ingestion_proposal', proposal.id);
        return { status: 'created', contactId: currentReceipt.data.contactId, contact: await getEntity(user.organizationId, 'contact', currentReceipt.data.contactId), proposal: proposalShape(currentProposal), replayed: true };
      }
      const newConflict = await findExisting(user, name, email);
      if (newConflict) return newConflict;
      throw new HttpError(409, 'Customer imports changed. Refresh and review again.');
    }
    throw error;
  }
  return { status: 'created', contactId, contact: { ...contactData, id: contactId, createdAt: now }, proposal: { id: proposal.id, ...updatedData, revision: proposal.revision + 1, status: proposalStatus }, replayed: false };
}
