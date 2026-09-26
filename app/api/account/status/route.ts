import { requireUser } from '@/lib/server/auth';
import { json } from '@/lib/server/http';
import { accountStatus } from '@/lib/auth-lifecycle/service';
import { accountError } from '@/lib/auth-lifecycle/http';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { return json(await accountStatus(await requireUser(request))); }
  catch (error) { return accountError(error); }
}

