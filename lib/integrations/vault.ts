import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { db, WriteConflictError } from '../server/db';
import type { AuthUser } from '../server/auth';
import { HttpError } from '../server/http';
import { availableIntegration } from './catalog';
import { requireWorkspaceOwner as requireTeamOwner } from '../team/service';

export type ConnectorCredentials = { token: string; subdomain?: string; email?: string; channelId?: string; phoneNumberId?: string; appSecret?: string; verifyToken?: string; webhookSecret?: string; instanceHost?: string; teamId?: string; spaceId?: string; folderPath?: string; sendPermission?: string; refreshToken?: string; expiresAt?: string; scopes?: string[]; oauthProvider?: 'google' | 'microsoft'; accountBinding?: string };
export type ConnectionView = { id: string; integrationId: string; status: 'needs_setup' | 'connected' | 'error'; createdAt: string; updatedAt: string; checkedAt?: string; lastSyncAt?: string; lastSyncCount?: number; error?: string; settings: Record<string, string>; webhookPath?: string };
type Stored = ConnectionView & { sealed: string; revision: number; authorizationVersion?: string };
const kind = 'integration:vault';

function key(): Buffer {
  const raw = process.env.CONNECTOR_ENCRYPTION_KEY;
  if (!raw || !/^[a-fA-F0-9]{64}$/.test(raw)) throw new HttpError(503, 'Connector encryption is not configured.');
  return Buffer.from(raw, 'hex');
}
function aad(tenantId: string, id: string): Buffer { return Buffer.from(`${tenantId}:${id}`); }
export function sealCredentials(tenantId: string, id: string, credentials: ConnectorCredentials): string {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(aad(tenantId, id));
  const data = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}
export function openCredentials(tenantId: string, id: string, sealed: string): ConnectorCredentials {
  try {
    const [version, iv, tag, data] = sealed.split('.');
    if (version !== 'v1') throw new Error('version');
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAAD(aad(tenantId, id)); decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')) as ConnectorCredentials;
  } catch { throw new HttpError(503, 'Connector credential could not be opened.'); }
}
function view(value: Stored): ConnectionView {
  const { sealed: _sealed, revision: _revision, authorizationVersion: _authorizationVersion, ...safe } = value;
  return safe;
}
export async function requireWorkspaceOwner(user: AuthUser): Promise<void> {
  await requireTeamOwner(user);
}
export async function listConnections(user: AuthUser): Promise<ConnectionView[]> {
  const rows = await (await db()).all('SELECT data FROM entities WHERE organization_id = ? AND kind = ? ORDER BY created_at ASC', [user.organizationId, kind]);
  return rows.map(row => view(JSON.parse(String(row.data)) as Stored));
}
export async function getConnection(user: AuthUser, integrationId: string): Promise<Stored> {
  const [row] = await (await db()).all('SELECT data FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [connectionKey(user.organizationId, integrationId), user.organizationId, kind]);
  if (!row) throw new HttpError(404, 'Integration is not configured.');
  return JSON.parse(String(row.data)) as Stored;
}
export function connectionKey(tenantId: string, integrationId: string): string {
  return createHash('sha256').update(`${tenantId}:${integrationId}`).digest('hex');
}
export function validateCredentials(integrationId: string, input: unknown): ConnectorCredentials {
  availableIntegration(integrationId);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Credential fields are required.');
  const value = input as Record<string, unknown>;
  const string = (name: string, max: number) => typeof value[name] === 'string' && String(value[name]).length <= max ? String(value[name]).trim() : '';
  const token = string('token', 8192);
  if (token.length < (integrationId === 'generic_webhook' ? 32 : 8) || /[\r\n]/.test(token)) throw new HttpError(400, 'A valid token or webhook secret is required.');
  const credentials: ConnectorCredentials = { token };
  if (integrationId === 'telegram') {
    const webhookSecret = string('webhookSecret', 256);
    if (!/^\d{6,20}:[A-Za-z0-9_-]{20,100}$/.test(token)) throw new HttpError(400, 'Provide a Telegram bot token issued by BotFather.');
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(webhookSecret)) throw new HttpError(400, 'Use a private webhook secret of 32–256 letters, numbers, underscores or hyphens.');
    credentials.webhookSecret = webhookSecret;
  }
  if (integrationId === 'zendesk') {
    const subdomain = string('subdomain', 63).toLowerCase(), email = string('email', 254);
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Zendesk subdomain and agent email are required.');
    credentials.subdomain = subdomain; credentials.email = email;
  }
  if (integrationId === 'slack') {
    const channelId = string('channelId', 32);
    if (!/^[CGD][A-Z0-9]{8,}$/.test(channelId)) throw new HttpError(400, 'A Slack channel ID is required.');
    credentials.channelId = channelId;
  }
  if (integrationId === 'whatsapp_cloud') {
    const phoneNumberId = string('phoneNumberId', 32);
    if (!/^\d{6,32}$/.test(phoneNumberId)) throw new HttpError(400, 'A WhatsApp phone number ID is required.');
    credentials.phoneNumberId = phoneNumberId;
    const appSecret = string('appSecret', 256), verifyToken = string('verifyToken', 256);
    if (appSecret || verifyToken) {
      if (!/^[a-fA-F0-9]{32,256}$/.test(appSecret) || !/^[A-Za-z0-9._~-]{32,256}$/.test(verifyToken)) throw new HttpError(400, 'Provide the Meta app secret and a private webhook verification token of at least 32 characters.');
      credentials.appSecret = appSecret; credentials.verifyToken = verifyToken;
    }
  }
  if (integrationId === 'salesforce') {
    const instanceHost = string('instanceHost', 120).toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.my\.salesforce\.com$/.test(instanceHost)) throw new HttpError(400, 'Enter a Salesforce instance host under my.salesforce.com.');
    credentials.instanceHost = instanceHost;
  }
  if (integrationId === 'teams') {
    const teamId = string('teamId', 36), channelId = string('channelId', 100);
    if (!/^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/.test(teamId) || !/^19:[A-Za-z0-9._-]{8,80}@thread\.tacv2$/.test(channelId)) throw new HttpError(400, 'A Teams team ID and channel ID are required.');
    credentials.teamId = teamId; credentials.channelId = channelId;
  }
  if (integrationId === 'google_chat') {
    const spaceId = string('spaceId', 100);
    if (!/^spaces\/[A-Za-z0-9_-]{2,80}$/.test(spaceId)) throw new HttpError(400, 'A Google Chat space ID is required.');
    credentials.spaceId = spaceId;
  }
  if (integrationId === 'dropbox') {
    const folderPath = string('folderPath', 300);
    if (!/^\/(?!\/)(?:[^\\/%\u0000-\u001f]+)(?:\/[^\\/%\u0000-\u001f]+)*$/.test(folderPath) || folderPath.split('/').some(part => part === '.' || part === '..')) throw new HttpError(400, 'A non-root Dropbox folder path is required.');
    credentials.folderPath = folderPath;
  }
  const sendPermission = string('sendPermission', 100);
  if (sendPermission) {
    const expected = integrationId === 'gmail' ? 'https://www.googleapis.com/auth/gmail.send' : integrationId === 'microsoft_mail' ? 'Mail.Send' : '';
    if (sendPermission !== expected) throw new HttpError(400, 'Send permission is not valid for this integration.');
    credentials.sendPermission = sendPermission;
  }
  return credentials;
}
export async function configureConnection(user: AuthUser, integrationId: string, credentials: ConnectorCredentials, options?: { verifiedOAuth?: boolean }): Promise<ConnectionView> {
  const database = await db(), id = connectionKey(user.organizationId, integrationId), now = new Date().toISOString();
  const [row] = await database.all('SELECT data FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [id, user.organizationId, kind]);
  const previous = row ? JSON.parse(String(row.data)) as Stored : undefined;
  const settings = Object.fromEntries(['subdomain', 'email', 'channelId', 'phoneNumberId', 'instanceHost', 'teamId', 'spaceId', 'folderPath', 'sendPermission'].map(name => [name, credentials[name as keyof ConnectorCredentials]]).filter(([, value]) => typeof value === 'string' && value)) as Record<string, string>;
  if (options?.verifiedOAuth) settings.authorization = 'oauth';
  // A fresh credential configuration is a new authority, even when the provider
  // row ID is reused after disconnect. Row revision remains a separate CAS fence.
  const current: Stored = { id, integrationId, status: options?.verifiedOAuth ? 'connected' : 'needs_setup', createdAt: previous?.createdAt || now, updatedAt: now, settings, sealed: sealCredentials(user.organizationId, id, credentials), revision: (previous?.revision || 0) + 1, authorizationVersion: randomUUID(),
    ...(options?.verifiedOAuth ? { checkedAt: now } : {}),
    ...(integrationId === 'generic_webhook' ? { webhookPath: `/api/integrations/webhook/${id}` } : {}),
    ...(integrationId === 'whatsapp_cloud' && credentials.appSecret && credentials.verifyToken ? { webhookPath: `/api/integrations/whatsapp/webhook/${id}` } : {}) };
  try {
    if (previous) await database.batch([{ sql: 'UPDATE entities SET data = ?, status = ? WHERE id = ? AND organization_id = ? AND kind = ? AND data = ?', params: [JSON.stringify(current), current.status, id, user.organizationId, kind, String(row!.data)], expectedChanges: 1 }]);
    else await database.run('INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, user.organizationId, kind, current.status, JSON.stringify(current), now]);
  } catch (error) { if (error instanceof WriteConflictError) throw new HttpError(409, 'Connection changed. Refresh and retry.'); throw error; }
  return view(current);
}
export async function configureOAuthConnection(user: AuthUser, integrationId: string, credentials: ConnectorCredentials): Promise<ConnectionView> {
  const provider = integrationId.startsWith('google_') || integrationId === 'gmail' ? 'google' : integrationId.startsWith('microsoft_') ? 'microsoft' : '';
  if (!provider || credentials.oauthProvider !== provider || !credentials.token || !credentials.refreshToken || !credentials.expiresAt || !Array.isArray(credentials.scopes)) throw new HttpError(400, 'Verified OAuth credentials are incomplete.');
  if (['gmail', 'microsoft_mail'].includes(integrationId) && (!credentials.accountBinding || !credentials.accountBinding.startsWith(`${provider}:`))) throw new HttpError(400, 'Verified mailbox account binding is required.');
  const expected = integrationId === 'gmail' ? 'https://www.googleapis.com/auth/gmail.send' : integrationId === 'microsoft_mail' ? 'Mail.Send' : '';
  const checked: ConnectorCredentials = { ...credentials, sendPermission: expected && credentials.scopes.includes(expected) ? expected : undefined };
  return configureConnection(user, integrationId, checked, { verifiedOAuth: true });
}
export async function replaceOAuthCredentials(user: AuthUser, integrationId: string, credentials: ConnectorCredentials, expectedRevision: number): Promise<ConnectionView & { revision: number }> {
  const database = await db(), id = connectionKey(user.organizationId, integrationId);
  const [row] = await database.all('SELECT data FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [id, user.organizationId, kind]);
  if (!row) throw new HttpError(404, 'Integration is not configured.');
  const previous = JSON.parse(String(row.data)) as Stored;
  if (previous.revision !== expectedRevision || previous.settings.authorization !== 'oauth') throw new HttpError(409, 'Connection changed. Refresh and retry.');
  const old = openCredentials(user.organizationId, id, previous.sealed);
  if (credentials.oauthProvider !== old.oauthProvider || !credentials.token || !Array.isArray(credentials.scopes) || !credentials.expiresAt) throw new HttpError(400, 'OAuth refresh response is incomplete.');
  const mail = integrationId === 'gmail' || integrationId === 'microsoft_mail';
  if (mail && (!credentials.accountBinding || !credentials.accountBinding.startsWith(`${old.oauthProvider}:`))) throw new HttpError(400, 'Verified mailbox account binding is required.');
  if (mail && old.accountBinding && credentials.accountBinding !== old.accountBinding) throw new HttpError(409, 'OAuth mailbox account changed. Reconnect and review campaigns.');
  const nextCredentials = { ...credentials, refreshToken: credentials.refreshToken || old.refreshToken };
  if (!nextCredentials.refreshToken) throw new HttpError(503, 'OAuth refresh token is unavailable.');
  const sendPermission = previous.settings.sendPermission;
  const settings = { ...previous.settings };
  if (sendPermission && !nextCredentials.scopes?.includes(sendPermission)) delete settings.sendPermission;
  const sameScopes = JSON.stringify([...(old.scopes || [])].sort()) === JSON.stringify([...(nextCredentials.scopes || [])].sort());
  const sameGrant = old.oauthProvider === nextCredentials.oauthProvider && sameScopes && settings.sendPermission === previous.settings.sendPermission &&
    (!mail || Boolean(old.accountBinding && nextCredentials.accountBinding === old.accountBinding));
  const next: Stored = { ...previous, settings, sealed: sealCredentials(user.organizationId, id, nextCredentials), revision: previous.revision + 1,
    authorizationVersion: sameGrant && previous.authorizationVersion ? previous.authorizationVersion : randomUUID(), updatedAt: new Date().toISOString() };
  try { await database.batch([{ sql: 'UPDATE entities SET data = ? WHERE id = ? AND organization_id = ? AND kind = ? AND data = ?', params: [JSON.stringify(next), id, user.organizationId, kind, String(row.data)], expectedChanges: 1 }]); }
  catch (error) { if (error instanceof WriteConflictError) throw new HttpError(409, 'Connection changed. Refresh and retry.'); throw error; }
  return { ...view(next), revision: next.revision };
}
export async function updateConnection(user: AuthUser, integrationId: string, changes: Partial<ConnectionView>, expectedRevision?: number): Promise<ConnectionView> {
  const database = await db(), id = connectionKey(user.organizationId, integrationId);
  const [row] = await database.all('SELECT data FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [id, user.organizationId, kind]);
  if (!row) throw new HttpError(404, 'Integration is not configured.');
  const previous = JSON.parse(String(row.data)) as Stored;
  if (expectedRevision !== undefined && previous.revision !== expectedRevision) throw new HttpError(409, 'Connection changed. Refresh and retry.');
  const changedSettings = changes.settings !== undefined && JSON.stringify(changes.settings) !== JSON.stringify(previous.settings);
  const next: Stored = { ...previous, ...changes, id, integrationId, sealed: previous.sealed, revision: previous.revision + 1,
    authorizationVersion: changedSettings ? randomUUID() : previous.authorizationVersion, updatedAt: new Date().toISOString() };
  try { await database.batch([{ sql: 'UPDATE entities SET data = ?, status = ? WHERE id = ? AND organization_id = ? AND kind = ? AND data = ?', params: [JSON.stringify(next), next.status, id, user.organizationId, kind, String(row.data)], expectedChanges: 1 }]); }
  catch (error) { if (error instanceof WriteConflictError) throw new HttpError(409, 'Connection changed. Refresh and retry.'); throw error; }
  return view(next);
}
export async function disconnectConnection(user: AuthUser, integrationId: string): Promise<void> {
  const id = connectionKey(user.organizationId, integrationId);
  await (await db()).run('DELETE FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [id, user.organizationId, kind]);
}
export async function webhookConnection(id: string): Promise<{ tenantId: string; value: Stored }> {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new HttpError(404, 'Webhook not found.');
  const [row] = await (await db()).all('SELECT organization_id, data FROM entities WHERE id = ? AND kind = ?', [id, kind]);
  if (!row) throw new HttpError(404, 'Webhook not found.');
  const value = JSON.parse(String(row.data)) as Stored;
  if (value.integrationId !== 'generic_webhook' || value.status !== 'connected') throw new HttpError(404, 'Webhook not found.');
  return { tenantId: String(row.organization_id), value };
}
