import { HttpError } from '../server/http';

/** SDP is a wire format: trim() removes its required terminating CRLF. */
export function readAudioOffer(value: unknown): string {
  if (typeof value !== 'string' || value.length > 128000 || !value.startsWith('v=0') || !value.includes('m=audio')) {
    throw new HttpError(400, 'A browser audio offer is required.');
  }
  return value;
}
