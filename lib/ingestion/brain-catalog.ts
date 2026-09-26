import { createHash } from 'node:crypto';
import type { Database } from '../server/db';
import { HttpError } from '../server/http';

/** Every canonical brain-source writer advances this tenant row in its own transaction. */
export async function brainCatalogGuard(database: Database, organizationId: string): Promise<Parameters<Database['batch']>[0][number]> {
  const id = `brain-catalog:${createHash('sha256').update(organizationId).digest('hex')}`;
  const now = new Date().toISOString();
  await database.run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT (id) DO NOTHING',
    [id, organizationId, 'internal:brain_catalog', 'active', JSON.stringify({ revision: 0 }), now]);
  const [row] = await database.all('SELECT data,status FROM entities WHERE id=? AND organization_id=? AND kind=?', [id, organizationId, 'internal:brain_catalog']);
  if (!row || row.status !== 'active') throw new HttpError(409, 'Company brain catalog changed. Refresh and review again.');
  const prior = JSON.parse(String(row.data));
  if (!Number.isSafeInteger(prior.revision) || prior.revision < 0) throw new HttpError(409, 'Company brain catalog is invalid.');
  return {
    sql: 'UPDATE entities SET data=? WHERE id=? AND organization_id=? AND kind=? AND status=? AND data=?',
    params: [JSON.stringify({ revision: prior.revision + 1 }), id, organizationId, 'internal:brain_catalog', 'active', String(row.data)],
    expectedChanges: 1,
  };
}
