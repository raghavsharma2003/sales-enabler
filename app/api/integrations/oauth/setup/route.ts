import { requireUser } from '@/lib/server/auth';
import { apiError, json } from '@/lib/server/http';
import { requireWorkspaceOwner } from '@/lib/integrations/vault';
import { oauthSetup } from '@/lib/integrations/oauth';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await requireWorkspaceOwner(user);
    return json(oauthSetup());
  } catch (error) { return apiError(error); }
}
