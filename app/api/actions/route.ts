import { createRoute } from '@/lib/server/routes';
import { createAction } from '@/lib/server/store';
export const runtime = 'nodejs';
export const POST = createRoute(createAction);
