import { randomUUID } from 'node:crypto';
import { db, WriteConflictError } from '../server/db';
import type { AuthUser } from '../server/auth';
import { HttpError } from '../server/http';
import type { PlatformRecord } from './contracts';
export type { PlatformRecord } from './contracts';

const prefix = 'platform:';
function decode<T>(row: Record<string, unknown>): PlatformRecord<T> {
  const stored = JSON.parse(String(row.data));
  return { id: String(row.id), kind: String(row.kind).slice(prefix.length), status: String(row.status), createdAt: String(row.created_at), updatedAt: stored.updatedAt, revision: stored.revision, data: stored.data };
}
export async function listRecords<T = Record<string, unknown>>(organizationId: string, kind?: string): Promise<PlatformRecord<T>[]> {
  const rows = kind
    ? await (await db()).all('SELECT * FROM entities WHERE organization_id = ? AND kind = ? ORDER BY created_at DESC, id DESC', [organizationId, prefix + kind])
    : await (await db()).all('SELECT * FROM entities WHERE organization_id = ? AND kind LIKE ? ORDER BY created_at DESC, id DESC', [organizationId, prefix + '%']);
  return rows.map(row => decode<T>(row));
}
export async function getRecord<T = Record<string, unknown>>(organizationId: string, kind: string, id: string): Promise<PlatformRecord<T>> {
  const [row] = await (await db()).all('SELECT * FROM entities WHERE organization_id = ? AND kind = ? AND id = ?', [organizationId, prefix + kind, id]);
  if (!row) throw new HttpError(404, 'Record not found in this workspace.');
  return decode<T>(row);
}
export async function createRecord<T = Record<string, unknown>>(user: AuthUser, kind: string, data: T, status = 'draft'): Promise<PlatformRecord<T>> {
  const id = randomUUID(), now = new Date().toISOString();
  const stored = { revision: 1, updatedAt: now, data };
  await (await db()).batch([
    { sql: 'INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [id, user.organizationId, prefix + kind, status, JSON.stringify(stored), now] },
    { sql: 'INSERT INTO audit_events (id, organization_id, user_id, entity_id, event, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [randomUUID(), user.organizationId, user.id, id, `${kind}.created`, now] },
  ]);
  return { id, kind, status, revision: 1, createdAt: now, updatedAt: now, data };
}
export async function updateRecord<T = Record<string, unknown>>(user: AuthUser, current: PlatformRecord<T>, data: T, status = current.status): Promise<PlatformRecord<T>> {
  const database = await db();
  const [row] = await database.all('SELECT data, status FROM entities WHERE organization_id = ? AND kind = ? AND id = ?', [user.organizationId, prefix + current.kind, current.id]);
  if (!row) throw new HttpError(404, 'Record not found in this workspace.');
  const before = JSON.parse(String(row.data));
  if (before.revision !== current.revision || row.status !== current.status) throw new HttpError(409, 'This record changed. Refresh and try again.');
  const now = new Date().toISOString();
  const stored = { revision: current.revision + 1, updatedAt: now, data };
  try {
    await database.batch([
      { sql: 'UPDATE entities SET data = ?, status = ? WHERE id = ? AND organization_id = ? AND kind = ? AND data = ? AND status = ?', params: [JSON.stringify(stored), status, current.id, user.organizationId, prefix + current.kind, String(row.data), current.status], expectedChanges: 1 },
      { sql: 'INSERT INTO audit_events (id, organization_id, user_id, entity_id, event, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [randomUUID(), user.organizationId, user.id, current.id, `${current.kind}.updated:${status}:r${stored.revision}`, now] },
    ]);
  } catch (error) { if (error instanceof WriteConflictError) throw new HttpError(409, 'This record changed. Refresh and try again.'); throw error; }
  return { ...current, status, revision: stored.revision, updatedAt: now, data };
}
