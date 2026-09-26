import { db, WriteConflictError, type Database } from '../server/db';
import { privateDigest } from './crypto';
type Statement = Parameters<Database['batch']>[0][number];
/** Forwarded addresses are trusted only after an operator selects an ingress-overwritten header. */
export async function allowAccountAttempt(email: string, request: Request): Promise<boolean> {
  const database = await db(), time = Date.now(), window = Math.floor(time / 3600000);
  const header = process.env.AUTH_TRUSTED_IP_HEADER;
  const ip = header && /^[a-z0-9-]+$/.test(header) ? (request.headers.get(header) || 'unknown').slice(0, 160) : 'shared-ingress';
  const keys: [string, number][] = [[`global:${window}`, 200], [`ip:${window}:${privateDigest(ip)}`, 30], [`email:${window}:${privateDigest(email)}`, 5]];
  // Global reservation comes first: at most 600 current-window rows can be introduced.
  await database.run('DELETE FROM service_heartbeats WHERE service = ? AND updated_at < ?', ['auth:limit', new Date(time - 7200000).toISOString()]);
  for (let retry = 0; retry < 4; retry++) {
    const statements: Statement[] = [];
    for (const [key, limit] of keys) {
      const id = `auth:limit:${key}`, [row] = await database.all('SELECT status FROM service_heartbeats WHERE id = ?', [id]);
      const count = row ? Number(row.status) : 0;
      if (count >= limit) return false;
      statements.push(row ? { sql: 'UPDATE service_heartbeats SET status = ?, updated_at = ? WHERE id = ? AND status = ?', params: [String(count + 1), new Date(time).toISOString(), id, String(count)], expectedChanges: 1 } : { sql: 'INSERT INTO service_heartbeats (id, service, status, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING', params: [id, 'auth:limit', '1', new Date(time).toISOString()], expectedChanges: 1 });
    }
    try { await database.batch(statements); return true; } catch (error) { if (!(error instanceof WriteConflictError)) throw error; }
  }
  return false;
}
