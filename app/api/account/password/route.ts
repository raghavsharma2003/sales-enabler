import { assertSameOrigin, logout, requireUser } from '@/lib/server/auth';
import { json, readBody } from '@/lib/server/http';
import { changeAccountPassword } from '@/lib/auth-lifecycle/service';
import { accountError } from '@/lib/auth-lifecycle/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertSameOrigin(request); const user = await requireUser(request), body = await readBody(request);
    await changeAccountPassword(user, request, body.currentPassword, body.password);
    return json({ ok: true }, 200, { 'Set-Cookie': await logout(request) });
  } catch (error) { return accountError(error); }
}

