import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { authenticate } from '../lib/server/auth';
import { db } from '../lib/server/db';
import { check, configure, disconnect, sync } from '../lib/integrations/service';
import { configureOAuthConnection, getConnection, listConnections, openCredentials, replaceOAuthCredentials, requireWorkspaceOwner } from '../lib/integrations/vault';
import { checkProvider, providerJson, pullProvider } from '../lib/integrations/adapters';
import { integrationCatalog } from '../lib/integrations/catalog';
import { POST as webhookPost } from '../app/api/integrations/webhook/[connectionId]/route';
import { GET as integrationGet, POST as integrationPost } from '../app/api/integrations/route';

process.env.SQLITE_PATH = ':memory:';
process.env.CONNECTOR_ENCRYPTION_KEY = '42'.repeat(32);
const request = () => new Request('http://localhost/');
async function owner(name: string) { return (await authenticate({ mode: 'register', email: `${name}@example.test`, password: 'correct password' }, request())).user; }

test('vault encrypts credentials, binds ciphertext to tenant, and returns only redacted connection metadata', async () => {
  const a = await owner('integration-vault-a'), b = await owner('integration-vault-b');
  const secret = 'secret-token-123456789';
  const saved = await configure(a, 'hubspot', { token: secret });
  assert.equal(saved.status, 'needs_setup');
  assert.equal(JSON.stringify(saved).includes(secret), false);
  const stored = await getConnection(a, 'hubspot');
  assert.equal(openCredentials(a.organizationId, stored.id, stored.sealed).token, secret);
  assert.throws(() => openCredentials(b.organizationId, stored.id, stored.sealed));
  const [row] = await (await db()).all('SELECT data FROM entities WHERE id = ?', [stored.id]);
  assert.equal(String(row.data).includes(secret), false);
  assert.equal((await listConnections(b)).length, 0);
  assert.equal((await listConnections(a))[0].status, 'needs_setup');
});

test('only organization founder manages integrations', async () => {
  const founder = await owner('integration-founder');
  await requireWorkspaceOwner(founder);
  const member = { id: 'later-member', email: 'member@example.test', organizationId: founder.organizationId };
  await (await db()).run('INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', [member.id, member.email, 'irrelevant', founder.organizationId, '9999-01-01T00:00:00.000Z']);
  await assert.rejects(() => requireWorkspaceOwner(member), { status: 403 });
});

test('send scope setting is exact and OAuth refresh stays encrypted and revisioned', async () => {
  const user = await owner('integration-oauth-vault');
  await assert.rejects(() => configure(user, 'gmail', { token: 'sample-token', sendPermission: 'Mail.Send' }), { status: 400 });
  const oauth = await configureOAuthConnection(user, 'gmail', {
    token: 'google-access-token', refreshToken: 'private-refresh-token', expiresAt: '2026-12-01T00:00:00.000Z',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'], oauthProvider: 'google', accountBinding: 'google:owner@example.test',
  });
  assert.equal(oauth.status, 'connected');
  assert.equal(oauth.settings.sendPermission, 'https://www.googleapis.com/auth/gmail.send');
  assert.equal(JSON.stringify(oauth).includes('private-refresh-token'), false);
  const before = await getConnection(user, 'gmail');
  const refreshed = await replaceOAuthCredentials(user, 'gmail', {
    token: 'new-access-token', expiresAt: '2026-12-01T01:00:00.000Z',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'], oauthProvider: 'google', accountBinding: 'google:owner@example.test',
  }, before.revision);
  assert.equal(refreshed.revision, before.revision + 1);
  const after = await getConnection(user, 'gmail');
  assert.equal(openCredentials(user.organizationId, after.id, after.sealed).refreshToken, 'private-refresh-token');
  await replaceOAuthCredentials(user, 'gmail', {
    token: 'read-only-token', expiresAt: '2026-12-01T02:00:00.000Z',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'], oauthProvider: 'google', accountBinding: 'google:owner@example.test',
  }, after.revision);
  assert.equal((await getConnection(user, 'gmail')).settings.sendPermission, undefined);
});

test('provider pull is bounded, fixed-origin, and stages each version once for review', async () => {
  const user = await owner('integration-sync');
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    const path = String(input);
    if (path.includes('/users/me/profile')) return Response.json({ emailAddress: 'owner@example.test' });
    if (/\/users\/me\/messages\/m\d+\?format=full/.test(path)) return Response.json({
      id: 'm0', internalDate: '1760000000000', payload: { mimeType: 'multipart/alternative', headers: [{ name: 'Subject', value: 'Company offer' }], parts: [{ mimeType: 'text/plain', body: { data: Buffer.from('We offer admission guidance.').toString('base64url') } }] },
    });
    if (path.includes('/users/me/messages')) return Response.json({ messages: Array.from({ length: 30 }, (_, n) => ({ id: `m${n}`, threadId: `t${n}` })) });
    throw new Error('unexpected provider path');
  };
  try {
    await configure(user, 'gmail', { token: 'temporary-access-token' });
    assert.equal((await check(user, 'gmail')).status, 'connected');
    const first = await sync(user, 'gmail');
    const second = await sync(user, 'gmail');
    assert.equal(first.staged, 15);
    assert.equal(second.staged, 0);
    assert.equal(second.skipped, 15);
    assert.equal(first.sourceIds.length, 15);
    assert.ok(calls.every(url => url.startsWith('https://gmail.googleapis.com/')));
    const source = await (await db()).all('SELECT data FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [first.sourceIds[0], user.organizationId, 'platform:ingestion_source']);
    assert.equal(source.length, 1);
    assert.equal(JSON.parse(JSON.parse(String(source[0].data)).data.rawText).provider, 'gmail');
    assert.match(JSON.parse(JSON.parse(String(source[0].data)).data.rawText).content.content, /admission guidance/);
    await assert.rejects(() => providerJson('https://127.0.0.1/internal', {}), { status: 400 });
  } finally { globalThis.fetch = original; }
});

test('signed webhook rejects bad signatures and deduplicates event IDs', async () => {
  const user = await owner('integration-hook');
  const secret = 'a secure webhook secret with 32 plus bytes';
  await configure(user, 'generic_webhook', { token: secret });
  await check(user, 'generic_webhook');
  const connection = await getConnection(user, 'generic_webhook');
  const body = JSON.stringify({ event: 'customer.updated', id: 7 });
  const path = `http://localhost/api/integrations/webhook/${connection.id}`;
  const make = (signature: string) => new Request(path, { method: 'POST', headers: { 'x-integration-event-id': 'event-7', 'x-integration-signature': signature, 'content-type': 'application/json' }, body });
  const bad = await webhookPost(make(`sha256=${'0'.repeat(64)}`), { params: Promise.resolve({ connectionId: connection.id }) });
  assert.equal(bad.status, 401);
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  const first = await webhookPost(make(signature), { params: Promise.resolve({ connectionId: connection.id }) });
  const second = await webhookPost(make(signature), { params: Promise.resolve({ connectionId: connection.id }) });
  assert.equal(first.status, 202);
  assert.equal(second.status, 200);
  assert.equal((await first.json()).accepted, true);
  assert.equal((await second.json()).accepted, false);
  await configure(user, 'generic_webhook', { token: 'a different webhook secret over 32 bytes' });
  await check(user, 'generic_webhook');
  assert.equal((await webhookPost(make(signature), { params: Promise.resolve({ connectionId: connection.id }) })).status, 401);
  await disconnect(user, 'generic_webhook');
  assert.equal((await webhookPost(make(signature), { params: Promise.resolve({ connectionId: connection.id }) })).status, 404);
});

test('integration API enforces session, same origin, and redacted GET', async () => {
  const login = await authenticate({ mode: 'register', email: 'integration-route@example.test', password: 'correct password' }, request());
  const missingSession = await integrationGet(new Request('http://localhost/api/integrations'));
  assert.equal(missingSession.status, 401);
  const crossOrigin = await integrationPost(new Request('http://localhost/api/integrations', { method: 'POST', headers: { cookie: login.cookie, origin: 'https://other.example', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'configure', integrationId: 'hubspot', credentials: { token: 'secret-123456789' } }) }));
  assert.equal(crossOrigin.status, 403);
  const configured = await integrationPost(new Request('http://localhost/api/integrations', { method: 'POST', headers: { cookie: login.cookie, origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'configure', integrationId: 'hubspot', credentials: { token: 'secret-123456789' } }) }));
  assert.equal(configured.status, 200);
  const listed = await integrationGet(new Request('http://localhost/api/integrations', { headers: { cookie: login.cookie } }));
  assert.equal(listed.status, 200);
  const text = await listed.text();
  assert.equal(text.includes('secret-123456789'), false);
  assert.equal(JSON.parse(text).connections[0].status, 'needs_setup');
});

test('provider error body is not exposed and a failed check is recorded', async () => {
  const user = await owner('integration-failed-check');
  await configure(user, 'hubspot', { token: 'bad-private-token' });
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'secret upstream debug body' }), { status: 401, headers: { 'content-type': 'application/json' } });
  try {
    await assert.rejects(() => check(user, 'hubspot'), /Provider returned HTTP 401/);
    const current = (await listConnections(user)).find(item => item.integrationId === 'hubspot');
    assert.equal(current?.status, 'error');
    assert.equal(JSON.stringify(current).includes('secret upstream debug body'), false);
  } finally { globalThis.fetch = original; }
});

test('Drive imports supported text and marks PDF unsupported without downloading it', async () => {
  const original = globalThis.fetch; const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input); calls.push(url);
    if (url.includes('/drive/v3/files?')) return Response.json({ files: [
      { id: 'doc1', name: 'About us', mimeType: 'application/vnd.google-apps.document', modifiedTime: '2026-09-01T00:00:00Z' },
      { id: 'file2', name: 'Notes', mimeType: 'text/plain' },
      { id: 'pdf3', name: 'Brochure', mimeType: 'application/pdf' },
    ] });
    if (url.includes('/doc1/export')) return new Response('Our company provides guidance.');
    if (url.includes('/file2?alt=media')) return new Response('We work across three cities.');
    throw new Error('unexpected request');
  };
  try {
    const result = await pullProvider('google_drive', { token: 'sample-token' });
    assert.equal(result.length, 3);
    assert.match(String(result[0].data.content), /provides guidance/);
    assert.match(String(result[1].data.content), /three cities/);
    assert.equal(result[2].data.contentStatus, 'unsupported_format');
    assert.equal(calls.some(url => url.includes('/pdf3')), false);
  } finally { globalThis.fetch = original; }
});

test('Notion nested blocks, Graph text bodies and Intercom messages produce bounded content', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/v1/search')) return Response.json({ results: [{ id: '11111111-1111-1111-1111-111111111111', object: 'page', url: 'https://www.notion.so/page' }] });
    if (url.includes('11111111-1111-1111-1111-111111111111/children')) return Response.json({ results: [{ id: '22222222-2222-2222-2222-222222222222', type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Admissions team' }] }, has_children: true }] });
    if (url.includes('22222222-2222-2222-2222-222222222222/children')) return Response.json({ results: [{ id: '33333333-3333-3333-3333-333333333333', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ plain_text: 'Handles applications' }] } }] });
    if (url.includes('/me/messages?')) { assert.equal(new Headers(init?.headers).get('Prefer'), 'outlook.body-content-type="text"'); return Response.json({ value: [{ id: 'graph-mail-1', subject: 'Inquiry', body: { contentType: 'text', content: 'Please send course details.' } }] }); }
    if (url.includes('/conversations?')) return Response.json({ conversations: [{ id: '123', title: 'Support' }] });
    if (url.includes('/conversations/123?')) return Response.json({ id: '123', source: { body: 'Customer asked about fees.' }, conversation_parts: { conversation_parts: [{ body: 'Agent explained the fees.' }], total_count: 1 } });
    throw new Error(`unexpected ${url}`);
  };
  try {
    const notion = await pullProvider('notion', { token: 'sample-token' });
    assert.match(String(notion[0].data.content), /Admissions team\nHandles applications/);
    const mail = await pullProvider('microsoft_mail', { token: 'sample-token' });
    assert.equal(mail[0].data.content, 'Please send course details.');
    const intercom = await pullProvider('intercom', { token: 'sample-token' });
    assert.match(String(intercom[0].data.content), /Customer asked about fees/);
    assert.match(String(intercom[0].data.content), /Agent explained the fees/);
  } finally { globalThis.fetch = original; }
});

test('new connector settings reject arbitrary hosts, root Dropbox and malformed channel scopes', async () => {
  const user = await owner('integration-new-fields');
  await assert.rejects(() => configure(user, 'salesforce', { token: 'sample-token', instanceHost: 'http://127.0.0.1' }), { status: 400 });
  await assert.rejects(() => configure(user, 'salesforce', { token: 'sample-token', instanceHost: 'evil.com@company.my.salesforce.com' }), { status: 400 });
  await assert.rejects(() => configure(user, 'dropbox', { token: 'sample-token', folderPath: '/' }), { status: 400 });
  await assert.rejects(() => configure(user, 'dropbox', { token: 'sample-token', folderPath: '/CompanyDocs/../Other' }), { status: 400 });
  await assert.rejects(() => configure(user, 'teams', { token: 'sample-token', teamId: 'bad', channelId: '19:1234567890@thread.tacv2' }), { status: 400 });
  const configured = await configure(user, 'salesforce', { token: 'sample-token', instanceHost: 'company.my.salesforce.com' });
  assert.equal(configured.settings.instanceHost, 'company.my.salesforce.com');
  assert.equal(JSON.stringify(configured).includes('sample-token'), false);
  await assert.rejects(() => providerJson('https://user@company.my.salesforce.com/services/data/', {}), { status: 400 });
  assert.equal(integrationCatalog.find(item => item.id === 'salesforce')?.status, 'available');
  assert.equal(integrationCatalog.find(item => item.id === 'telephone')?.status, 'planned');
});

test('Salesforce and Pipedrive use fixed account/contact/person reads', async () => {
  const original = globalThis.fetch; const seen: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input); seen.push(url);
    if (url.includes('.my.salesforce.com/')) {
      const query = new URL(url).searchParams.get('q') || '';
      assert.match(query, /^SELECT /);
      assert.match(query, / LIMIT (1|7|8)$/);
      return Response.json({ records: query.includes('FROM Contact') ? [{ Id: '003x', Name: 'A Customer', Email: 'a@example.test', Description: 'Asked about programs.' }] : [{ Id: '001x', Name: 'A Company', Description: 'Runs training.' }] });
    }
    assert.equal(new Headers(init?.headers).get('x-api-token'), 'pipedrive-token');
    if (url.endsWith('/v1/users/me')) return Response.json({ success: true, data: { id: 1 } });
    if (url.includes('/api/v2/persons?')) return Response.json({ success: true, data: [{ id: 2, name: 'A Person', emails: [{ value: 'a@example.test' }], update_time: '2026-09-01' }] });
    throw new Error('unexpected provider URL');
  };
  try {
    const sf = { token: 'salesforce-token', instanceHost: 'company.my.salesforce.com' };
    await checkProvider('salesforce', sf);
    const records = await pullProvider('salesforce', sf);
    assert.equal(records.length, 2);
    assert.match(String(records[0].data.Description), /training/);
    assert.match(String(records[1].data.Description), /programs/);
    const pd = { token: 'pipedrive-token' };
    await checkProvider('pipedrive', pd);
    assert.equal((await pullProvider('pipedrive', pd))[0].data.name, 'A Person');
    assert.ok(seen.every(url => url.startsWith('https://company.my.salesforce.com/') || url.startsWith('https://api.pipedrive.com/')));
  } finally { globalThis.fetch = original; }
});

test('Teams and Google Chat read only a selected channel or space', async () => {
  const original = globalThis.fetch; const seen: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input); seen.push(url);
    if (url.includes('graph.microsoft.com')) return Response.json({ value: [{ id: 'message1', body: { content: '<p>Team update</p>' }, createdDateTime: '2026-09-01T00:00:00Z' }] });
    if (url.includes('chat.googleapis.com')) return Response.json({ messages: [{ name: 'spaces/ABC123/messages/xyz', text: 'Chat update', createTime: '2026-09-01T00:00:00Z' }] });
    throw new Error('unexpected request');
  };
  try {
    const teams = { token: 'teams-token', teamId: '11111111-1111-1111-1111-111111111111', channelId: '19:abcdefghij@thread.tacv2' };
    await checkProvider('teams', teams);
    assert.equal((await pullProvider('teams', teams))[0].data.content, 'Team update');
    const chat = { token: 'chat-token', spaceId: 'spaces/ABC123' };
    await checkProvider('google_chat', chat);
    assert.equal((await pullProvider('google_chat', chat))[0].data.content, 'Chat update');
    assert.ok(seen.every(url => url.includes('11111111-1111-1111-1111-111111111111') || url.includes('spaces/ABC123')));
  } finally { globalThis.fetch = original; }
});

test('Dropbox reads designated folder text and does not download outside paths or PDFs', async () => {
  const original = globalThis.fetch; const seen: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input); seen.push(url);
    if (url.endsWith('/files/list_folder')) {
      const requestBody = JSON.parse(String(init?.body));
      assert.equal(requestBody.path, '/CompanyDocs'); assert.equal(requestBody.recursive, false);
      return Response.json({ entries: [
        { '.tag': 'file', id: 'id:1', path_lower: '/companydocs/about.txt', name: 'about.txt', size: 20 },
        { '.tag': 'file', id: 'id:2', path_lower: '/companydocs/brochure.pdf', name: 'brochure.pdf', size: 20 },
        { '.tag': 'file', id: 'id:3', path_lower: '/other/secret.txt', name: 'secret.txt', size: 20 },
      ] });
    }
    if (url.endsWith('/files/download')) {
      assert.deepEqual(JSON.parse(new Headers(init?.headers).get('Dropbox-API-Arg') || '{}'), { path: '/companydocs/about.txt' });
      return new Response('We provide consulting.');
    }
    throw new Error('unexpected request');
  };
  try {
    const credentials = { token: 'dropbox-token', folderPath: '/CompanyDocs' };
    await checkProvider('dropbox', credentials);
    const records = await pullProvider('dropbox', credentials);
    assert.equal(records.length, 2);
    assert.match(String(records[0].data.content), /provide consulting/);
    assert.equal(records[1].data.contentStatus, 'unsupported_format');
    assert.equal(seen.filter(url => url.endsWith('/files/download')).length, 1);
  } finally { globalThis.fetch = original; }
});
