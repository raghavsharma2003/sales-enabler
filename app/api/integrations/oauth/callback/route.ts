import { requireUser } from '@/lib/server/auth';
import { completeOAuth, consumeFlow, appOrigin } from '@/lib/integrations/oauth';
import { requireWorkspaceOwner } from '@/lib/integrations/vault';

export const runtime = 'nodejs';
function finish(result: 'connected' | 'error'): Response {
  const target = new URL('/', appOrigin());
  target.searchParams.set('integration', result);
  target.hash = 'Integrations';
  return new Response(null, { status: 303, headers: { Location: target.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await requireWorkspaceOwner(user);
    const url = new URL(request.url), state = url.searchParams.get('state') || '';
    if (url.searchParams.has('error')) {
      await consumeFlow(user, state);
      return finish('error');
    }
    await completeOAuth(user, state, url.searchParams.get('code') || '');
    return finish('connected');
  } catch { return finish('error'); }
}
