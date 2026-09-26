import { createRoute } from '@/lib/server/routes';
import { createMemory } from '@/lib/server/store';
export const runtime = 'nodejs';
export const POST = createRoute(createMemory);
