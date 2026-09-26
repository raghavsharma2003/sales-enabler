import { createHash } from 'node:crypto';
import type { AuthUser } from '../server/auth';
import { db } from '../server/db';
import { HttpError } from '../server/http';
import { createIngestionSource } from '../ingestion/engine';
import { checkProvider, checkTelegramIdentity, pullProvider } from './adapters';
import { availableIntegration } from './catalog';
import { configureConnection, disconnectConnection, getConnection, updateConnection, validateCredentials, type ConnectionView } from './vault';
import { getUsableCredentials } from './oauth';
import { activeWorkspaceOwner } from '../team/service';

function marker(tenantId: string, integrationId: string, externalId: string, updatedAt?: string): string {
  return createHash('sha256').update(JSON.stringify([tenantId, integrationId, externalId, updatedAt || ''])).digest('hex');
}
async function claim(tenantId: string, id: string): Promise<boolean> {
  try {
    await (await db()).run('INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, tenantId, 'integration:sync_item', 'pending', '{}', new Date().toISOString()]);
    return true;
  } catch {
    const [row] = await (await db()).all('SELECT id FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [id, tenantId, 'integration:sync_item']);
    if (row) return false;
    throw new HttpError(503, 'Could not reserve imported item.');
  }
}
export async function configure(user: AuthUser, integrationId: string, input: unknown): Promise<ConnectionView> {
  availableIntegration(integrationId);
  return configureConnection(user, integrationId, validateCredentials(integrationId, input));
}
export async function check(user: AuthUser, integrationId: string): Promise<ConnectionView> {
  availableIntegration(integrationId);
  const current = await getConnection(user, integrationId);
  let expectedRevision = current.revision;
  try {
    const usable = await getUsableCredentials(user, integrationId);
    expectedRevision = usable.revision;
    const identity = integrationId === 'telegram' ? await checkTelegramIdentity(usable.credentials) : undefined;
    if (!identity) await checkProvider(integrationId, usable.credentials);
    return updateConnection(user, integrationId, { status: 'connected', checkedAt: new Date().toISOString(), error: undefined, ...(identity ? { settings: { ...current.settings, ...identity } } : {}) }, expectedRevision);
  } catch (error) {
    if (error instanceof HttpError && error.status === 409) throw error;
    const message = error instanceof HttpError ? error.message : 'Connection check failed.';
    const fresh = await getConnection(user, integrationId);
    if (fresh.revision !== expectedRevision) throw new HttpError(409, 'Connection changed. Refresh and retry.');
    await updateConnection(user, integrationId, { status: 'error', checkedAt: new Date().toISOString(), error: message }, expectedRevision);
    throw new HttpError(error instanceof HttpError ? error.status : 502, message);
  }
}
export async function sync(user: AuthUser, integrationId: string): Promise<{ connection: ConnectionView; staged: number; skipped: number; sourceIds: string[] }> {
  availableIntegration(integrationId);
  if (['generic_webhook', 'whatsapp_cloud', 'telegram'].includes(integrationId)) throw new HttpError(400, 'This integration has no pull sync.');
  const current = await getConnection(user, integrationId);
  if (current.status !== 'connected') throw new HttpError(409, 'Check the connection before syncing.');
  const usable = await getUsableCredentials(user, integrationId);
  const credentials = usable.credentials;
  const external = await pullProvider(integrationId, credentials);
  let staged = 0, skipped = 0; const sourceIds: string[] = [];
  for (const item of external.slice(0, 15)) {
    const fresh = await getConnection(user, integrationId);
    if (fresh.revision !== usable.revision || fresh.status !== 'connected') throw new HttpError(409, 'Connection changed during sync. Retry with the current connection.');
    const id = marker(user.organizationId, integrationId, item.id, item.updatedAt);
    if (!await claim(user.organizationId, id)) { skipped++; continue; }
    try {
      const full = JSON.stringify({ provider: integrationId, externalId: item.id, observedAt: new Date().toISOString(), sourceUpdatedAt: item.updatedAt || null, content: item.data });
      const text = full.length <= 200_000 ? full : JSON.stringify({ provider: integrationId, externalId: item.id, truncated: true, contentExcerpt: full.slice(0, 180_000) });
      const source = await createIngestionSource(user, { title: `${integrationId}: ${item.title}`.slice(0, 200), text, kind: 'webhook', format: 'json' });
      await (await db()).run('UPDATE entities SET status = ?, data = ? WHERE id = ? AND organization_id = ? AND kind = ?', ['staged', JSON.stringify({ sourceId: source.id }), id, user.organizationId, 'integration:sync_item']);
      sourceIds.push(source.id); staged++;
    } catch (error) {
      await (await db()).run('DELETE FROM entities WHERE id = ? AND organization_id = ? AND kind = ? AND status = ?', [id, user.organizationId, 'integration:sync_item', 'pending']);
      throw error;
    }
  }
  const connection = await updateConnection(user, integrationId, { lastSyncAt: new Date().toISOString(), lastSyncCount: staged }, usable.revision);
  return { connection, staged, skipped, sourceIds };
}
export async function disconnect(user: AuthUser, integrationId: string): Promise<{ disconnected: true }> {
  availableIntegration(integrationId);
  await disconnectConnection(user, integrationId);
  return { disconnected: true };
}
export async function stageWebhook(user: AuthUser, connectionId: string, revision: number, eventId: string, body: string): Promise<{ accepted: boolean; sourceId?: string }> {
  const current = await getConnection(user, 'generic_webhook');
  if (current.id !== connectionId || current.revision !== revision || current.status !== 'connected') throw new HttpError(409, 'Webhook connection changed.');
  const id = marker(user.organizationId, `webhook:${connectionId}`, eventId);
  if (!await claim(user.organizationId, id)) return { accepted: false };
  try {
    const fresh = await getConnection(user, 'generic_webhook');
    if (fresh.revision !== revision || fresh.status !== 'connected') throw new HttpError(409, 'Webhook connection changed.');
    const source = await createIngestionSource(user, { title: `Webhook event ${eventId}`.slice(0, 200), text: body, kind: 'webhook', format: 'json' });
    await (await db()).run('UPDATE entities SET status = ?, data = ? WHERE id = ? AND organization_id = ? AND kind = ?', ['staged', JSON.stringify({ sourceId: source.id }), id, user.organizationId, 'integration:sync_item']);
    return { accepted: true, sourceId: source.id };
  } catch (error) {
    await (await db()).run('DELETE FROM entities WHERE id = ? AND organization_id = ? AND kind = ? AND status = ?', [id, user.organizationId, 'integration:sync_item', 'pending']);
    throw error;
  }
}
export async function webhookActor(tenantId: string): Promise<AuthUser> {
  return activeWorkspaceOwner(tenantId);
}
