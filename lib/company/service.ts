import { createHash, randomUUID } from 'node:crypto';
import type { AuthUser } from '../server/auth';
import { db, WriteConflictError, type Database } from '../server/db';
import { HttpError } from '../server/http';
import { brainCatalogGuard } from '../ingestion/brain-catalog';
import { getActiveMembership, ownerMembershipFence } from '../team/service';
import { COMPANY_CREATION_DEFAULTS, COMPANY_PROFILE_KIND, exportPublicBrand, type CompanyProfileRecord, type CompanyProfileValues, type CompanyReadinessItem, type CompanySettingsSnapshot } from './contracts';
import { parseCompanyProfile } from './validation';

type StoredProfile = { revision: number; updatedAt: string; data: CompanyProfileValues };
type Row = { id: string; name: string; created_at: string };
const profileId = (organizationId: string) => `company-profile:${createHash('sha256').update(organizationId).digest('hex')}`;
const now = () => new Date().toISOString();

async function organization(database: Database, organizationId: string): Promise<Row> {
  const [row] = await database.all<Row>('SELECT id,name,created_at FROM organizations WHERE id=?', [organizationId]);
  if (!row) throw new HttpError(404, 'Company workspace not found.');
  return row;
}

function defaults(row: Row): CompanyProfileValues {
  return { name: row.name, publicDisplayName: row.name, website: '', description: '', industry: '', country: COMPANY_CREATION_DEFAULTS.country, timezone: COMPANY_CREATION_DEFAULTS.timezone, languages: [...COMPANY_CREATION_DEFAULTS.languages], brandAccent: COMPANY_CREATION_DEFAULTS.brandAccent };
}

async function current(database: Database, user: AuthUser): Promise<{ organization: Row; row?: { data: string; status: string; created_at: string }; profile: CompanyProfileRecord }> {
  const org = await organization(database, user.organizationId), id = profileId(user.organizationId);
  const [row] = await database.all<{ data: string; status: string; created_at: string }>('SELECT data,status,created_at FROM entities WHERE id=? AND organization_id=? AND kind=?', [id, user.organizationId, COMPANY_PROFILE_KIND]);
  if (!row) return { organization: org, profile: { id, revision: 0, status: 'active', createdAt: org.created_at, ...defaults(org) } };
  let stored: StoredProfile;
  try { stored = JSON.parse(row.data) as StoredProfile; } catch { throw new HttpError(409, 'Company profile data is invalid.'); }
  if (row.status !== 'active' || !Number.isSafeInteger(stored.revision) || stored.revision < 1 || stored.data.name !== org.name) throw new HttpError(409, 'Company profile and workspace name are out of sync. Ask an owner to review the record.');
  return { organization: org, row, profile: { id, revision: stored.revision, status: 'active', createdAt: row.created_at, updatedAt: stored.updatedAt, ...stored.data } };
}

function state(count: number, attention = 0): CompanyReadinessItem['state'] { return count > 0 ? 'ready' : attention > 0 ? 'attention' : 'missing'; }
async function readiness(database: Database, user: AuthUser, profile: CompanyProfileRecord): Promise<CompanyReadinessItem[]> {
  const rows = await database.all<{ kind: string; status: string; data: string }>('SELECT kind,status,data FROM entities WHERE organization_id=? AND kind IN (?,?,?,?,?)', [user.organizationId, 'integration:vault', 'platform:offering', 'platform:release', 'platform:agent_deployment', COMPANY_PROFILE_KIND]);
  const connections = rows.filter(row => row.kind === 'integration:vault'), connected = connections.filter(row => row.status === 'connected').length;
  const offerings = rows.filter(row => row.kind === 'platform:offering' && row.status === 'approved').length;
  const releases = rows.filter(row => row.kind === 'platform:release' && row.status === 'active').length;
  const deployments = rows.filter(row => row.kind === 'platform:agent_deployment' && row.status === 'published').length;
  const identityReady = Boolean(profile.publicDisplayName && profile.description && profile.industry);
  return [
    { id: 'identity', label: 'Company identity', state: identityReady ? 'ready' : 'missing', count: identityReady ? 1 : 0, detail: identityReady ? 'A public name, description, and industry are recorded.' : 'Add a public name, description, and industry. Profile text stays unreviewed until you explicitly add a draft to Company brain.', target: 'Company', actionLabel: 'Review identity' },
    { id: 'connections', label: 'Connected systems', state: state(connected, connections.length - connected), count: connected, detail: connected ? `${connected} checked connection${connected === 1 ? '' : 's'} recorded.` : connections.length ? 'Connection records exist, but none is currently checked as connected. Review credentials and access.' : 'No company-system connection is recorded. Add credentials only in Integrations.', target: 'Integrations', actionLabel: 'Open integrations' },
    { id: 'offering', label: 'Approved offering', state: state(offerings), count: offerings, detail: offerings ? `${offerings} approved offering${offerings === 1 ? '' : 's'} available for campaign planning.` : 'No approved offering is recorded. Review source-backed business context first.', target: 'Company brain', actionLabel: 'Review offerings' },
    { id: 'release', label: 'Active browser release', state: state(releases), count: releases, detail: releases ? `${releases} active browser release${releases === 1 ? '' : 's'} recorded.` : 'No active browser release is recorded. Test and publish an agent version first.', target: 'Releases', actionLabel: 'Open releases' },
    { id: 'deployment', label: 'Published deployment', state: state(deployments), count: deployments, detail: deployments ? `${deployments} published deployment${deployments === 1 ? '' : 's'} recorded.` : 'No published public deployment is recorded. Publication remains an explicit owner action.', target: 'Deployments', actionLabel: 'Open deployments' },
  ];
}

export async function getCompanySettings(user: AuthUser, databaseOverride?: Database): Promise<CompanySettingsSnapshot> {
  const database = databaseOverride ?? await db(), member = await getActiveMembership(user), saved = await current(database, user);
  return { profile: saved.profile, role: member.role, editable: member.role === 'owner', publicBrand: exportPublicBrand(saved.profile), readiness: await readiness(database, user, saved.profile) };
}

export async function saveCompanySettings(user: AuthUser, input: Record<string, unknown>, databaseOverride?: Database): Promise<CompanySettingsSnapshot> {
  const database = databaseOverride ?? await db();
  if (!Number.isSafeInteger(input.revision) || Number(input.revision) < 0) throw new HttpError(400, 'Current company profile revision is required.');
  const actor = await ownerMembershipFence(user, database), saved = await current(database, user), data = parseCompanyProfile(input);
  if (saved.profile.revision !== Number(input.revision)) throw new HttpError(409, 'Company settings changed. Refresh and review again.');
  const timestamp = now(), revision = saved.profile.revision + 1, stored: StoredProfile = { revision, updatedAt: timestamp, data };
  const statements: Parameters<Database['batch']>[0] = [actor,
    { sql: 'UPDATE organizations SET name=? WHERE id=? AND name=?', params: [data.name, user.organizationId, saved.organization.name], expectedChanges: 1 },
  ];
  if (saved.row) statements.push({ sql: 'UPDATE entities SET data=?,status=? WHERE id=? AND organization_id=? AND kind=? AND data=? AND status=?', params: [JSON.stringify(stored), 'active', saved.profile.id, user.organizationId, COMPANY_PROFILE_KIND, saved.row.data, 'active'], expectedChanges: 1 });
  else statements.push({ sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [saved.profile.id, user.organizationId, COMPANY_PROFILE_KIND, 'active', JSON.stringify(stored), timestamp] });
  statements.push({ sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, saved.profile.id, `${saved.row ? 'company_profile.updated' : 'company_profile.created'}:r${revision}`, timestamp] });
  try { await database.batch(statements); }
  catch (error) { if (error instanceof WriteConflictError || error instanceof Error && /unique|constraint/i.test(error.message)) throw new HttpError(409, 'Company settings changed. Refresh and review again.'); throw error; }
  return getCompanySettings(user, database);
}

export async function addCompanyDescriptionToBrain(user: AuthUser, revision: unknown, databaseOverride?: Database): Promise<{ sourceId: string; status: 'draft' | 'approved' | 'revoked'; created: boolean }> {
  const database = databaseOverride ?? await db();
  if (!Number.isSafeInteger(revision) || Number(revision) < 1) throw new HttpError(400, 'Save the company profile before adding it to Company brain.');
  const actor = await ownerMembershipFence(user, database), saved = await current(database, user);
  if (!saved.row || saved.profile.revision !== Number(revision)) throw new HttpError(409, 'Company settings changed. Save or refresh before creating a brain draft.');
  if (!saved.profile.description) throw new HttpError(400, 'Add a company description before creating a Company brain draft.');
  const sourceId = `company-profile-brain:${createHash('sha256').update(`${user.organizationId}:${revision}:${saved.profile.description}`).digest('hex')}`;
  const [existing] = await database.all<{ status: string; data: string }>('SELECT status,data FROM entities WHERE id=? AND organization_id=? AND kind=?', [sourceId, user.organizationId, 'platform:brain_source']);
  if (existing) return { sourceId, status: existing.status as 'draft' | 'approved' | 'revoked', created: false };
  const timestamp = now(), guard = await brainCatalogGuard(database, user.organizationId);
  const profileFence = { sql: 'UPDATE entities SET data=data WHERE id=? AND organization_id=? AND kind=? AND data=? AND status=?', params: [saved.profile.id, user.organizationId, COMPANY_PROFILE_KIND, saved.row.data, 'active'], expectedChanges: 1 };
  const brain = { title: `${saved.profile.publicDisplayName} — company description`, content: saved.profile.description, sourceLabel: 'Company profile description · owner-authored · unreviewed', authoredBy: user.id, companyProfileId: saved.profile.id, companyProfileRevision: saved.profile.revision };
  try {
    await database.batch([guard, actor, profileFence,
      { sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [sourceId, user.organizationId, 'platform:brain_source', 'draft', JSON.stringify({ revision: 1, updatedAt: timestamp, data: brain }), timestamp] },
      { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, sourceId, 'brain_source.created:company_profile_unreviewed', timestamp] },
    ]);
  } catch (error) {
    if (error instanceof WriteConflictError) throw new HttpError(409, 'Company settings or Company brain changed. Refresh and review again.');
    const [duplicate] = await database.all('SELECT id FROM entities WHERE id=? AND organization_id=? AND kind=?', [sourceId, user.organizationId, 'platform:brain_source']);
    if (duplicate) {
      const [value] = await database.all<{ status: string }>('SELECT status FROM entities WHERE id=? AND organization_id=? AND kind=?', [sourceId, user.organizationId, 'platform:brain_source']);
      return { sourceId, status: value.status as 'draft' | 'approved' | 'revoked', created: false };
    }
    throw error;
  }
  return { sourceId, status: 'draft', created: true };
}
