import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticate } from '../lib/server/auth';
import { db } from '../lib/server/db';
import { authorizeUrl, callbackUrl, consumeFlow, oauthSetup, startOAuth, completeOAuth, getUsableCredentials } from '../lib/integrations/oauth';
import { getConnection, openCredentials } from '../lib/integrations/vault';
import { GET as callback } from '../app/api/integrations/oauth/callback/route';
import { POST as start } from '../app/api/integrations/oauth/start/route';

process.env.SQLITE_PATH = ':memory:';
process.env.CONNECTOR_ENCRYPTION_KEY = '73'.repeat(32);
process.env.APP_URL = 'http://127.0.0.1:3000';
process.env.GOOGLE_CLIENT_ID = 'google-client.test';
process.env.GOOGLE_CLIENT_SECRET = 'private-google-secret';
process.env.MICROSOFT_CLIENT_ID = 'microsoft-client.test';
process.env.MICROSOFT_CLIENT_SECRET = 'private-microsoft-secret';
const status = (n: number) => (error: unknown) => Boolean(error && typeof error === 'object' && 'status' in error && error.status === n);
const request = () => new Request('http://127.0.0.1:3000/');
async function owner(name: string) {
  return authenticate({ mode: 'register', email: `${name}@example.test`, password: 'correct password' }, request());
}

test('setup reports provider readiness and only fixed callback URLs', () => {
  const setup = oauthSetup();
  assert.equal(setup.providers.google.ready, true);
  assert.equal(setup.providers.microsoft.ready, true);
  assert.equal(setup.providers.google.callbackUrl, callbackUrl());
  assert.equal(JSON.stringify(setup).includes('private-google-secret'), false);
  assert.throws(() => authorizeUrl('hubspot', false, 'state', 'verifier'), status(400));
  const google = new URL(authorizeUrl('gmail', false, 'state', 'verifier'));
  assert.equal(google.origin, 'https://accounts.google.com');
  assert.equal(google.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(google.searchParams.get('redirect_uri'), callbackUrl());
  assert.equal(google.searchParams.get('scope')?.includes('gmail.send'), false);
  const microsoft = new URL(authorizeUrl('microsoft_mail', true, 'state', 'verifier'));
  assert.equal(microsoft.origin, 'https://login.microsoftonline.com');
  assert.match(microsoft.searchParams.get('scope') || '', /Mail\.Read Mail\.Send User\.Read offline_access/);
});

test('state and PKCE verifier are sealed, bound to owner and tenant, expiring and one-use', async () => {
  const a = (await owner('oauth-flow-a')).user, b = (await owner('oauth-flow-b')).user;
  const { authorizeUrl: url } = await startOAuth(a, 'google_calendar');
  const state = new URL(url).searchParams.get('state')!;
  const [row] = await (await db()).all('SELECT data FROM entities WHERE kind = ? AND organization_id = ?', ['integration:oauth_flow', a.organizationId]);
  const saved = String(row.data);
  assert.equal(saved.includes(state), false);
  assert.equal(saved.includes('code_verifier'), false);
  await assert.rejects(() => consumeFlow(b, state), status(400));
  const consumed = await consumeFlow(a, state);
  assert.equal(consumed.flow.integrationId, 'google_calendar');
  assert.ok(consumed.verifier.length >= 43);
  await assert.rejects(() => consumeFlow(a, state), status(400));
  const expired = await startOAuth(a, 'google_drive');
  const expiredState = new URL(expired.authorizeUrl).searchParams.get('state')!;
  const [expiredRow] = await (await db()).all('SELECT id,data FROM entities WHERE kind = ? AND organization_id = ?', ['integration:oauth_flow', a.organizationId]);
  const flow = JSON.parse(String(expiredRow.data));
  flow.expiresAt = new Date(Date.now() - 1).toISOString();
  await (await db()).run('UPDATE entities SET data = ? WHERE id = ?', [JSON.stringify(flow), String(expiredRow.id)]);
  await assert.rejects(() => consumeFlow(a, expiredState), status(400));
});

test('start route requires same origin, session and explicit boolean send choice', async () => {
  const login = await owner('oauth-route');
  const endpoint = 'http://127.0.0.1:3000/api/integrations/oauth/start';
  const make = (origin: string, body: unknown, cookie = login.cookie) => new Request(endpoint, { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await start(make('https://evil.example', { integrationId: 'gmail' }))).status, 403);
  assert.equal((await start(make(process.env.APP_URL!, { integrationId: 'gmail' }, ''))).status, 401);
  assert.equal((await start(make(process.env.APP_URL!, { integrationId: 'gmail', allowSend: 'yes' }))).status, 400);
  const valid = await start(make(process.env.APP_URL!, { integrationId: 'gmail', allowSend: false }));
  assert.equal(valid.status, 200);
  assert.match((await valid.json()).authorizeUrl, /^https:\/\/accounts\.google\.com\//);
});

test('callback verifies read access before saving; grants send only when explicitly requested and returned', async () => {
  const login = await owner('oauth-callback');
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input); calls.push(url);
    if (url === 'https://oauth2.googleapis.com/token') {
      const form = init?.body as URLSearchParams;
      assert.ok(form.get('code_verifier'));
      assert.equal(form.get('redirect_uri'), callbackUrl());
      return Response.json({ access_token: 'access-value', refresh_token: 'refresh-value', expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send', token_type: 'Bearer' });
    }
    if (url === 'https://gmail.googleapis.com/gmail/v1/users/me/profile') return Response.json({ emailAddress: 'owner@example.test' });
    throw new Error('Unexpected provider URL');
  };
  try {
    const { authorizeUrl: url } = await startOAuth(login.user, 'gmail', false);
    const state = new URL(url).searchParams.get('state')!;
    const response = await callback(new Request(`${callbackUrl()}?state=${state}&code=secret-code`, { headers: { Cookie: login.cookie } }));
    assert.equal(response.status, 303);
    assert.equal(new URL(response.headers.get('Location')!).searchParams.get('integration'), 'connected');
    assert.equal(response.headers.get('Location')?.includes('secret-code'), false);
    const connection = await getConnection(login.user, 'gmail');
    assert.equal(connection.status, 'connected');
    assert.equal(connection.settings.sendPermission, undefined);
    assert.equal(connection.settings.authorization, 'oauth');
    const credentials = openCredentials(login.user.organizationId, connection.id, connection.sealed);
    assert.equal(credentials.refreshToken, 'refresh-value');
    assert.deepEqual(credentials.scopes, ['https://www.googleapis.com/auth/gmail.readonly']);
    assert.equal(JSON.stringify(connection).includes('refresh-value'), false);
    assert.deepEqual(calls, ['https://oauth2.googleapis.com/token', 'https://gmail.googleapis.com/gmail/v1/users/me/profile', 'https://gmail.googleapis.com/gmail/v1/users/me/profile']);
    assert.equal((await callback(new Request(`${callbackUrl()}?state=${state}&code=replay`, { headers: { Cookie: login.cookie } }))).status, 303);
  } finally { globalThis.fetch = original; }
});

test('provider failure stays generic, consumes flow, and leaves connection unconfigured', async () => {
  const login = await owner('oauth-provider-failure');
  const { authorizeUrl: url } = await startOAuth(login.user, 'microsoft_calendar');
  const state = new URL(url).searchParams.get('state')!;
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: 'provider-secret-error' }, { status: 400 });
  try {
    const response = await callback(new Request(`${callbackUrl()}?state=${state}&code=secret-code`, { headers: { Cookie: login.cookie } }));
    assert.equal(new URL(response.headers.get('Location')!).searchParams.get('integration'), 'error');
    assert.equal(response.headers.get('Location')?.includes('provider-secret-error'), false);
    await assert.rejects(() => getConnection(login.user, 'microsoft_calendar'), status(404));
    await assert.rejects(() => completeOAuth(login.user, state, 'replay'), status(400));
  } finally { globalThis.fetch = original; }
});

test('expired OAuth access token refreshes privately and CAS updates the connection', async () => {
  const login = await owner('oauth-refresh');
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => String(input).includes('/token')
    ? Response.json({ access_token: 'first-access', refresh_token: 'first-refresh', expires_in: 1, scope: 'Mail.Read Mail.Send User.Read offline_access', token_type: 'Bearer' })
    : Response.json({ id: 'me' });
  try {
    const { authorizeUrl: url } = await startOAuth(login.user, 'microsoft_mail', true);
    await completeOAuth(login.user, new URL(url).searchParams.get('state')!, 'code');
    assert.equal((await getConnection(login.user, 'microsoft_mail')).settings.sendPermission, 'Mail.Send');
    globalThis.fetch = async (input, init) => {
      if (String(input).includes('/me?$select=id')) return Response.json({ id: 'me' });
      assert.match(String(input), /\/token$/);
      assert.equal((init?.body as URLSearchParams).get('grant_type'), 'refresh_token');
      return Response.json({ access_token: 'renewed-access', expires_in: 3600, scope: 'Mail.Read User.Read offline_access', token_type: 'Bearer' });
    };
    const usable = await getUsableCredentials(login.user, 'microsoft_mail');
    assert.equal(usable.credentials.token, 'renewed-access');
    assert.equal(usable.credentials.refreshToken, 'first-refresh');
    assert.equal((await getConnection(login.user, 'microsoft_mail')).revision, usable.revision);
    assert.equal((await getConnection(login.user, 'microsoft_mail')).settings.sendPermission, undefined);
  } finally { globalThis.fetch = original; }
});
