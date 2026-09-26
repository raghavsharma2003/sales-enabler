import { assertSameOrigin, requireUser } from '@/lib/server/auth';
import { apiError, json } from '@/lib/server/http';
import { getClone, refreshClone, revokeClone } from '@/lib/voice/cloning/service';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try { return json(await getClone(await requireUser(request), (await context.params).id)); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request, context: Context) {
  try { assertSameOrigin(request); return json(await refreshClone(await requireUser(request), (await context.params).id)); }
  catch (error) { return apiError(error); }
}
export async function DELETE(request: Request, context: Context) {
  try { assertSameOrigin(request); return json(await revokeClone(await requireUser(request), (await context.params).id)); }
  catch (error) { return apiError(error); }
}
