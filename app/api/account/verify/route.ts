import { assertSameOrigin } from '@/lib/server/auth';
import { json, readBody } from '@/lib/server/http';
import { redeemAccountToken } from '@/lib/auth-lifecycle/service';
import { accountError } from '@/lib/auth-lifecycle/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertSameOrigin(request); const body = await readBody(request);
    await redeemAccountToken(body.token, 'verify', body.password);
    return json({ ok: true });
  } catch (error) { return accountError(error); }
}

