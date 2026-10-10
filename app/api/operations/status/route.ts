import { getOperationsStatus } from '@/lib/operations/status';
import { requireUser } from '@/lib/server/auth';
import { apiError, json } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try { return json(await getOperationsStatus(await requireUser(request))); }
  catch (error) { return apiError(error); }
}
