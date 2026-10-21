// A small input validator with typed results. Unknown fields are rejected with their path (422),
// because silently dropping an unknown field is how a stored config drifts from what runs.

export class ValidationError extends Error {
  constructor(public path: string, message: string) { super(`${path || 'input'}: ${message}`); this.name = 'ValidationError'; }
}

export type Validator<T> = (value: unknown, path?: string) => T;

export const str = (o: { min?: number; max?: number; oneOf?: readonly string[]; pattern?: RegExp } = {}): Validator<string> => (v, p = '') => {
  if (typeof v !== 'string') throw new ValidationError(p, 'must be text');
  if (o.min !== undefined && v.length < o.min) throw new ValidationError(p, `must be at least ${o.min} characters`);
  if (o.max !== undefined && v.length > o.max) throw new ValidationError(p, `must be at most ${o.max} characters`);
  if (o.oneOf && !o.oneOf.includes(v)) throw new ValidationError(p, `must be one of: ${o.oneOf.join(', ')}`);
  if (o.pattern && !o.pattern.test(v)) throw new ValidationError(p, 'has the wrong format');
  return v;
};

export const num = (o: { min?: number; max?: number; int?: boolean } = {}): Validator<number> => (v, p = '') => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ValidationError(p, 'must be a number');
  if (o.int && !Number.isInteger(v)) throw new ValidationError(p, 'must be a whole number');
  if (o.min !== undefined && v < o.min) throw new ValidationError(p, `must be at least ${o.min}`);
  if (o.max !== undefined && v > o.max) throw new ValidationError(p, `must be at most ${o.max}`);
  return v;
};

export const bool = (): Validator<boolean> => (v, p = '') => {
  if (typeof v !== 'boolean') throw new ValidationError(p, 'must be true or false');
  return v;
};

export const uuid = (): Validator<string> =>
  str({ pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i });

export const arr = <T>(item: Validator<T>, o: { min?: number; max?: number } = {}): Validator<T[]> => (v, p = '') => {
  if (!Array.isArray(v)) throw new ValidationError(p, 'must be a list');
  if (o.min !== undefined && v.length < o.min) throw new ValidationError(p, `needs at least ${o.min} items`);
  if (o.max !== undefined && v.length > o.max) throw new ValidationError(p, `allows at most ${o.max} items`);
  return v.map((x, i) => item(x, `${p}[${i}]`));
};

export const opt = <T>(inner: Validator<T>): Validator<T | undefined> => (v, p) => (v === undefined ? undefined : inner(v, p));

/** Any JSON value, unchecked. Use only for free-form blobs the module validates itself. */
export const any = (): Validator<unknown> => v => v;

type Shape = Record<string, Validator<unknown>>;
type Out<S extends Shape> = { [K in keyof S]: ReturnType<S[K]> };

/** An object with exactly these fields. Unknown fields fail with their path. */
export const obj = <S extends Shape>(shape: S): Validator<Out<S>> => (v, p = '') => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new ValidationError(p, 'must be an object');
  const rec = v as Record<string, unknown>;
  for (const k of Object.keys(rec)) if (!(k in shape)) throw new ValidationError(p ? `${p}.${k}` : k, 'is not a known field');
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(shape)) {
    const r = val(rec[k], p ? `${p}.${k}` : k);
    if (r !== undefined) out[k] = r;
  }
  return out as Out<S>;
};
