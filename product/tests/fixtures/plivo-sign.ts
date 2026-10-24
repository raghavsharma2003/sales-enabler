// Sign a request the way Plivo does (X-Plivo-Signature-V3 + nonce), for tests that play the carrier.
import { randomUUID } from 'node:crypto';
import { plivoBase, plivoSign } from '../../server/modules/campaigns/plivo-signature.ts';

export function plivoHeaders(token: string, method: string, url: string, form?: Record<string, string>, nonce: string = randomUUID()): Record<string, string> {
  const body = new Map(Object.entries(form ?? {}).map(([k, v]) => [k, [v]]));
  return { 'x-plivo-signature-v3': plivoSign(token, plivoBase(method, url, body), nonce), 'x-plivo-signature-v3-nonce': nonce,
    ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) };
}

/** fetch() as Plivo would: the signature covers `publicUrl`; the request goes to `sendTo` (the proxy's upstream). */
export function plivoFetch(token: string, publicUrl: string, sendTo: string, form?: Record<string, string>, o: { method?: string; nonce?: string } = {}) {
  const method = o.method ?? 'POST';
  return fetch(sendTo, { method, headers: plivoHeaders(token, method, publicUrl, form, o.nonce), body: form ? new URLSearchParams(form).toString() : undefined });
}
