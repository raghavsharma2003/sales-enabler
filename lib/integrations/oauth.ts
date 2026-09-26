import { createHash, randomBytes } from 'node:crypto';
import type { AuthUser } from '../server/auth';
import { db } from '../server/db';
import { HttpError } from '../server/http';
import { checkProvider, providerJson } from './adapters';
import { configureOAuthConnection, getConnection, openCredentials, replaceOAuthCredentials, sealCredentials, type ConnectorCredentials } from './vault';

export type OAuthProvider = 'google' | 'microsoft';
type OAuthIntegrationId = 'gmail' | 'google_calendar' | 'google_drive' | 'microsoft_mail' | 'microsoft_calendar' | 'microsoft_drive';
type Flow = { userId: string; integrationId: OAuthIntegrationId; provider: OAuthProvider; allowSend: boolean; expiresAt: string; sealedVerifier: string };
type Token = { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; scope?: unknown; token_type?: unknown };
const FLOW_KIND = 'integration:oauth_flow';
const FLOW_MINUTES = 10;
const SCOPES: Record<OAuthIntegrationId, string> = {
  gmail: 'https://www.googleapis.com/auth/gmail.readonly',
  google_calendar: 'https://www.googleapis.com/auth/calendar.events.readonly',
  google_drive: 'https://www.googleapis.com/auth/drive.readonly',
  microsoft_mail: 'Mail.Read',
  microsoft_calendar: 'Calendars.Read',
  microsoft_drive: 'Files.Read',
};
export const SEND_SCOPES = { google: 'https://www.googleapis.com/auth/gmail.send', microsoft: 'Mail.Send' } as const;

function integration(value: string): OAuthIntegrationId {
  if (Object.prototype.hasOwnProperty.call(SCOPES, value)) return value as OAuthIntegrationId;
  throw new HttpError(400, 'OAuth is unavailable for this integration.');
}
export function providerFor(integrationId: string): OAuthProvider {
  return integration(integrationId).startsWith('microsoft_') ? 'microsoft' : 'google';
}
function configuration(provider: OAuthProvider) {
  const prefix = provider === 'google' ? 'GOOGLE' : 'MICROSOFT';
  const clientId = process.env[`${prefix}_CLIENT_ID`], clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  const missing = [`${prefix}_CLIENT_ID`, `${prefix}_CLIENT_SECRET`].filter(name => !process.env[name]);
  if (!/^[a-fA-F0-9]{64}$/.test(process.env.CONNECTOR_ENCRYPTION_KEY || '')) missing.push('CONNECTOR_ENCRYPTION_KEY');
  if (process.env.NODE_ENV === 'production' && !process.env.APP_URL) missing.push('APP_URL');
  return { clientId, clientSecret, missing };
}
export function appOrigin(): string {
  const value = process.env.APP_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:3000');
  if (!value) throw new HttpError(503, 'APP_URL is required for OAuth.');
  let url: URL;
  try { url = new URL(value); } catch { throw new HttpError(503, 'APP_URL is invalid.'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
    throw new HttpError(503, 'APP_URL must be an HTTPS origin (or local development origin).');
  }
  return url.origin;
}
export function callbackUrl(): string { return `${appOrigin()}/api/integrations/oauth/callback`; }
export function oauthSetup() {
  const result = {} as Record<OAuthProvider, { ready: boolean; missing: string[]; callbackUrl: string }>;
  for (const provider of ['google', 'microsoft'] as const) {
    const config = configuration(provider);
    result[provider] = { ready: config.missing.length === 0, missing: config.missing, callbackUrl: callbackUrl() };
  }
  return { providers: result };
}
function endpoints(provider: OAuthProvider): { authorize: string; token: string } {
  if (provider === 'google') return { authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token' };
  const tenant = process.env.MICROSOFT_TENANT_ID || 'common';
  if (!/^(?:common|organizations|consumers|[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,126}[a-zA-Z0-9])?)$/.test(tenant) || tenant.includes('..')) throw new HttpError(503, 'Microsoft tenant configuration is invalid.');
  const base = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;
  return { authorize: `${base}/authorize`, token: `${base}/token` };
}
function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function challenge(verifier: string): string { return createHash('sha256').update(verifier).digest('base64url'); }
function requiredScopes(integrationId: OAuthIntegrationId, allowSend: boolean): string[] {
  const provider = providerFor(integrationId);
  return [SCOPES[integrationId], ...(allowSend ? [SEND_SCOPES[provider]] : []), ...(provider === 'microsoft' ? ['User.Read', 'offline_access'] : [])];
}
export function authorizeUrl(integrationId: string, allowSend: boolean, state: string, verifier: string): string {
  const id = integration(integrationId), provider = providerFor(id), config = configuration(provider);
  if (config.missing.length) throw new HttpError(503, `${provider === 'google' ? 'Google' : 'Microsoft'} OAuth is not configured.`);
  if (allowSend && !['gmail', 'microsoft_mail'].includes(id)) throw new HttpError(400, 'Send permission is only available for mail.');
  const url = new URL(endpoints(provider).authorize);
  url.searchParams.set('client_id', config.clientId!);
  url.searchParams.set('redirect_uri', callbackUrl());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  url.searchParams.set('scope', requiredScopes(id, allowSend).join(' '));
  url.searchParams.set('code_challenge', challenge(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  if (provider === 'google') {
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
  } else url.searchParams.set('response_mode', 'query');
  return url.href;
}
export async function startOAuth(user: AuthUser, integrationId: string, allowSend = false): Promise<{ authorizeUrl: string }> {
  const id = integration(integrationId), provider = providerFor(id);
  if (allowSend && !['gmail', 'microsoft_mail'].includes(id)) throw new HttpError(400, 'Send permission is only available for mail.');
  const state = randomBytes(32).toString('base64url'), verifier = randomBytes(48).toString('base64url');
  const url = authorizeUrl(id, allowSend, state, verifier), flowId = hash(`oauth:${state}`);
  const flow: Flow = { userId: user.id, integrationId: id, provider, allowSend,
    expiresAt: new Date(Date.now() + FLOW_MINUTES * 60_000).toISOString(),
    sealedVerifier: sealCredentials(user.organizationId, flowId, { token: verifier }) };
  const database = await db();
  await database.run('DELETE FROM entities WHERE kind = ? AND organization_id = ? AND created_at < ?', [FLOW_KIND, user.organizationId, new Date(Date.now() - 60 * 60_000).toISOString()]);
  await database.run('INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [flowId, user.organizationId, FLOW_KIND, 'pending', JSON.stringify(flow), new Date().toISOString()]);
  return { authorizeUrl: url };
}
export async function consumeFlow(user: AuthUser, state: string): Promise<{ flow: Flow; verifier: string }> {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(state)) throw new HttpError(400, 'Authorization could not be completed.');
  const id = hash(`oauth:${state}`), database = await db();
  const [row] = await database.all('SELECT data FROM entities WHERE id = ? AND kind = ? AND organization_id = ?', [id, FLOW_KIND, user.organizationId]);
  if (!row) throw new HttpError(400, 'Authorization has expired or was already used.');
  const flow = JSON.parse(String(row.data)) as Flow;
  // Delete before exchange. The exact-data predicate makes concurrent callbacks one-use.
  const deleted = await database.run('DELETE FROM entities WHERE id = ? AND kind = ? AND organization_id = ? AND data = ?', [id, FLOW_KIND, user.organizationId, String(row.data)]);
  if (deleted !== 1 || flow.userId !== user.id || Date.parse(flow.expiresAt) <= Date.now() || providerFor(flow.integrationId) !== flow.provider)
    throw new HttpError(400, 'Authorization has expired or was already used.');
  return { flow, verifier: openCredentials(user.organizationId, id, flow.sealedVerifier).token };
}
async function tokenRequest(provider: OAuthProvider, form: URLSearchParams): Promise<Token> {
  let response: Response;
  try { response = await fetch(endpoints(provider).token, { method: 'POST', body: form, headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000) }); }
  catch { throw new HttpError(502, 'OAuth token exchange failed.'); }
  if (!response.ok) throw new HttpError(502, 'OAuth token exchange failed.');
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > 64_000) throw new HttpError(502, 'OAuth token response was too large.');
  let body: Token;
  try {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('empty');
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 64_000) { await reader.cancel(); throw new Error('too large'); }
      chunks.push(part.value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Token;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid');
  } catch { throw new HttpError(502, 'OAuth token exchange failed.'); }
  return body;
}
function tokenCredentials(provider: OAuthProvider, token: Token, requested: string[], priorRefreshToken?: string, priorScopes?: string[]): ConnectorCredentials {
  if (typeof token.access_token !== 'string' || !token.access_token || token.token_type && String(token.token_type).toLowerCase() !== 'bearer')
    throw new HttpError(502, 'OAuth provider did not return a usable token.');
  const seconds = Number(token.expires_in);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 86400) throw new HttpError(502, 'OAuth provider did not return a valid expiry.');
  // Microsoft documents that an omitted scope means the initial request's scopes.
  const reported = typeof token.scope === 'string' ? token.scope.split(/\s+/).filter(Boolean) : provider === 'microsoft' ? requested : priorScopes || [];
  // Record only scopes this exact flow asked for; an unrelated prior grant must not enable sending.
  const scopes = requested.filter(scope => reported.includes(scope));
  if (!scopes.includes(requested[0])) throw new HttpError(502, 'OAuth provider did not grant the required read scope.');
  const refreshToken = typeof token.refresh_token === 'string' && token.refresh_token ? token.refresh_token : priorRefreshToken;
  if (!refreshToken) throw new HttpError(502, 'OAuth provider did not return a refresh token. Reconnect the account.');
  return { token: token.access_token, refreshToken, expiresAt: new Date(Date.now() + seconds * 1000).toISOString(), scopes, oauthProvider: provider };
}
async function mailboxBinding(integrationId: string, token: string): Promise<string | undefined> {
  if (integrationId === 'gmail') {
    const profile = await providerJson('https://gmail.googleapis.com/gmail/v1/users/me/profile', { Authorization: `Bearer ${token}`, Accept: 'application/json' });
    const email = typeof profile.emailAddress === 'string' ? profile.emailAddress.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(409, 'OAuth mailbox identity could not be verified.');
    return `google:${email}`;
  }
  if (integrationId === 'microsoft_mail') {
    const profile = await providerJson('https://graph.microsoft.com/v1.0/me?$select=id', { Authorization: `Bearer ${token}`, Accept: 'application/json' });
    const id = typeof profile.id === 'string' ? profile.id.trim().toLowerCase() : '';
    if (!/^[a-z0-9-]{2,100}$/.test(id)) throw new HttpError(409, 'OAuth mailbox identity could not be verified.');
    return `microsoft:${id}`;
  }
  return undefined;
}
export async function completeOAuth(user: AuthUser, state: string, code: string): Promise<void> {
  const { flow, verifier } = await consumeFlow(user, state);
  if (!code || code.length > 4096 || /[\r\n]/.test(code)) throw new HttpError(400, 'Authorization could not be completed.');
  const config = configuration(flow.provider);
  if (config.missing.length) throw new HttpError(503, 'OAuth is not configured.');
  const requested = requiredScopes(flow.integrationId, flow.allowSend);
  const form = new URLSearchParams({ client_id: config.clientId!, client_secret: config.clientSecret!, code, code_verifier: verifier,
    redirect_uri: callbackUrl(), grant_type: 'authorization_code' });
  const credentials = tokenCredentials(flow.provider, await tokenRequest(flow.provider, form), requested);
  // A provider check must succeed before a connection becomes usable.
  await checkProvider(flow.integrationId, credentials);
  credentials.accountBinding = await mailboxBinding(flow.integrationId, credentials.token);
  await configureOAuthConnection(user, flow.integrationId, credentials);
}
export async function getUsableCredentials(user: AuthUser, integrationId: string): Promise<{ credentials: ConnectorCredentials; revision: number }> {
  const current = await getConnection(user, integrationId);
  let credentials = openCredentials(user.organizationId, current.id, current.sealed);
  if (!credentials.oauthProvider || !credentials.expiresAt) return { credentials, revision: current.revision };
  if (Date.parse(credentials.expiresAt) > Date.now() + 60_000) return { credentials, revision: current.revision };
  if (!credentials.refreshToken) throw new HttpError(409, 'OAuth authorization has expired. Reconnect the account.');
  const provider = credentials.oauthProvider, config = configuration(provider);
  if (config.missing.length) throw new HttpError(503, 'OAuth is not configured.');
  const requested = requiredScopes(integration(integrationId), credentials.scopes?.includes(SEND_SCOPES[provider]) || false);
  const form = new URLSearchParams({ client_id: config.clientId!, client_secret: config.clientSecret!, grant_type: 'refresh_token', refresh_token: credentials.refreshToken });
  if (provider === 'microsoft') form.set('scope', requested.join(' '));
  try { credentials = tokenCredentials(provider, await tokenRequest(provider, form), requested, credentials.refreshToken, credentials.scopes); }
  catch { throw new HttpError(409, 'OAuth access could not be renewed. Retry or reconnect the account.'); }
  try { credentials.accountBinding = await mailboxBinding(integrationId, credentials.token); }
  catch { throw new HttpError(409, 'OAuth mailbox identity could not be verified after refresh. Retry or reconnect.'); }
  try {
    const updated = await replaceOAuthCredentials(user, integrationId, credentials, current.revision);
    return { credentials, revision: updated.revision };
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 409) throw error;
    const fresh = await getConnection(user, integrationId);
    const replacement = openCredentials(user.organizationId, fresh.id, fresh.sealed);
    if (replacement.expiresAt && Date.parse(replacement.expiresAt) > Date.now() + 60_000) return { credentials: replacement, revision: fresh.revision };
    throw error;
  }
}
