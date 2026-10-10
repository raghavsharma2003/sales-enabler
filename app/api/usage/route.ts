import { requireUser } from '@/lib/server/auth';
import { apiError, json } from '@/lib/server/http';
import { getUsageSnapshot } from '@/lib/usage/service';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { return json(await getUsageSnapshot(await requireUser(request))); }
  catch (error) { return apiError(error); }
}
