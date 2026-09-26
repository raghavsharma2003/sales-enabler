import { createRoute } from '@/lib/server/routes';
import { createKnowledge } from '@/lib/server/store';
export const runtime = 'nodejs';
export const POST = createRoute(createKnowledge);
