import { assertSameOrigin, requireUser } from '@/lib/server/auth';
import { apiError, field, HttpError, json, readBody } from '@/lib/server/http';
import { applyIntake, inspectIntake, previewIntake, suggestIntakeMapping } from '@/lib/data-intake/service';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request), body = await readBody(request);
    if (body.action === 'inspect') return json({ inspection: await inspectIntake(user, field(body, 'sourceId', 100)) });
    if (body.action === 'suggest') return json(await suggestIntakeMapping(user, field(body, 'sourceId', 100)));
    if (body.action === 'preview') return json({ preview: await previewIntake(user, { sourceId: field(body, 'sourceId', 100), mapping: body.mapping, cursor: body.cursor, excludedRows: body.excludedRows }) });
    if (body.action === 'apply') return json({ receipt: await applyIntake(user, { previewId: field(body, 'previewId', 100), previewHash: field(body, 'previewHash', 64), decisions: body.decisions }) });
    throw new HttpError(400, 'Choose inspect, suggest, preview, or apply.');
  } catch (error) { return apiError(error); }
}
