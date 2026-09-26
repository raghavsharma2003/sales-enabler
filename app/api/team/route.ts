import { assertSameOrigin, requireUser } from '@/lib/server/auth';
import { apiError, field, HttpError, json, readBody } from '@/lib/server/http';
import { inviteMember, listTeam, revokeInvitation, updateMember } from '@/lib/team/service';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { return json(await listTeam(await requireUser(request))); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request), body = await readBody(request);
    if (body.action === 'invite') {
      const invite = await inviteMember(user, body.email, body.role);
      const base = new URL(process.env.APP_URL || request.url).origin;
      return json({ id: invite.id, expiresAt: invite.expiresAt, inviteUrl: `${base}/join#${invite.token}` }, 201);
    }
    if (body.action === 'revoke') await revokeInvitation(user, field(body, 'id', 150));
    else if (body.action === 'role' || body.action === 'remove') await updateMember(user, field(body, 'userId', 150), body.action, body.role);
    else throw new HttpError(400, 'Choose invite, revoke, role, or remove.');
    return json({ ok: true });
  } catch (error) { return apiError(error); }
}
