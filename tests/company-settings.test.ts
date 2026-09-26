import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authenticate, joinInvitation, type AuthUser } from '../lib/server/auth';
import { db, type Database } from '../lib/server/db';
import { HttpError } from '../lib/server/http';
import { createRecord, getRecord } from '../lib/platform/records';
import { addCompanyDescriptionToBrain, getCompanySettings, saveCompanySettings } from '../lib/company/service';
import { inviteMember, updateMember } from '../lib/team/service';
import { GET, POST, PUT } from '../app/api/company/route';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
delete process.env.APP_URL;
const password = 'fictional company password';
const request = (cookie = '', method = 'GET', body?: unknown, origin = 'http://localhost:3000') => new Request('http://localhost:3000/api/company', { method, headers: { cookie, origin, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
const status = (code: number) => (error: unknown) => error instanceof HttpError && error.status === code;
async function owner(name = 'Fictional company') { return authenticate({ mode: 'register', email: `${randomUUID()}@example.test`, password, organization: name }, request()); }
async function member(founder: AuthUser, role: 'owner' | 'operator' | 'viewer') {
  const email = `${randomUUID()}@example.test`, invitation = await inviteMember(founder, email, role);
  return joinInvitation({ token: invitation.token, email, password }, request());
}
function values(name = 'Acme Advisory') {
  return { revision: 0, name, publicDisplayName: 'Acme', website: 'https://acme.example/about', description: 'Acme helps teams make fictional decisions.', industry: 'Advisory', country: 'India', timezone: 'Asia/Kolkata', languages: ['English', 'Hindi'], brandAccent: '#5148ce' };
}

test('new company settings use explicit creation defaults and the organization as name authority', async () => {
  const founder = await owner('Source Authority Ltd'), snapshot = await getCompanySettings(founder.user);
  assert.equal(snapshot.profile.name, 'Source Authority Ltd');
  assert.equal(snapshot.profile.publicDisplayName, 'Source Authority Ltd');
  assert.equal(snapshot.profile.revision, 0);
  assert.deepEqual({ country: snapshot.profile.country, timezone: snapshot.profile.timezone, languages: snapshot.profile.languages }, { country: 'India', timezone: 'Asia/Kolkata', languages: ['English', 'Hindi'] });
  assert.equal(snapshot.publicBrand.verification, 'workspace_profile_unverified');
  assert.equal(snapshot.editable, true);
  assert.ok(snapshot.readiness.every(item => item.state === 'missing'));
  assert.equal((await (await db()).all('SELECT id FROM entities WHERE organization_id=? AND kind=?', [founder.user.organizationId, 'platform:company_profile'])).length, 0);
});

test('owner save atomically updates organization, profile and audit with CAS revisions', async () => {
  const founder = await owner('Old name'), first = await saveCompanySettings(founder.user, values());
  assert.equal(first.profile.revision, 1);
  const database = await db(), [org] = await database.all('SELECT name FROM organizations WHERE id=?', [founder.user.organizationId]);
  assert.equal(org.name, 'Acme Advisory');
  const [row] = await database.all('SELECT data,status FROM entities WHERE id=?', [first.profile.id]);
  assert.equal(JSON.parse(String(row.data)).data.name, org.name);
  assert.equal(row.status, 'active');
  assert.equal((await database.all('SELECT id FROM audit_events WHERE entity_id=? AND event=?', [first.profile.id, 'company_profile.created:r1'])).length, 1);
  const second = await saveCompanySettings(founder.user, { ...values('Acme Advisory International'), revision: 1 });
  assert.equal(second.profile.revision, 2);
  await assert.rejects(saveCompanySettings(founder.user, { ...values('Stale overwrite'), revision: 1 }), status(409));
  assert.equal((await database.all('SELECT name FROM organizations WHERE id=?', [founder.user.organizationId]))[0].name, 'Acme Advisory International');
  const [account] = await database.all('SELECT email,organization_id FROM users WHERE id=?', [founder.user.id]);
  assert.equal(account.email, founder.user.email); assert.equal(account.organization_id, founder.user.organizationId);
});

test('profile validation rejects unsafe websites, invalid timezone, duplicate languages and invalid accents', async () => {
  const founder = await owner();
  for (const [change, pattern] of [
    [{ website: 'http://example.test' }, /HTTPS/],
    [{ website: 'https://user:password@example.test' }, /embedded credentials/],
    [{ timezone: 'India/Imaginary' }, /IANA timezone/],
    [{ languages: ['English', 'english'] }, /unique/],
    [{ languages: [] }, /between 1 and 8/],
    [{ brandAccent: 'indigo' }, /six-digit hex/],
  ] as const) await assert.rejects(saveCompanySettings(founder.user, { ...values(), ...change }), error => error instanceof HttpError && error.status === 400 && pattern.test(error.message));
  assert.equal((await getCompanySettings(founder.user)).profile.revision, 0);
});

test('only a current owner can update company settings and an actor change rolls back the entire save', async () => {
  const founder = await owner('Protected company'), operator = await member(founder.user, 'operator'), viewer = await member(founder.user, 'viewer');
  await assert.rejects(saveCompanySettings(operator.user, values()), status(403));
  await assert.rejects(saveCompanySettings(viewer.user, values()), status(403));
  const secondOwner = await member(founder.user, 'owner'), database = await db();
  let changed = false;
  const injected: Database = {
    async all(sql, params) {
      const rows = await database.all(sql, params);
      if (!changed && sql.startsWith('SELECT e.data FROM entities e JOIN users')) { changed = true; await updateMember(secondOwner.user, founder.user.id, 'role', 'operator'); }
      return rows as never;
    },
    run: (sql, params) => database.run(sql, params),
    batch: statements => database.batch(statements),
  };
  await assert.rejects(saveCompanySettings(founder.user, values('Should not persist'), injected), status(409));
  assert.equal((await database.all('SELECT name FROM organizations WHERE id=?', [founder.user.organizationId]))[0].name, 'Protected company');
  assert.equal((await database.all('SELECT id FROM entities WHERE organization_id=? AND kind=?', [founder.user.organizationId, 'platform:company_profile'])).length, 0);
});

test('owner removal between authorization and commit cannot leave a company update or audit', async () => {
  const founder = await owner('Removal-protected company'), secondOwner = await member(founder.user, 'owner'), database = await db();
  let removed = false;
  const injected: Database = {
    async all(sql, params) {
      const rows = await database.all(sql, params);
      if (!removed && sql.startsWith('SELECT e.data FROM entities e JOIN users')) { removed = true; await updateMember(secondOwner.user, founder.user.id, 'remove'); }
      return rows as never;
    },
    run: (sql, params) => database.run(sql, params),
    batch: statements => database.batch(statements),
  };
  await assert.rejects(saveCompanySettings(founder.user, values('Removed actor write'), injected), status(409));
  assert.equal((await database.all('SELECT name FROM organizations WHERE id=?', [founder.user.organizationId]))[0].name, 'Removal-protected company');
  assert.equal((await database.all('SELECT id FROM audit_events WHERE organization_id=? AND event LIKE ?', [founder.user.organizationId, 'company_profile.%'])).length, 0);
});

test('concurrent company updates commit one source-authoritative revision', async () => {
  const founder = await owner(), initial = await saveCompanySettings(founder.user, values());
  const outcomes = await Promise.allSettled([
    saveCompanySettings(founder.user, { ...values('Concurrent A'), revision: initial.profile.revision }),
    saveCompanySettings(founder.user, { ...values('Concurrent B'), revision: initial.profile.revision }),
  ]);
  assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
  const current = await getCompanySettings(founder.user), [org] = await (await db()).all('SELECT name FROM organizations WHERE id=?', [founder.user.organizationId]);
  assert.equal(current.profile.revision, 2);
  assert.equal(current.profile.name, org.name);
});

test('description enters Company brain only through an explicit unreviewed draft action', async () => {
  const founder = await owner(), saved = await saveCompanySettings(founder.user, values());
  assert.equal((await (await db()).all('SELECT id FROM entities WHERE organization_id=? AND kind=?', [founder.user.organizationId, 'platform:brain_source'])).length, 0);
  const first = await addCompanyDescriptionToBrain(founder.user, saved.profile.revision), second = await addCompanyDescriptionToBrain(founder.user, saved.profile.revision);
  assert.equal(first.created, true); assert.equal(second.created, false); assert.equal(second.sourceId, first.sourceId);
  const source = await getRecord<Record<string, unknown>>(founder.user.organizationId, 'brain_source', first.sourceId);
  assert.equal(source.status, 'draft');
  assert.equal(source.data.content, saved.profile.description);
  assert.match(String(source.data.sourceLabel), /unreviewed/);
  assert.equal(source.data.approvedAt, undefined);
  const operator = await member(founder.user, 'operator');
  await assert.rejects(addCompanyDescriptionToBrain(operator.user, saved.profile.revision), status(403));
});

test('startup readiness reports saved records without exposing connection data', async () => {
  const founder = await owner(), saved = await saveCompanySettings(founder.user, values());
  await createRecord(founder.user, 'offering', { name: 'Reviewed offer' }, 'approved');
  await createRecord(founder.user, 'release', { channel: 'browser' }, 'active');
  await createRecord(founder.user, 'agent_deployment', { name: 'Public chat' }, 'published');
  const database = await db(), secret = 'never-return-this-token', time = new Date().toISOString();
  await database.run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', [randomUUID(), founder.user.organizationId, 'integration:vault', 'connected', JSON.stringify({ sealed: secret }), time]);
  const snapshot = await getCompanySettings(founder.user);
  assert.ok(snapshot.readiness.every(item => item.state === 'ready'));
  assert.equal(JSON.stringify(snapshot).includes(secret), false);
  assert.equal(snapshot.profile.revision, saved.profile.revision);
});

test('company route requires authentication, same origin, owner writes and safe brain actions', async () => {
  const founder = await owner(), operator = await member(founder.user, 'operator');
  assert.equal((await GET(request())).status, 401);
  assert.equal((await PUT(request(founder.cookie, 'PUT', values(), 'https://wrong.example'))).status, 403);
  assert.equal((await PUT(request(operator.cookie, 'PUT', values()))).status, 403);
  const saved = await PUT(request(founder.cookie, 'PUT', values())); assert.equal(saved.status, 200);
  const body = await saved.json(); assert.equal(body.profile.revision, 1);
  assert.equal((await POST(request(founder.cookie, 'POST', { action: 'unknown', revision: 1 }))).status, 400);
  assert.equal((await POST(request(founder.cookie, 'POST', { action: 'add_description_to_brain', revision: 1 }))).status, 201);
});
