import { getAiUsage } from '@/lib/ai/usage';
import { requireUser } from '@/lib/server/auth';
import { apiError, json } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const raw = new URL(request.url).searchParams.get('days');
    return json(await getAiUsage(user, raw === null ? 30 : Number(raw)));
  } catch (error) { return apiError(error); }
}
