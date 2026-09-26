import { createRoute } from '@/lib/server/routes';
import { createContact } from '@/lib/server/store';
export const runtime = 'nodejs';
export const POST = createRoute(createContact);
