import { HttpError, json } from '../server/http';
export function accountError(error: unknown): Response {
  // Never feed provider exceptions, tokens, request bodies or cryptographic material to shared logs.
  return error instanceof HttpError ? json({ error: error.message }, error.status) : json({ error: 'Account access could not be updated. Please try again.' }, 503);
}
