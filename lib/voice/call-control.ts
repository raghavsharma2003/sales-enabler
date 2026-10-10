import { createHash, timingSafeEqual } from 'node:crypto';
import { normalizeAzureRealtimeEndpoint } from './config';

type Environment = Record<string, string | undefined>;
/** Server-private identity. Never include it in client results, logs or context. */
export type AzureCallReference = { providerCallRef: string; providerConfigurationDigest: string };
export type HangupOutcome = { confirmed: boolean; reason: 'confirmed' | 'invalid_reference' | 'configuration_changed' | 'provider_unconfirmed' | 'transport_uncertain' };

export function azureCallConfigurationDigest(env: Environment): string | null {
  const endpoint = normalizeAzureRealtimeEndpoint(env.AZURE_OPENAI_ENDPOINT);
  const key = env.AZURE_OPENAI_API_KEY;
  if (!endpoint || !key?.trim()) return null;
  return createHash('sha256').update(JSON.stringify([endpoint, key])).digest('hex');
}

/** Only the provider response can supply Location. No caller supplied call IDs. */
export function parseAzureCallLocation(location: string | null, env: Environment): AzureCallReference | null {
  const base = normalizeAzureRealtimeEndpoint(env.AZURE_OPENAI_ENDPOINT);
  const digest = azureCallConfigurationDigest(env);
  if (!base || !digest || !location || location.length > 2048 || location.trim() !== location || /[\\\s%?#]/.test(location)) return null;
  // Reject URL-normalized dot segments and protocol-relative/credential URLs.
  if (location.split('/').some(segment => segment === '.' || segment === '..') || location.startsWith('//')) return null;
  try {
    const url = new URL(location, `${base}/realtime/calls/`);
    const expected = new URL(base);
    if (url.origin !== expected.origin || url.username || url.password || url.search || url.hash) return null;
    const match = /^\/openai\/v1\/realtime\/calls\/([A-Za-z0-9_-][A-Za-z0-9._-]{0,239})$/.exec(url.pathname);
    if (!match) return null;
    return { providerCallRef: match[1], providerConfigurationDigest: digest };
  } catch { return null; }
}

/** A 404 is deliberately uncertain: the API does not guarantee it means ended. */
export async function hangupAzureCall(reference: AzureCallReference, options: { env?: Environment; transport?: typeof fetch; signal?: AbortSignal } = {}): Promise<HangupOutcome> {
  if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,239}$/.test(reference.providerCallRef) || !/^[a-f0-9]{64}$/.test(reference.providerConfigurationDigest)) return { confirmed: false, reason: 'invalid_reference' };
  const env = options.env ?? process.env;
  const digest = azureCallConfigurationDigest(env);
  if (!digest || !timingSafeEqual(Buffer.from(digest), Buffer.from(reference.providerConfigurationDigest))) return { confirmed: false, reason: 'configuration_changed' };
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000);
  try {
    const response = await (options.transport ?? fetch)(`${normalizeAzureRealtimeEndpoint(env.AZURE_OPENAI_ENDPOINT)!}/realtime/calls/${reference.providerCallRef}/hangup`, {
      method: 'POST', headers: { 'api-key': env.AZURE_OPENAI_API_KEY! }, redirect: 'error', signal,
    });
    return response.status === 200 ? { confirmed: true, reason: 'confirmed' } : { confirmed: false, reason: 'provider_unconfirmed' };
  } catch { return { confirmed: false, reason: 'transport_uncertain' }; }
}
