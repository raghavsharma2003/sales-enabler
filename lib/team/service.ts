import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db, WriteConflictError, type Database } from '../server/db';
import type { AuthUser } from '../server/auth';
import { HttpError } from '../server/http';
import type { TeamInvitation, TeamMember, TeamRole } from './contracts';

type Statement = Parameters<Database['batch']>[0][number];
type StoredInvite = Omit<TeamInvitation, 'status'> & { status: 'pending' | 'accepted' | 'revoked'; tokenHash: string; invitedBy: string };
const stateId = (org: string) => `team:state:${org}`;
const memberId = (id: string) => `team:member:${id}`;
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const now = () => new Date().toISOString();
const insert = (id: string, org: string, kind: string, status: string, data: unknown): Statement => ({ sql: 'INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [id, org, kind, status, JSON.stringify(data), now()] });
export function ownerRegistrationStatements(user: AuthUser): Statement[] {
  return [insert(stateId(user.organizationId), user.organizationId, 'team:state', 'active', { originalOwnerId: user.id, revision: 0 }), insert(memberId(user.id), user.organizationId, 'team:member', 'active', { userId: user.id, email: user.email, role: 'owner', status: 'active', updatedAt: now(), authorizationVersion: randomUUID() })];
}
// Persist the original first user once. A removed/demoted owner never becomes owner again through migration.
async function ensureLegacyClaim(org: string, databaseOverride?: Database) {
  const database = databaseOverride ?? await db();
  if ((await database.all('SELECT id FROM entities WHERE id = ?', [stateId(org)])).length) return;
  const [first] = await database.all('SELECT id, email FROM users WHERE organization_id = ? ORDER BY created_at ASC, id ASC LIMIT 1', [org]);
  if (!first) throw new HttpError(403, 'Workspace membership is unavailable.');
  const statements = ownerRegistrationStatements({ id: String(first.id), email: String(first.email), organizationId: org });
  try { await database.batch(statements); }
  catch (error) { if (!(await database.all('SELECT id FROM entities WHERE id = ?', [stateId(org)])).length) throw error; }
}
export async function getActiveMembership(user: AuthUser): Promise<TeamMember> {
  await ensureLegacyClaim(user.organizationId);
  const [row] = await (await db()).all('SELECT e.data FROM entities e JOIN users u ON u.id = ? AND u.organization_id = e.organization_id WHERE e.id = ? AND e.organization_id = ? AND e.kind = ? AND e.status = ?', [user.id, memberId(user.id), user.organizationId, 'team:member', 'active']);
  if (!row) throw new HttpError(403, 'Your workspace access has been removed. Contact a workspace owner.');
  return JSON.parse(String(row.data)) as TeamMember;
}
export async function requireWorkspaceOwner(user: AuthUser): Promise<void> {
  if ((await getActiveMembership(user)).role !== 'owner') throw new HttpError(403, 'Only workspace owners can manage team access and integrations.');
}
export async function requireWorkspaceOperator(user: AuthUser): Promise<void> {
  if ((await getActiveMembership(user)).role === 'viewer') throw new HttpError(403, 'Viewer access is read-only. Ask an owner for operator access.');
}
async function membershipFence(user: AuthUser, allowedRoles: readonly TeamRole[], databaseOverride?: Database): Promise<Statement> {
  const database = databaseOverride ?? await db();
  await ensureLegacyClaim(user.organizationId, database);
  // Authorize precisely this row and retain its original bytes for the transactional comparison.
  // Do not call a separate validator and then reread: that could capture a newly revoked row.
  const [row] = await database.all('SELECT e.data FROM entities e JOIN users u ON u.id = ? AND u.organization_id = e.organization_id WHERE e.id = ? AND e.organization_id = ? AND e.kind = ? AND e.status = ?', [user.id, memberId(user.id), user.organizationId, 'team:member', 'active']);
  if (!row) throw new HttpError(403, 'Your workspace access has been removed. Contact a workspace owner.');
  const serialized = String(row.data), member = JSON.parse(serialized) as TeamMember;
  if (member.userId !== user.id || member.status !== 'active' || !allowedRoles.includes(member.role)) throw new HttpError(403, 'Your current workspace role does not allow this action.');
  // The no-op UPDATE acquires the membership row lock for the entire caller batch.
  // A completed role change/removal makes this match zero rows and rolls back that batch.
  return {
    sql: 'UPDATE entities SET data = ? WHERE id = ? AND organization_id = ? AND kind = ? AND status = ? AND data = ? AND EXISTS (SELECT 1 FROM users WHERE id = ? AND organization_id = ?)',
    params: [serialized, memberId(user.id), user.organizationId, 'team:member', 'active', serialized, user.id, user.organizationId],
    expectedChanges: 1,
  };
}
/** Put first in the same Database.batch as the authorized write or dispatch reservation. */
export function operatorMembershipFence(user: AuthUser, database?: Database): Promise<Statement> {
  return membershipFence(user, ['owner', 'operator'], database);
}
/** Owner-only equivalent for integration authorization or other privileged writes. */
export function ownerMembershipFence(user: AuthUser, database?: Database): Promise<Statement> {
  return membershipFence(user, ['owner'], database);
}
export async function activeWorkspaceOwner(org: string): Promise<AuthUser> {
  await ensureLegacyClaim(org);
  const rows = await (await db()).all('SELECT e.data, u.id, u.email FROM entities e JOIN users u ON e.id = ? || u.id WHERE e.organization_id = ? AND u.organization_id = ? AND e.kind = ? AND e.status = ? ORDER BY u.created_at ASC, u.id ASC', ['team:member:', org, org, 'team:member', 'active']);
  const owner = rows.find(row => (JSON.parse(String(row.data)) as TeamMember).role === 'owner');
  if (!owner) throw new HttpError(403, 'This workspace has no active owner.');
  return { id: String(owner.id), email: String(owner.email), organizationId: org, role: 'owner' };
}
async function epoch(org: string) {
  await ensureLegacyClaim(org);
  const [row] = await (await db()).all('SELECT data FROM entities WHERE id = ? AND organization_id = ?', [stateId(org), org]);
  const value = JSON.parse(String(row.data)) as { revision: number; originalOwnerId: string };
  return { sql: 'UPDATE entities SET data = ? WHERE id = ? AND data = ?', params: [JSON.stringify({ ...value, revision: value.revision + 1 }), stateId(org), String(row.data)], expectedChanges: 1 } satisfies Statement;
}
async function commit(statements: Statement[]) {
  try { await (await db()).batch(statements); }
  catch (error) { if (error instanceof WriteConflictError) throw new HttpError(409, 'Team access changed. Refresh and try again.'); throw error; }
}
// Session creation shares the membership fence: a concurrent removal cannot leave a fresh session behind.
export async function commitForActiveMember(user: AuthUser, statements: Statement[]): Promise<TeamMember> {
  const fence = await epoch(user.organizationId), member = await getActiveMembership(user);
  await commit([fence, ...statements]); return member;
}
function audit(user: AuthUser, entity: string, event: string): Statement {
  return { sql: 'INSERT INTO audit_events (id, organization_id, user_id, entity_id, event, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [randomUUID(), user.organizationId, user.id, entity, event, now()] };
}
function role(input: unknown): TeamRole {
  if (input !== 'owner' && input !== 'operator' && input !== 'viewer') throw new HttpError(400, 'Choose owner, operator, or viewer.');
  return input;
}
export async function listTeam(user: AuthUser) {
  const member = await getActiveMembership(user);
  const rows = await (await db()).all('SELECT kind, data FROM entities WHERE organization_id = ? AND kind IN (?, ?) ORDER BY created_at ASC', [user.organizationId, 'team:member', 'team:invite']);
  return { role: member.role, members: rows.filter(row => row.kind === 'team:member').map(row => JSON.parse(String(row.data)) as TeamMember), invitations: member.role === 'owner' ? rows.filter(row => row.kind === 'team:invite').map(row => {
    const { tokenHash: _hash, invitedBy: _actor, ...invite } = JSON.parse(String(row.data)) as StoredInvite;
    return { ...invite, status: invite.status === 'pending' && invite.expiresAt <= now() ? 'expired' : invite.status };
  }) : [] };
}
export async function inviteMember(user: AuthUser, emailInput: unknown, roleInput: unknown) {
  const fence = await epoch(user.organizationId); await requireWorkspaceOwner(user);
  const email = typeof emailInput === 'string' ? emailInput.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  const assignedRole = role(roleInput), team = await listTeam(user);
  if (team.members.some(member => member.email === email && member.status === 'active')) throw new HttpError(409, 'This person already has workspace access.');
  if (team.invitations.some(invite => invite.email === email && invite.status === 'pending')) throw new HttpError(409, 'A pending invitation already exists. Revoke it before creating another.');
  const [account] = await (await db()).all('SELECT organization_id FROM users WHERE email = ?', [email]);
  if (account && account.organization_id !== user.organizationId) throw new HttpError(409, 'This email already belongs to another workspace. Multi-workspace accounts are not supported yet.');
  const token = randomBytes(32).toString('hex'), id = `team:invite:${digest(token)}`;
  const invite: StoredInvite = { id, email, role: assignedRole, status: 'pending', createdAt: now(), expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(), tokenHash: digest(token), invitedBy: user.id };
  await commit([fence, insert(id, user.organizationId, 'team:invite', 'pending', invite), audit(user, id, 'team.invited')]);
  return { id, token, expiresAt: invite.expiresAt };
}
export async function revokeInvitation(user: AuthUser, id: string) {
  const fence = await epoch(user.organizationId); await requireWorkspaceOwner(user);
  const [row] = await (await db()).all('SELECT data FROM entities WHERE id = ? AND organization_id = ? AND kind = ? AND status = ?', [id, user.organizationId, 'team:invite', 'pending']);
  if (!row) throw new HttpError(404, 'Pending invitation not found.');
  const invite = JSON.parse(String(row.data)) as StoredInvite;
  await commit([fence, { sql: 'UPDATE entities SET status = ?, data = ? WHERE id = ? AND data = ?', params: ['revoked', JSON.stringify({ ...invite, status: 'revoked' }), id, String(row.data)], expectedChanges: 1 }, audit(user, id, 'team.invitation_revoked')]);
}
export async function updateMember(user: AuthUser, userId: string, action: 'role' | 'remove', roleInput?: unknown) {
  const fence = await epoch(user.organizationId); await requireWorkspaceOwner(user);
  const team = await listTeam(user), member = team.members.find(item => item.userId === userId && item.status === 'active');
  if (!member) throw new HttpError(404, 'Active member not found.');
  const assignedRole = action === 'role' ? role(roleInput) : member.role;
  if (member.role === 'owner' && (action === 'remove' || assignedRole !== 'owner') && team.members.filter(item => item.role === 'owner' && item.status === 'active').length <= 1) throw new HttpError(409, 'Keep at least one active owner. Assign another owner first.');
  const next = { ...member, role: assignedRole, status: action === 'remove' ? 'removed' : 'active', updatedAt: now(), authorizationVersion: randomUUID() };
  await commit([fence, { sql: 'UPDATE entities SET status = ?, data = ? WHERE id = ? AND organization_id = ? AND status = ?', params: [next.status, JSON.stringify(next), memberId(userId), user.organizationId, 'active'], expectedChanges: 1 }, ...(action === 'remove' ? [{ sql: 'DELETE FROM auth_sessions WHERE user_id = ?', params: [userId] }] : []), audit(user, memberId(userId), action === 'remove' ? 'team.member_removed' : `team.role_${assignedRole}`)]);
}
export async function invitationDetails(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(400, 'This invitation link is invalid.');
  const [row] = await (await db()).all('SELECT e.organization_id, e.data, o.name FROM entities e JOIN organizations o ON o.id = e.organization_id WHERE e.id = ? AND e.kind = ? AND e.status = ?', [`team:invite:${digest(token)}`, 'team:invite', 'pending']);
  if (!row) throw new HttpError(410, 'This invitation was used or revoked. Ask an owner for a new link.');
  const invite = JSON.parse(String(row.data)) as StoredInvite;
  if (invite.expiresAt <= now()) throw new HttpError(410, 'This invitation expired. Ask an owner for a new link.');
  return { invite, organizationId: String(row.organization_id), organizationName: String(row.name), serialized: String(row.data) };
}
export async function acceptInvitation(token: string, email: string, passwordHash: string, verifiedAccount?: AuthUser): Promise<AuthUser> {
  const first = await invitationDetails(token), fence = await epoch(first.organizationId), details = await invitationDetails(token);
  if (email !== details.invite.email) throw new HttpError(403, 'Use the exact email address this invitation was sent to.');
  const [existing] = await (await db()).all('SELECT id, organization_id FROM users WHERE email = ?', [email]);
  if (existing && (existing.organization_id !== details.organizationId || existing.id !== verifiedAccount?.id)) throw new HttpError(403, 'Sign in with the invited account. Accounts cannot be moved between workspaces.');
  const id = existing ? String(existing.id) : randomUUID(), user: AuthUser = { id, email, organizationId: details.organizationId, role: details.invite.role };
  const member: TeamMember & { authorizationVersion: string } = { userId: id, email, role: details.invite.role, status: 'active', updatedAt: now(), authorizationVersion: randomUUID() };
  const statements: Statement[] = [fence, { sql: 'UPDATE entities SET status = ?, data = ? WHERE id = ? AND status = ? AND data = ?', params: ['accepted', JSON.stringify({ ...details.invite, status: 'accepted' }), details.invite.id, 'pending', details.serialized], expectedChanges: 1 }];
  if (!existing) statements.push({ sql: 'INSERT INTO users (id, email, password_hash, organization_id, created_at) VALUES (?, ?, ?, ?, ?)', params: [id, email, passwordHash, details.organizationId, now()] });
  // Re-admission is explicit through a fresh invite; never overwrite an active member.
  const [previous] = await (await db()).all('SELECT status FROM entities WHERE id = ?', [memberId(id)]);
  if (previous?.status === 'active') throw new HttpError(409, 'This account already has workspace access.');
  if (previous) statements.push({ sql: 'UPDATE entities SET data = ?, status = ? WHERE id = ? AND organization_id = ? AND status = ?', params: [JSON.stringify(member), 'active', memberId(id), details.organizationId, 'removed'], expectedChanges: 1 });
  else statements.push(insert(memberId(id), details.organizationId, 'team:member', 'active', member));
  statements.push(audit(user, details.invite.id, 'team.invitation_accepted'));
  await commit(statements); return user;
}
