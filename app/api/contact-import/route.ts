import { requireUser, assertSameOrigin } from '@/lib/server/auth';
import { apiError, json, readBody } from '@/lib/server/http';
import { importReviewedContact } from '@/lib/ingestion/contact-review';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const result = await importReviewedContact(await requireUser(request), await readBody(request));
    return json(result, result.status === 'conflict' ? 409 : result.replayed ? 200 : 201);
  } catch (error) { return apiError(error); }
}
