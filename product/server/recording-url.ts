// Signed, short-lived links to a call recording on the voice runtime (GET {base}/v1/recordings/{callId}). The runtime
// checks the same signature (product/voice/vpvoice/recordings.py) over the same bytes:
//   sig = hex hmac_sha256(VP_RUNTIME_SECRET, 'vp-recording.v1\n' + callId + '\n' + workspaceId + '\n' + exp)
// exp is unix seconds. The runtime refuses a link that has expired, lives more than an hour, or names another workspace
// than the one the recording was made for. The base is the runtime's PUBLIC address (VP_RUNTIME_PUBLIC_URL, e.g. the
// staging Caddy on :8443), falling back to VP_RUNTIME_URL when the browser can reach that directly (development).
import { createHmac } from 'node:crypto';

export const RECORDING_LINK_TTL_S = 600;
const PREFIX = 'vp-recording.v1';

export function recordingSignature(secret: string, callId: string, workspaceId: string, exp: number): string {
  return createHmac('sha256', secret).update(`${PREFIX}\n${callId}\n${workspaceId}\n${Math.floor(exp)}`).digest('hex');
}

export function recordingBase(env: NodeJS.ProcessEnv = process.env): string | null {
  const b = (env.VP_RUNTIME_PUBLIC_URL || env.VP_RUNTIME_URL || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(b) ? b : null;
}

/** A fresh link, or null when no runtime address or secret is configured. */
export function recordingLink(callId: string, workspaceId: string, o: { now?: number; ttlS?: number; env?: NodeJS.ProcessEnv } = {}): { url: string; expiresAt: string } | null {
  const env = o.env ?? process.env;
  const base = recordingBase(env), secret = env.VP_RUNTIME_SECRET;
  if (!base || !secret || secret.length < 32) return null;
  const exp = Math.floor((o.now ?? Date.now()) / 1000) + (o.ttlS ?? RECORDING_LINK_TTL_S);
  const q = new URLSearchParams({ ws: workspaceId, exp: String(exp), sig: recordingSignature(secret, callId, workspaceId, exp) });
  return { url: `${base}/v1/recordings/${encodeURIComponent(callId)}?${q}`, expiresAt: new Date(exp * 1000).toISOString() };
}
