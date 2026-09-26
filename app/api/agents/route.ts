import { createRoute } from '@/lib/server/routes';
import { saveAgent } from '@/lib/server/store';
export const runtime = 'nodejs';
export const POST = createRoute(saveAgent);
