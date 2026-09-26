import { after } from 'next/server';
import { assertSameOrigin } from '@/lib/server/auth';
import { json, readBody } from '@/lib/server/http';
import { genericEmailResponse, requestAccountEmail } from '@/lib/auth-lifecycle/service';
import { dispatchAccountMail } from '@/lib/auth-lifecycle/delivery';
import { accountError } from '@/lib/auth-lifecycle/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertSameOrigin(request); const body = await readBody(request);
    // Work after the generic response prevents database/provider latency from exposing account existence.
    after(async () => {
      try { const id = await requestAccountEmail(body.email, 'reset', request); if (id) await dispatchAccountMail(id); }
      catch { /* Safe generic response; never log account or token material. */ }
    });
    return json(genericEmailResponse);
  } catch (error) { return accountError(error); }
}

