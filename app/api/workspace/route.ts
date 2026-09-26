import { requireUser } from '@/lib/server/auth';
import { apiError, json } from '@/lib/server/http';
import { workspace } from '@/lib/server/store';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { return json(await workspace(await requireUser(request))); }
  catch (error) { return apiError(error); }
}
