import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { checkTelegramIdentity } from '../lib/integrations/adapters';
import { integrationCatalog } from '../lib/integrations/catalog';
import { check, configure } from '../lib/integrations/service';
import { getConnection, listConnections, openCredentials, validateCredentials } from '../lib/integrations/vault';
import { db } from '../lib/server/db';
import type { AuthUser } from '../lib/server/auth';
import { ownerRegistrationStatements } from '../lib/team/service';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
process.env.CONNECTOR_ENCRYPTION_KEY = '74'.repeat(32);

const token = '123456789:fictional_token_1234567890';
const webhookSecret = 'fictional_private_webhook_secret_123456';

async function owner(): Promise<AuthUser> {
  const user: AuthUser = { id: randomUUID(), organizationId: randomUUID(), email: `${randomUUID()}@example.test` };
  const now = new Date().toISOString();
  await (await db()).batch([
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [user.organizationId, 'Fictional company', now] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [user.id, user.email, 'unused', user.organizationId, now] },
    ...ownerRegistrationStatements(user),
  ]);
  return user;
}

test('Telegram is available with bounded private-message capabilities and a required secret field', () => {
  const item = integrationCatalog.find(candidate => candidate.id === 'telegram');
  assert.equal(item?.status, 'available');
  assert.deepEqual(item?.capabilities, ['check', 'receive_private_messages', 'azure_agent_replies']);
  assert.deepEqual(item?.fields, [{ key: 'webhookSecret', label: 'Private webhook secret · 32 or more characters', type: 'password', required: true }]);
  assert.match(item?.setup || '', /Private chats only/);
});

test('Telegram credential validation accepts only BotFather-shaped tokens and strong webhook secrets', () => {
  assert.deepEqual(validateCredentials('telegram', { token, webhookSecret }), { token, webhookSecret });
  for (const credentials of [
    { token: 'ordinary-access-token', webhookSecret },
    { token, webhookSecret: 'short' },
    { token, webhookSecret: `${'a'.repeat(31)}!` },
    { token, webhookSecret: `${'a'.repeat(16)}\n${'b'.repeat(16)}` },
  ]) assert.throws(() => validateCredentials('telegram', credentials), { status: 400 });
});

test('Telegram identity check rejects non-bots and malformed identities without accepting provider claims', async () => {
  const original = globalThis.fetch;
  const invalid = [
    { ok: true, result: { id: 123456789, is_bot: false, username: 'valid_bot' } },
    { ok: true, result: { id: -1, is_bot: true, username: 'valid_bot' } },
    { ok: true, result: { id: 123456789, is_bot: true, username: 'bad-name' } },
    { ok: false, result: { id: 123456789, is_bot: true, username: 'valid_bot' } },
  ];
  try {
    for (const payload of invalid) {
      globalThis.fetch = async () => Response.json(payload);
      await assert.rejects(() => checkTelegramIdentity({ token }), /did not verify a valid bot identity/);
    }
    globalThis.fetch = async () => Response.json({ ok: true, result: { id: 123456789, is_bot: true, username: 'valid_bot' } });
    assert.deepEqual(await checkTelegramIdentity({ token }), { botId: '123456789', botUsername: 'valid_bot' });
  } finally { globalThis.fetch = original; }
});

test('Telegram check stores only safe identity metadata and rotates authority only when checked identity changes', async () => {
  const user = await owner();
  const configured = await configure(user, 'telegram', { token, webhookSecret });
  assert.equal(configured.status, 'needs_setup');
  assert.equal(JSON.stringify(configured).includes(token), false);
  assert.equal(JSON.stringify(configured).includes(webhookSecret), false);

  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ ok: true, result: { id: 123456789, is_bot: true, username: 'first_bot' } });
    const checked = await check(user, 'telegram');
    assert.deepEqual(checked.settings, { botId: '123456789', botUsername: 'first_bot' });
    assert.equal(JSON.stringify(checked).includes(token), false);
    assert.equal(JSON.stringify(checked).includes(webhookSecret), false);
    const firstAuthority = (await getConnection(user, 'telegram')).authorizationVersion;

    await check(user, 'telegram');
    assert.equal((await getConnection(user, 'telegram')).authorizationVersion, firstAuthority);

    globalThis.fetch = async () => Response.json({ ok: true, result: { id: 987654321, is_bot: true, username: 'second_bot' } });
    await check(user, 'telegram');
    const changed = await getConnection(user, 'telegram');
    assert.notEqual(changed.authorizationVersion, firstAuthority);
    assert.deepEqual(changed.settings, { botId: '987654321', botUsername: 'second_bot' });

    const listed = await listConnections(user);
    assert.equal(JSON.stringify(listed).includes(token), false);
    assert.equal(JSON.stringify(listed).includes(webhookSecret), false);
    assert.deepEqual(openCredentials(user.organizationId, changed.id, changed.sealed), { token, webhookSecret });
    const [row] = await (await db()).all('SELECT data FROM entities WHERE id = ?', [changed.id]);
    assert.equal(String(row.data).includes(token), false);
    assert.equal(String(row.data).includes(webhookSecret), false);
  } finally { globalThis.fetch = original; }
});

test('an invalid Telegram identity fails closed, records a redacted error, and cannot replace the last checked identity', async () => {
  const user = await owner();
  await configure(user, 'telegram', { token, webhookSecret });
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ ok: true, result: { id: 123456789, is_bot: true, username: 'valid_bot' } });
    await check(user, 'telegram');
    const before = await getConnection(user, 'telegram');

    globalThis.fetch = async () => Response.json({ ok: true, result: { id: 555, is_bot: false, username: webhookSecret } });
    await assert.rejects(() => check(user, 'telegram'), /did not verify a valid bot identity/);
    const after = await getConnection(user, 'telegram');
    assert.equal(after.status, 'error');
    assert.deepEqual(after.settings, before.settings);
    assert.equal(after.authorizationVersion, before.authorizationVersion);
    assert.equal(JSON.stringify(after).includes(token), false);
    assert.equal(JSON.stringify(after).includes(webhookSecret), false);
  } finally { globalThis.fetch = original; }
});
