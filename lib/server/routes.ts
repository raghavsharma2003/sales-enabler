import { requireUser, assertSameOrigin, type AuthUser } from './auth';
import { apiError, readBody, json, field } from './http';
import { transition, type Entity } from './store';

export function createRoute(create: (user: AuthUser, body: Record<string, unknown>) => Promise<Entity>) {
  return async (request: Request): Promise<Response> => {
    try {
      assertSameOrigin(request);
      const user = await requireUser(request);
      return json(await create(user, await readBody(request)), 201);
    } catch (error) { return apiError(error); }
  };
}
export function transitionRoute(kind: 'memory' | 'action') {
  return async (request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> => {
    try {
      assertSameOrigin(request);
      const user = await requireUser(request);
      const body = await readBody(request);
      return json(await transition(user, kind, (await context.params).id, field(body, 'status', 30)));
    } catch (error) { return apiError(error); }
  };
}
