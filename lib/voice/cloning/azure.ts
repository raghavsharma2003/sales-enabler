import { HttpError } from '../../server/http';

const version = '2026-01-01';
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{1,62}[A-Za-z0-9]$/;
const regionPattern = /^[a-z][a-z0-9-]{1,30}$/;
type AzureResource = { id: string; projectId: string; status: string; consentId?: string; speakerProfileId?: string };
export type AzureConfig = { endpoint: string; key: string; projectId: string; companyName?: string };

export function enrollmentReadiness(env: NodeJS.ProcessEnv = process.env): { configured: boolean; reason: string; companyName: string } {
  const companyName = (env.AZURE_PERSONAL_VOICE_COMPANY_NAME || '').trim().slice(0, 80);
  if (env.AZURE_PERSONAL_VOICE_LIMITED_ACCESS_APPROVED !== 'true') return { configured: false, reason: 'Personal Voice Limited Access approval must be confirmed in server configuration.', companyName };
  if (!env.AZURE_SPEECH_KEY || !regionPattern.test(env.AZURE_SPEECH_REGION || '')) return { configured: false, reason: 'Add the approved Azure Speech key and region to server configuration.', companyName };
  if (!idPattern.test(env.AZURE_PERSONAL_VOICE_PROJECT_ID || '')) return { configured: false, reason: 'Add the approved Personal Voice project ID.', companyName };
  return { configured: true, reason: '', companyName };
}

export function azureConfig(env: NodeJS.ProcessEnv = process.env, erasure = false): AzureConfig {
  if (!erasure && !enrollmentReadiness(env).configured) throw new HttpError(503, enrollmentReadiness(env).reason);
  if (!env.AZURE_SPEECH_KEY || !regionPattern.test(env.AZURE_SPEECH_REGION || '')) throw new HttpError(503, 'Azure Speech deletion needs its key and region. Revocation remains pending.');
  return {
    endpoint: `https://${env.AZURE_SPEECH_REGION}.api.cognitive.microsoft.com`,
    key: env.AZURE_SPEECH_KEY,
    projectId: env.AZURE_PERSONAL_VOICE_PROJECT_ID || '',
    companyName: env.AZURE_PERSONAL_VOICE_COMPANY_NAME || '',
  };
}

export function providerStatus(value: string): 'pending' | 'ready' | 'failed' {
  if (value === 'Succeeded') return 'ready';
  if (['Failed', 'Disabling', 'Disabled'].includes(value)) return 'failed';
  if (['NotStarted', 'Running'].includes(value)) return 'pending';
  throw new HttpError(502, 'Azure returned an unknown enrollment status.');
}

export function createAzureClient(config: AzureConfig, fetcher: typeof fetch = fetch) {
  async function call(kind: 'consents' | 'personalvoices', id: string, init: RequestInit, allow404 = false): Promise<AzureResource | null> {
    if (!idPattern.test(id)) throw new HttpError(400, 'Invalid provider resource ID.');
    let response: Response;
    try {
      response = await fetcher(`${config.endpoint}/customvoice/${kind}/${encodeURIComponent(id)}?api-version=${version}`, {
        ...init, redirect: 'error', signal: AbortSignal.timeout(20_000),
        headers: { 'Ocp-Apim-Subscription-Key': config.key, ...init.headers },
      });
    } catch { throw new HttpError(503, 'Azure Speech did not confirm the request. Enrollment requires reconciliation.'); }
    if (allow404 && response.status === 404) return null;
    if (!response.ok) throw new HttpError(response.status >= 500 ? 503 : 409, `Azure Speech returned HTTP ${response.status}. Enrollment requires reconciliation.`);
    if (init.method === 'DELETE') return null;
    let data: unknown;
    try { data = await response.json(); } catch { throw new HttpError(502, 'Azure Speech returned an invalid enrollment response.'); }
    if (!data || typeof data !== 'object') throw new HttpError(502, 'Azure Speech returned an invalid enrollment response.');
    const row = data as AzureResource;
    if (row.id !== id || !row.status || (config.projectId && row.projectId !== config.projectId)) throw new HttpError(502, 'Azure Speech returned a mismatched enrollment resource.');
    providerStatus(row.status);
    return row;
  }
  return {
    async createConsent(id: string, name: string, companyName: string, locale: string, audio: Buffer) {
      const form = new FormData();
      form.append('projectId', config.projectId); form.append('voiceTalentName', name);
      form.append('companyName', companyName); form.append('locale', locale);
      form.append('audiodata', new Blob([new Uint8Array(audio)], { type: 'audio/wav' }), 'consent.wav');
      return (await call('consents', id, { method: 'POST', body: form }))!;
    },
    async getConsent(id: string) { return call('consents', id, { method: 'GET' }, true); },
    async createVoice(id: string, consentId: string, audio: Buffer) {
      const form = new FormData(); form.append('projectId', config.projectId); form.append('consentId', consentId);
      form.append('audiodata', new Blob([new Uint8Array(audio)], { type: 'audio/wav' }), 'sample.wav');
      const row = (await call('personalvoices', id, { method: 'POST', body: form }))!;
      if (row.consentId !== consentId) throw new HttpError(502, 'Azure Speech returned a mismatched consent binding.');
      return row;
    },
    async getVoice(id: string, consentId: string) {
      const row = await call('personalvoices', id, { method: 'GET' }, true);
      if (row && row.consentId !== consentId) throw new HttpError(502, 'Azure Speech returned a mismatched consent binding.');
      return row;
    },
    async delete(id: string, kind: 'consents' | 'personalvoices') { await call(kind, id, { method: 'DELETE' }, true); },
  };
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const escapeXml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
export function previewVoiceConfig(env: NodeJS.ProcessEnv = process.env) {
  const config = azureConfig(env);
  const model = env.AZURE_PERSONAL_VOICE_BASE_VOICE || '';
  if (!idPattern.test(model) || /latest/i.test(model)) throw new HttpError(503, 'Configure a fixed, supported Personal Voice base model before preview.');
  return { config, model, ttsEndpoint: `https://${env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1` };
}
export function previewReadiness(env: NodeJS.ProcessEnv = process.env): { configured: boolean; reason: string } {
  try { previewVoiceConfig(env); return { configured: true, reason: '' }; }
  catch (error) { return { configured: false, reason: error instanceof Error ? error.message : 'Speech preview setup is incomplete.' }; }
}
export async function synthesizePreview(profileId: string, model: string, text: string, config: AzureConfig, endpoint: string, fetcher: typeof fetch = fetch) {
  if (!uuid.test(profileId)) throw new HttpError(409, 'Azure has not returned a valid speaker profile ID.');
  if (!idPattern.test(model) || /latest/i.test(model)) throw new HttpError(503, 'A fixed Personal Voice base model is required.');
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="en-US"><voice name="${model}"><mstts:ttsembedding speakerProfileId="${profileId}">${escapeXml(text)}</mstts:ttsembedding></voice></speak>`;
  let response: Response;
  try {
    response = await fetcher(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000), headers: {
      'Ocp-Apim-Subscription-Key': config.key, 'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm', 'User-Agent': 'company-voice-preview/1',
    }, body: ssml });
  } catch { throw new HttpError(503, 'Azure Speech did not confirm the preview request.'); }
  if (!response.ok || !response.body) throw new HttpError(response.status >= 500 ? 503 : 409, `Azure Speech preview returned HTTP ${response.status}.`);
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  for (;;) {
    const part = await reader.read(); if (part.done) break;
    length += part.value.byteLength;
    if (length > 3 * 1024 * 1024) { await reader.cancel(); throw new HttpError(502, 'Azure Speech preview exceeded the audio limit.'); }
    chunks.push(part.value);
  }
  const audio = Buffer.concat(chunks);
  if (audio.length < 44 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') throw new HttpError(502, 'Azure Speech returned invalid preview audio.');
  return audio;
}
