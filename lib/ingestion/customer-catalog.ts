import { createHash } from 'node:crypto';
import type { Database } from '../server/db';
import { HttpError } from '../server/http';

export type CustomerMatch = { id: string; name: string; email: string; reason: 'email_match' | 'name_match' };
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const normalized = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

/** Must be captured before reading customer identities and committed with their write. */
export async function customerCatalogGuard(database: Database, organizationId: string): Promise<Parameters<Database['batch']>[0][number]> {
  const id = `contact-import-catalog:${sha(organizationId)}`;
  const now = new Date().toISOString();
  await database.run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT (id) DO NOTHING',
    [id, organizationId, 'internal:contact_import_catalog', 'active', JSON.stringify({ revision: 0 }), now]);
  const [row] = await database.all('SELECT data,status FROM entities WHERE id=? AND organization_id=? AND kind=?', [id, organizationId, 'internal:contact_import_catalog']);
  if (!row || row.status !== 'active') throw new HttpError(409, 'Customer directory changed. Refresh and review again.');
  const prior = JSON.parse(String(row.data));
  if (!Number.isSafeInteger(prior.revision) || prior.revision < 0) throw new HttpError(409, 'Customer directory revision is invalid.');
  return { sql: 'UPDATE entities SET data=? WHERE id=? AND organization_id=? AND kind=? AND status=? AND data=?',
    params: [JSON.stringify({ revision: prior.revision + 1 }), id, organizationId, 'internal:contact_import_catalog', 'active', String(row.data)], expectedChanges: 1 };
}

/** Exact effective matches only. Active profile values override base contact values. */
export async function existingCustomerMatch(database: Database, organizationId: string, name: string, email: string, excludeContactId?: string): Promise<CustomerMatch | undefined> {
  const [contacts, profiles] = await Promise.all([
    database.all('SELECT id,data FROM entities WHERE organization_id=? AND kind=?', [organizationId, 'contact']),
    database.all('SELECT status,data FROM entities WHERE organization_id=? AND kind=?', [organizationId, 'platform:customer_profile']),
  ]);
  const profileByContact = new Map<string, Record<string, unknown>>();
  for (const row of profiles) if (row.status === 'active') {
    const data = JSON.parse(String(row.data)).data as Record<string, unknown>;
    if (typeof data.contactId === 'string') profileByContact.set(data.contactId, data);
  }
  const current = contacts.filter(row => row.id !== excludeContactId).map(row => {
    const data = JSON.parse(String(row.data)) as Record<string, unknown>;
    const profile = profileByContact.get(String(row.id));
    return { id: String(row.id), name: String(profile?.name ?? data.name ?? ''), email: String(profile?.email ?? data.email ?? '') };
  });
  if (email) {
    const match = current.find(item => item.email && normalized(item.email) === normalized(email));
    if (match) return { ...match, reason: 'email_match' };
  }
  const match = current.find(item => normalized(item.name) === normalized(name));
  return match ? { ...match, reason: 'name_match' } : undefined;
}
