// How a phone number is fingerprinted once a person is erased. Tombstones and post-erasure suppressions store only
// HMAC-SHA256(per-workspace salt, E.164); the salt lives in intake_salt (migration 0101) and never leaves the server.
// Every module that writes or checks such a hash uses these functions, so an erased person always matches.
import { createHmac, randomBytes } from 'node:crypto';
import { one, type Queryable } from './db.ts';

export async function workspaceSalt(q: Queryable, ws: string): Promise<string> {
  await q.query('INSERT INTO intake_salt (workspace_id, salt) VALUES ($1,$2) ON CONFLICT DO NOTHING', [ws, randomBytes(32).toString('hex')]);
  return (await one<{ salt: string }>(q, 'SELECT salt FROM intake_salt WHERE workspace_id = $1', [ws]))!.salt;
}

export const hashWith = (salt: string, e164: string): string => createHmac('sha256', salt).update(e164).digest('hex');

export async function numberHash(q: Queryable, ws: string, e164: string): Promise<string> {
  return hashWith(await workspaceSalt(q, ws), e164);
}
