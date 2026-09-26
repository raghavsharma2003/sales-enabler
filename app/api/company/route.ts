import { requireUser, assertSameOrigin } from '@/lib/server/auth';
import { apiError, HttpError, json, readBody } from '@/lib/server/http';
import { addCompanyDescriptionToBrain, getCompanySettings, saveCompanySettings } from '@/lib/company/service';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try { return json(await getCompanySettings(await requireUser(request))); }
  catch (error) { return apiError(error); }
}

export async function PUT(request: Request): Promise<Response> {
  try { assertSameOrigin(request); return json(await saveCompanySettings(await requireUser(request), await readBody(request))); }
  catch (error) { return apiError(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request), body = await readBody(request);
    if (body.action !== 'add_description_to_brain') throw new HttpError(400, 'Choose a supported company action.');
    return json(await addCompanyDescriptionToBrain(user, body.revision), 201);
  } catch (error) { return apiError(error); }
}
