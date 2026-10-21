// A small input validator with typed results. Unknown fields are rejected with their path (422),
// because silently dropping an unknown field is how a stored config drifts from what runs.
// Every validator also carries a JSON Schema (`.schema`), so the same definition drives the HTTP API,
// the Operator's LLM tool list and MCP: one source, no hand-written schema to drift.

export class ValidationError extends Error {
  constructor(public path: string, message: string) { super(`${path || 'input'}: ${message}`); this.name = 'ValidationError'; }
}

export type JsonSchema = Record<string, unknown>;
export type Validator<T> = ((value: unknown, path?: string) => T) & { schema?: JsonSchema; optional?: boolean };

const withSchema = <T>(fn: (value: unknown, path?: string) => T, schema: JsonSchema, optional = false): Validator<T> =>
  Object.assign(fn, { schema, optional });

export const str = (o: { min?: number; max?: number; oneOf?: readonly string[]; pattern?: RegExp; desc?: string } = {}): Validator<string> => withSchema((v, p = '') => {
  if (typeof v !== 'string') throw new ValidationError(p, 'must be text');
  if (o.min !== undefined && v.length < o.min) throw new ValidationError(p, `must be at least ${o.min} characters`);
  if (o.max !== undefined && v.length > o.max) throw new ValidationError(p, `must be at most ${o.max} characters`);
  if (o.oneOf && !o.oneOf.includes(v)) throw new ValidationError(p, `must be one of: ${o.oneOf.join(', ')}`);
  if (o.pattern && !o.pattern.test(v)) throw new ValidationError(p, 'has the wrong format');
  return v;
}, { type: 'string', ...(o.oneOf ? { enum: [...o.oneOf] } : {}), ...(o.min !== undefined ? { minLength: o.min } : {}),
     ...(o.max !== undefined ? { maxLength: o.max } : {}), ...(o.pattern ? { pattern: o.pattern.source } : {}), ...(o.desc ? { description: o.desc } : {}) });

export const num = (o: { min?: number; max?: number; int?: boolean; desc?: string } = {}): Validator<number> => withSchema((v, p = '') => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ValidationError(p, 'must be a number');
  if (o.int && !Number.isInteger(v)) throw new ValidationError(p, 'must be a whole number');
  if (o.min !== undefined && v < o.min) throw new ValidationError(p, `must be at least ${o.min}`);
  if (o.max !== undefined && v > o.max) throw new ValidationError(p, `must be at most ${o.max}`);
  return v;
}, { type: o.int ? 'integer' : 'number', ...(o.min !== undefined ? { minimum: o.min } : {}), ...(o.max !== undefined ? { maximum: o.max } : {}), ...(o.desc ? { description: o.desc } : {}) });

export const bool = (): Validator<boolean> => withSchema((v, p = '') => {
  if (typeof v !== 'boolean') throw new ValidationError(p, 'must be true or false');
  return v;
}, { type: 'boolean' });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const uuid = (): Validator<string> => withSchema((v, p = '') => {
  if (typeof v !== 'string' || !UUID.test(v)) throw new ValidationError(p, 'must be an id');
  return v.toLowerCase();
}, { type: 'string', format: 'uuid' });

export const arr = <T>(item: Validator<T>, o: { min?: number; max?: number } = {}): Validator<T[]> => withSchema((v, p = '') => {
  if (!Array.isArray(v)) throw new ValidationError(p, 'must be a list');
  if (o.min !== undefined && v.length < o.min) throw new ValidationError(p, `needs at least ${o.min} items`);
  if (o.max !== undefined && v.length > o.max) throw new ValidationError(p, `allows at most ${o.max} items`);
  return v.map((x, i) => item(x, `${p}[${i}]`));
}, { type: 'array', items: item.schema ?? {}, ...(o.min !== undefined ? { minItems: o.min } : {}), ...(o.max !== undefined ? { maxItems: o.max } : {}) });

export const opt = <T>(inner: Validator<T>): Validator<T | undefined> =>
  withSchema((v, p) => (v === undefined || v === null ? undefined : inner(v, p)), inner.schema ?? {}, true);

/** Any JSON value, unchecked. Use only for free-form blobs the module validates itself. */
export const any = (desc?: string): Validator<unknown> => withSchema(v => v, desc ? { description: desc } : {});

/** A map of string keys to one value shape (e.g. per-contact facts). */
export const record = <T>(value: Validator<T>, o: { maxKeys?: number } = {}): Validator<Record<string, T>> => withSchema((v, p = '') => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new ValidationError(p, 'must be an object');
  const keys = Object.keys(v as object);
  if (o.maxKeys !== undefined && keys.length > o.maxKeys) throw new ValidationError(p, `allows at most ${o.maxKeys} keys`);
  const out: Record<string, T> = {};
  for (const k of keys) out[k] = value((v as Record<string, unknown>)[k], p ? `${p}.${k}` : k);
  return out;
}, { type: 'object', additionalProperties: value.schema ?? {} });

type Shape = Record<string, Validator<unknown>>;
type Out<S extends Shape> = { [K in keyof S]: ReturnType<S[K]> };

/** An object with exactly these fields. Unknown fields fail with their path. */
export const obj = <S extends Shape>(shape: S, desc?: string): Validator<Out<S>> => withSchema((v, p = '') => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new ValidationError(p, 'must be an object');
  const rec = v as Record<string, unknown>;
  for (const k of Object.keys(rec)) if (!(k in shape)) throw new ValidationError(p ? `${p}.${k}` : k, 'is not a known field');
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(shape)) {
    const r = val(rec[k], p ? `${p}.${k}` : k);
    if (r !== undefined) out[k] = r;
  }
  return out as Out<S>;
}, {
  type: 'object', additionalProperties: false,
  properties: Object.fromEntries(Object.entries(shape).map(([k, val]) => [k, val.schema ?? {}])),
  required: Object.entries(shape).filter(([, val]) => !val.optional).map(([k]) => k),
  ...(desc ? { description: desc } : {}),
});
