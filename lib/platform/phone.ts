import { HttpError } from '../server/http';

/** Explicit international format only: never infer a country or a customer's identity. */
export function customerPhone(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > 50) throw new HttpError(400, 'Enter a phone number with its country code.');
  const normalized = value.trim().replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{6,14}$/.test(normalized)) throw new HttpError(400, 'Use an international phone number, for example +91 followed by the number.');
  return normalized;
}
