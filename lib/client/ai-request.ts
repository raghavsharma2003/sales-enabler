/** Stable, bounded request IDs for paid browser actions. Only a digest is stored in browser storage. */
export type RequestStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type RequestCrypto = { subtle: Pick<SubtleCrypto, 'digest'>; randomUUID: () => string };
export type RequestEnvironment = { storage?: RequestStorage | null; crypto?: RequestCrypto };

const prefix = 'company:ai-request:v1:';
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter(key => record[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
}
async function hash(value: string, cryptoApi: RequestCrypto): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function sha256Hex(value: string, provided: RequestEnvironment = {}): Promise<string> {
  return hash(value, environment(provided).cryptoApi);
}
function environment(provided: RequestEnvironment): { storage: RequestStorage | null; cryptoApi: RequestCrypto } {
  const cryptoApi = provided.crypto || globalThis.crypto;
  if (!cryptoApi?.subtle?.digest) throw new Error('Secure browser hashing is unavailable.');
  let storage = provided.storage === undefined ? null : provided.storage;
  if (provided.storage === undefined) {
    try { storage = globalThis.localStorage; } catch { storage = null; }
  }
  return { storage: storage || null, cryptoApi };
}
async function keyFor(scope: string, input: unknown, cryptoApi: RequestCrypto): Promise<string> {
  if (!scope || scope.length > 160) throw new Error('A bounded AI request scope is required.');
  return prefix + await hash(stable([scope, input]), cryptoApi);
}
/** Same scope and input always reuse the same ID, including after failure or reload. */
export async function aiRequestId(scope: string, input: unknown, provided: RequestEnvironment = {}): Promise<string> {
  const { storage, cryptoApi } = environment(provided);
  const key = await keyFor(scope, input, cryptoApi);
  let nonce = 'base';
  try { nonce = storage?.getItem(key) || 'base'; } catch { /* Deterministic base ID still survives reload. */ }
  return `ar_${await hash(`${key}:${nonce}`, cryptoApi)}`;
}
/** Call only from a separate, deliberate "new attempt" action. Never from an error handler. */
export async function newAiRequestAttempt(scope: string, input: unknown, provided: RequestEnvironment = {}): Promise<string> {
  const { storage, cryptoApi } = environment(provided);
  if (!storage) throw new Error('Browser storage is required to persist a new AI attempt.');
  const key = await keyFor(scope, input, cryptoApi);
  const nonce = cryptoApi.randomUUID();
  try { storage.setItem(key, nonce); }
  catch { throw new Error('Could not persist the new AI attempt in this browser.'); }
  return `ar_${await hash(`${key}:${nonce}`, cryptoApi)}`;
}
