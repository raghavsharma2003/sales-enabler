import { assertSameOrigin, joinInvitation } from '@/lib/server/auth';
import { apiError, field, HttpError, json, readBody } from '@/lib/server/http';
import { invitationDetails } from '@/lib/team/service';
export const runtime = 'nodejs';
// POST keeps invitation credentials out of URL logs and referrers.
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readBody(request);
    if (body.action === 'inspect') {
      const result = await invitationDetails(field(body, 'token', 64));
      return json({ email: result.invite.email, role: result.invite.role, expiresAt: result.invite.expiresAt, organizationName: result.organizationName });
    }
    if (body.action !== 'accept') throw new HttpError(400, 'Choose inspect or accept.');
    const result = await joinInvitation(body, request);
    return json({ user: result.user }, 200, { 'Set-Cookie': result.cookie });
  } catch (error) { return apiError(error); }
}
