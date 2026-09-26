import { randomBytes, randomUUID } from 'node:crypto';
import { db, WriteConflictError, type Database } from '../server/db';
import { hashPassword, verifyPassword, type AuthUser } from '../server/auth';
import { HttpError } from '../server/http';
import { commitForActiveMember, getActiveMembership } from '../team/service';
import { digest, seal } from './crypto';
import { deliveryReadiness } from './delivery';
import { allowAccountAttempt } from './limiter';

type Statement = Parameters<Database['batch']>[0][number];
type AccountState = { nonce: string; verifiedAt: string | null; required: boolean };
type Token = { userId: string; email: string; purpose: 'reset' | 'verify'; expiresAt: string; nonce: string; passwordHash: string };
const now = () => new Date().toISOString();
const accountId = (id: string) => `auth:account:${id}`;
const insert = (id: string, org: string, kind: string, status: string, data: unknown): Statement => ({ sql: 'INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [id, org, kind, status, JSON.stringify(data), now()] });
export const genericEmailResponse = { ok: true, message: 'If this account is eligible, a single-use link will be sent. Check your inbox, or contact your workspace administrator if it does not arrive.' };
export function verificationRequiredForSignup(): boolean { return process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === 'true' || (process.env.NODE_ENV === 'production' && process.env.AUTH_REQUIRE_EMAIL_VERIFICATION !== 'false'); }
export function assertRegistrationReady(): void {
  if (verificationRequiredForSignup() && deliveryReadiness() === 'setup-required') throw new HttpError(503, 'Account email delivery needs administrator setup before new workspaces can be created.');
}
export function accountRegistrationStatements(user: AuthUser): Statement[] {
  return [insert(accountId(user.id), user.organizationId, 'auth:account', 'active', { nonce: randomUUID(), verifiedAt: null, required: verificationRequiredForSignup() } satisfies AccountState)];
}
async function stateFor(user: AuthUser): Promise<{ value: AccountState; serialized: string }> {
  const [row] = await (await db()).all('SELECT data FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [accountId(user.id), user.organizationId, 'auth:account']);
  if (row) return { value: JSON.parse(String(row.data)) as AccountState, serialized: String(row.data) };
  // Existing accounts and invitation members remain grandfathered. Never guess that an email was verified.
  const value: AccountState = { nonce: randomUUID(), verifiedAt: null, required: false };
  await (await db()).run('INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING', [accountId(user.id), user.organizationId, 'auth:account', 'active', JSON.stringify(value), now()]);
  return stateFor(user);
}
export async function accountFlags(user: AuthUser) {
  // Read-only status does not create migration records.
  const [row] = await (await db()).all('SELECT data FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [accountId(user.id), user.organizationId, 'auth:account']);
  const state = row ? JSON.parse(String(row.data)) as AccountState : undefined;
  return { emailVerified: !!state?.verifiedAt, verificationRequired: !!state?.required };
}
export async function accountStatus(user: AuthUser) { return { email: user.email, ...await accountFlags(user), delivery: deliveryReadiness() }; }
const invalid = () => new HttpError(410, 'This link is invalid, expired, or already used. Request a new link.');
/** Returns only an internal encrypted-mail ID; API responses must always use genericEmailResponse. */
export async function requestAccountEmail(emailInput: unknown, purpose: 'reset' | 'verify', request: Request): Promise<string | undefined> {
  const email = typeof emailInput === 'string' ? emailInput.trim().toLowerCase().slice(0, 255) : '';
  if (deliveryReadiness() === 'setup-required') return;
  if (!await allowAccountAttempt(email, request)) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return;
  const database = await db(), [row] = await database.all('SELECT id, email, organization_id, password_hash FROM users WHERE email = ?', [email]);
  await database.run('DELETE FROM entities WHERE kind IN (?, ?, ?) AND created_at < ?', ['auth:token', 'auth:mail', 'auth:cooldown', new Date(Date.now() - 7 * 86400000).toISOString()]);
  if (!row) return;
  const user: AuthUser = { id: String(row.id), email, organizationId: String(row.organization_id) };
  try { await getActiveMembership(user); } catch (error) { if (error instanceof HttpError) return; throw error; }
  const state = await stateFor(user);
  if (purpose === 'verify' && state.value.verifiedAt) return;
  // Explicit requests can supersede a link after this cooldown. Delivery of a given mail ID is never retried.
  // The account nonce below also serializes concurrent requests.
  if ((await database.all('SELECT id FROM entities WHERE id = ? AND created_at > ?', [`auth:cooldown:${user.id}:${purpose}`, new Date(Date.now() - 60000).toISOString()])).length) return;
  const token = randomBytes(32).toString('hex'), id = `auth:token:${digest(token)}`, mailId = `auth:mail:${randomUUID()}`;
  const expiresAt = new Date(Date.now() + (purpose === 'reset' ? 30 : 60 * 24) * 60000).toISOString();
  const nextState = { ...state.value, nonce: randomUUID() };
  const data: Token = { userId: user.id, email, purpose, expiresAt, nonce: nextState.nonce, passwordHash: digest(String(row.password_hash)) };
  const url = new URL(`/account/${purpose}`, process.env.APP_URL); url.hash = `token=${token}`;
  try {
    await commitForActiveMember(user, [
      { sql: 'UPDATE entities SET data = ? WHERE id = ? AND data = ?', params: [JSON.stringify(nextState), accountId(user.id), state.serialized], expectedChanges: 1 },
      { sql: 'DELETE FROM entities WHERE id = ?', params: [`auth:cooldown:${user.id}:${purpose}`] },
      insert(`auth:cooldown:${user.id}:${purpose}`, user.organizationId, 'auth:cooldown', 'active', {}),
      insert(id, user.organizationId, 'auth:token', 'pending', data),
      insert(mailId, user.organizationId, 'auth:mail', 'queued', seal({ email, purpose, url: url.toString() })),
    ]);
  } catch (error) { if (error instanceof HttpError || error instanceof WriteConflictError) return; throw error; }
  return mailId;
}
function passwordValue(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) throw new HttpError(400, 'Use a password between 8 and 128 characters.');
  return value;
}
async function tokenDetails(token: unknown, purpose: Token['purpose']) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw invalid();
  const id = `auth:token:${digest(token)}`, database = await db();
  const [row] = await database.all('SELECT organization_id, data FROM entities WHERE id = ? AND kind = ? AND status = ?', [id, 'auth:token', 'pending']);
  if (!row) throw invalid();
  const data = JSON.parse(String(row.data)) as Token;
  if (data.purpose !== purpose || data.expiresAt <= now()) throw invalid();
  const user = { id: data.userId, email: data.email, organizationId: String(row.organization_id) };
  const state = await stateFor(user), [account] = await database.all('SELECT password_hash FROM users WHERE id = ? AND email = ? AND organization_id = ?', [user.id, user.email, user.organizationId]);
  if (!account || state.value.nonce !== data.nonce || digest(String(account.password_hash)) !== data.passwordHash) throw invalid();
  return { id, user, state, data, serialized: String(row.data), passwordHash: String(account.password_hash) };
}
export async function redeemAccountToken(token: unknown, purpose: Token['purpose'], password?: unknown): Promise<void> {
  await tokenDetails(token, purpose);
  const replacement = purpose === 'reset' ? await hashPassword(passwordValue(password)) : undefined;
  const details = await tokenDetails(token, purpose), { id, user, state } = details;
  const next = { ...state.value, nonce: randomUUID(), ...(purpose === 'verify' ? { verifiedAt: now() } : {}) };
  const statements: Statement[] = [
    { sql: 'UPDATE entities SET status = ? WHERE id = ? AND status = ? AND data = ?', params: ['used', id, 'pending', details.serialized], expectedChanges: 1 },
    { sql: 'UPDATE entities SET data = ? WHERE id = ? AND data = ?', params: [JSON.stringify(next), accountId(user.id), state.serialized], expectedChanges: 1 },
  ];
  if (replacement) statements.push({ sql: 'UPDATE users SET password_hash = ? WHERE id = ? AND password_hash = ?', params: [replacement, user.id, details.passwordHash], expectedChanges: 1 }, { sql: 'DELETE FROM auth_sessions WHERE user_id = ?', params: [user.id] });
  try { await commitForActiveMember(user, statements); }
  catch (error) { if (error instanceof HttpError || error instanceof WriteConflictError) throw invalid(); throw error; }
}
export async function changeAccountPassword(user: AuthUser, request: Request, current: unknown, password: unknown): Promise<void> {
  const nextPassword = passwordValue(password);
  if (typeof current !== 'string' || current.length > 128) throw new HttpError(400, 'Enter your current password.');
  const database = await db(), [account] = await database.all('SELECT password_hash FROM users WHERE id = ? AND organization_id = ?', [user.id, user.organizationId]);
  if (!account || !await verifyPassword(current, String(account.password_hash))) throw new HttpError(400, 'Current password is incorrect.');
  const replacement = await hashPassword(nextPassword), state = await stateFor(user);
  const session = request.headers.get('cookie')?.split(';').map(item => item.trim()).find(item => item.startsWith('company_session='))?.slice(16) || '';
  await commitForActiveMember(user, [
    { sql: 'UPDATE auth_sessions SET expires_at = expires_at WHERE token_hash = ? AND user_id = ? AND expires_at > ?', params: [digest(session), user.id, now()], expectedChanges: 1 },
    { sql: 'UPDATE users SET password_hash = ? WHERE id = ? AND password_hash = ?', params: [replacement, user.id, String(account.password_hash)], expectedChanges: 1 },
    { sql: 'UPDATE entities SET data = ? WHERE id = ? AND data = ?', params: [JSON.stringify({ ...state.value, nonce: randomUUID() }), accountId(user.id), state.serialized], expectedChanges: 1 },
    { sql: 'DELETE FROM auth_sessions WHERE user_id = ?', params: [user.id] },
  ]);
}
