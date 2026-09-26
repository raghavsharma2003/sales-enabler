import { createRoute } from '@/lib/server/routes';
import { createSession } from '@/lib/server/store';
export const runtime = 'nodejs';
export const POST = createRoute(createSession);
