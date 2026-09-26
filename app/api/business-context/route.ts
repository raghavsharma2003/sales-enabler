import { requireUser, assertSameOrigin } from '@/lib/server/auth';
import { apiError, json, readBody } from '@/lib/server/http';
import { handleBusinessContextAction, listBusinessContext } from '@/lib/business/engine';

export const runtime = 'nodejs';
export async function GET(request: Request): Promise<Response> {
  try { return json(await listBusinessContext(await requireUser(request))); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request): Promise<Response> {
  try { assertSameOrigin(request); return json(await handleBusinessContextAction(await requireUser(request), await readBody(request))); }
  catch (error) { return apiError(error); }
}
