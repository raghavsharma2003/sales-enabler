import { requireUser } from '@/lib/server/auth';
import { apiError, json } from '@/lib/server/http';
import { getOfferingInsights } from '@/lib/business/insights';

export const runtime = 'nodejs';
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    return json(await getOfferingInsights(await requireUser(request), url.searchParams.get('offeringId') || '', {
      from: url.searchParams.get('from') || undefined, to: url.searchParams.get('to') || undefined,
    }));
  } catch (error) { return apiError(error); }
}
