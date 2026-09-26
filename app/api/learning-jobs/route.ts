import { requireUser } from '@/lib/server/auth';
import { apiError, json } from '@/lib/server/http';
import { listLearningJobs } from '@/lib/learning-jobs/engine';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const user = await requireUser(request), params = new URL(request.url).searchParams;
    return json(await listLearningJobs(user, { deploymentId: params.get('deploymentId') || undefined, sessionId: params.get('sessionId') || undefined }));
  } catch (error) { return apiError(error); }
}
