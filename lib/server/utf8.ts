/** Measure the bytes actually carried by a UTF-8 provider field or serialized payload. */
export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

/** The boundary is inclusive: a payload of exactly `limit` bytes is admitted. */
export function fitsUtf8Budget(value: string, limit: number): boolean {
  return Number.isSafeInteger(limit) && limit >= 0 && utf8ByteLength(value) <= limit;
}
