import { authenticate, assertSameOrigin, logout, requireUser } from '@/lib/server/auth';
import { apiError, json, readBody } from '@/lib/server/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const result = await authenticate(await readBody(request), request);
    return json({ user: result.user }, 200, { 'Set-Cookie': result.cookie });
  } catch (error) { return apiError(error); }
}
export async function DELETE(request: Request) {
  try { assertSameOrigin(request); return json({ ok: true }, 200, { 'Set-Cookie': await logout(request) }); }
  catch (error) { return apiError(error); }
}
export async function GET(request: Request) {
  try { return json({ user: await requireUser(request) }); }
  catch (error) { return apiError(error); }
}
