import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db';
import { field, HttpError } from './http';
import { acceptInvitation, commitForActiveMember, getActiveMembership, ownerRegistrationStatements } from '../team/service';
import type { TeamRole } from '../team/contracts';
import { accountFlags, accountRegistrationStatements, assertRegistrationReady } from '../auth-lifecycle/service';
export { assertSameOrigin } from './http';

const scrypt = promisify(scryptCallback);
const COOKIE = 'company_session';
const SESSION_SECONDS = 60 * 60 * 24 * 7;
export type AuthUser = { id: string; email: string; organizationId: string; role?: TeamRole; emailVerified?: boolean; verificationRequired?: boolean };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [salt, hash] = encoded.split(':');
  const actual = await scrypt(password, salt, 64) as Buffer;
  const expected = Buffer.from(hash, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
function tokenFrom(request: Request): string | undefined {
  return request.headers.get('cookie')?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
}
async function sessionIdentity(request: Request): Promise<AuthUser> {
  const token = tokenFrom(request);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new HttpError(401, 'Sign in to continue.');
  const database = await db();
  const [user] = await database.all(`SELECT u.id, u.email, u.organization_id FROM users u JOIN auth_sessions s ON s.user_id = u.id WHERE s.token_hash = ? AND s.expires_at > ?`, [digest(token), new Date().toISOString()]);
  if (!user) throw new HttpError(401, 'Your session has expired. Please sign in.');
  return { id: String(user.id), email: String(user.email), organizationId: String(user.organization_id) };
}
export async function requireUser(request: Request): Promise<AuthUser> {
  const user = await sessionIdentity(request);
  const member = await getActiveMembership(user);
  const path = new URL(request.url).pathname;
  const flags = await accountFlags(user);
  if (flags.verificationRequired && !flags.emailVerified && !path.startsWith('/api/account/') && path !== '/api/auth') throw new HttpError(403, 'Verify your email to access this workspace. Open account security to request a verification link.');
  if (member.role === 'viewer' && !path.startsWith('/api/account/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) throw new HttpError(403, 'Viewer access is read-only. Ask an owner for operator access.');
  if ((path === '/api/integrations' || path.startsWith('/api/integrations/')) && member.role !== 'owner') throw new HttpError(403, 'Only workspace owners can manage integrations.');
  return { ...user, role: member.role, ...flags };
}

// Bound the per-process limiter. A shared limiter is needed for a multi-instance public deployment.
const attempts = new Map<string, { count: number; until: number }>();
function limitAttempt(email: string): void {
  const now = Date.now();
  if (attempts.size > 5000) for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  if (attempts.size > 10000) throw new HttpError(429, 'Too many sign-in requests. Try again later.');
  const previous = attempts.get(email);
  const entry = previous && previous.until > now ? previous : { count: 0, until: now + 15 * 60 * 1000 };
  entry.count += 1; attempts.set(email, entry);
  if (entry.count > 20) throw new HttpError(429, 'Too many sign-in attempts. Try again in 15 minutes.');
}
export async function authenticate(body: Record<string, unknown>, request: Request): Promise<{ user: AuthUser; cookie: string }> {
  const mode = field(body, 'mode', 20);
  if (!['register', 'login'].includes(mode)) throw new HttpError(400, 'Choose register or login.');
  const email = field(body, 'email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  // Preserve password whitespace; credentials are not prose.
  const password = body.password;
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw new HttpError(400, 'Use a password between 8 and 128 characters.');
  limitAttempt(email);
  const database = await db();
  let [row] = await database.all('SELECT id, email, organization_id, password_hash FROM users WHERE email = ?', [email]);
  if (mode === 'register') {
    assertRegistrationReady();
    if (row) throw new HttpError(409, 'An account with this email already exists. Sign in instead.');
    const name = field(body, 'organization', 120, false) || 'My workspace';
    const id = randomUUID(); const organizationId = randomUUID(); const now = new Date().toISOString();
    const passwordHash = await hashPassword(password);
    try {
      await database.batch([
        { sql: 'INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)', params: [organizationId, name, now] },
        { sql: 'INSERT INTO users (id, email, password_hash, organization_id, created_at) VALUES (?, ?, ?, ?, ?)', params: [id, email, passwordHash, organizationId, now] },
        ...ownerRegistrationStatements({ id, email, organizationId }),
        ...accountRegistrationStatements({ id, email, organizationId }),
      ]);
    } catch (error) {
      if ((await database.all('SELECT id FROM users WHERE email = ?', [email])).length) throw new HttpError(409, 'An account with this email already exists. Sign in instead.');
      throw error;
    }
    row = { id, email, organization_id: organizationId, password_hash: passwordHash };
  } else {
    // A dummy hash avoids a fast exit revealing whether an account exists.
    const hash = row ? String(row.password_hash) : '00000000000000000000000000000000:' + '00'.repeat(64);
    if (!await verifyPassword(password, hash) || !row) throw new HttpError(401, 'Email or password is incorrect.');
  }
  attempts.delete(email);
  const user = { id: String(row.id), email, organizationId: String(row.organization_id) };
  const member = await getActiveMembership(user);
  return establishSession({ ...user, role: member.role }, request, String(row.password_hash));
}
async function establishSession(user: AuthUser, request: Request, expectedPasswordHash?: string, signedInSession?: string): Promise<{ user: AuthUser; cookie: string }> {
  const database = await db();
  const token = randomBytes(32).toString('hex');
  await database.run('DELETE FROM auth_sessions WHERE expires_at <= ?', [new Date().toISOString()]);
  const member = await commitForActiveMember(user, [
    ...(expectedPasswordHash ? [{ sql: 'UPDATE users SET password_hash = password_hash WHERE id = ? AND password_hash = ?', params: [user.id, expectedPasswordHash], expectedChanges: 1 }] : []),
    ...(signedInSession ? [{ sql: 'UPDATE auth_sessions SET expires_at = expires_at WHERE token_hash = ? AND user_id = ? AND expires_at > ?', params: [digest(signedInSession), user.id, new Date().toISOString()], expectedChanges: 1 }] : []),
    { sql: 'INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', params: [digest(token), user.id, new Date(Date.now() + SESSION_SECONDS * 1000).toISOString()] },
  ]);
  return { user: { ...user, role: member.role, ...await accountFlags(user) }, cookie: sessionCookie(token, request, SESSION_SECONDS) };
}
export async function joinInvitation(body: Record<string, unknown>, request: Request) {
  const email = field(body, 'email', 254).toLowerCase(), token = field(body, 'token', 64);
  limitAttempt(email);
  let signedIn: AuthUser | undefined;
  if (tokenFrom(request)) {
    try { signedIn = await sessionIdentity(request); }
    catch (error) { if (!(error instanceof HttpError) || error.status !== 401) throw error; }
  }
  if (signedIn && signedIn.email !== email) throw new HttpError(403, 'You are signed in with a different email. Sign out before using this invitation.');
  const [account] = await (await db()).all('SELECT id, email, organization_id, password_hash FROM users WHERE email = ?', [email]);
  let passwordHash = '', verifiedAccount = signedIn;
  if (!account || !signedIn) {
    const password = body.password;
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw new HttpError(400, 'Use a password between 8 and 128 characters.');
    if (account) {
      if (!await verifyPassword(password, String(account.password_hash))) throw new HttpError(401, 'Email or password is incorrect.');
      verifiedAccount = { id: String(account.id), email, organizationId: String(account.organization_id) };
    } else passwordHash = await hashPassword(password);
  }
  const user = await acceptInvitation(token, email, passwordHash, verifiedAccount);
  attempts.delete(email);
  return establishSession(user, request, account ? String(account.password_hash) : passwordHash, signedIn ? tokenFrom(request) : undefined);
}
function sessionCookie(token: string, request: Request, age: number): string {
  const secure = new URL(process.env.APP_URL || request.url).protocol === 'https:';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`;
}
export async function logout(request: Request): Promise<string> {
  const token = tokenFrom(request);
  if (token) await (await db()).run('DELETE FROM auth_sessions WHERE token_hash = ?', [digest(token)]);
  return sessionCookie('', request, 0);
}
