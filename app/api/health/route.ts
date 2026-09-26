import { checkReadiness } from '@/lib/server/health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public probes deliberately disclose no settings, schema names, tenant data or errors.
export async function GET(request: Request) {
  const ready = new URL(request.url).searchParams.get('ready') === '1';
  const healthy = !ready || (await checkReadiness()).ready;
  return Response.json({ status: healthy ? (ready ? 'ready' : 'alive') : 'unavailable' }, {
    status: healthy ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
