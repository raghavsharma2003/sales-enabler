import { normalizeAzureRealtimeEndpoint } from '../voice/config';
import { HttpError } from '../server/http';

export type AzureTextInput = { system: string; user: string; signal?: AbortSignal; maxOutputTokens?: number; model?: string; responseFormat?: 'json_object' };
export type AzureTextResult = { text: string; model: string; usage: { inputTokens: number; outputTokens: number } };

/** Existing Azure resource only. No cross-provider retry or uncertain request replay. */
export async function generateAzureText(input: AzureTextInput, dependencies: { env?: Record<string, string | undefined>; fetch?: typeof fetch } = {}): Promise<AzureTextResult> {
  const env = dependencies.env || process.env;
  const endpoint = normalizeAzureRealtimeEndpoint(env.AZURE_OPENAI_ENDPOINT);
  const key = env.AZURE_OPENAI_API_KEY;
  const model = input.model || env.AZURE_OPENAI_TEXT_DEPLOYMENT || 'gpt-4.1-mini';
  if (!endpoint || !key || !/^[\w.-]{1,120}$/.test(model)) throw new HttpError(503, 'Configure the Azure text deployment before using this agent.');
  if (input.system.length > 48000 || input.user.length > 12000) throw new HttpError(400, 'This conversation context is too large.');
  if (input.maxOutputTokens !== undefined && (!Number.isSafeInteger(input.maxOutputTokens) || input.maxOutputTokens < 64 || input.maxOutputTokens > 3000)) throw new HttpError(400, 'Invalid output token limit.');
  try {
    const response = await (dependencies.fetch || fetch)(`${endpoint}/chat/completions`, {
      method: 'POST', headers: { 'api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: input.system }, { role: 'user', content: input.user }], max_completion_tokens: input.maxOutputTokens || 700, ...(input.responseFormat ? { response_format: { type: input.responseFormat } } : {}) }),
      signal: input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
      redirect: 'error',
    });
    if (!response.ok) throw new HttpError(response.status === 429 ? 429 : 502, response.status === 429 ? 'Azure usage limit reached. Try again later.' : 'Azure could not complete this reply. Check deployment access.');
    const raw = await response.text();
    if (raw.length > 128000) throw new HttpError(502, 'Azure returned an oversized reply.');
    const data = JSON.parse(raw) as { choices?: { message?: { content?: unknown }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const choice = data.choices?.[0];
    if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string' || !choice.message.content.trim() || choice.message.content.length > 12000) throw new HttpError(502, 'Azure did not return a complete text reply.');
    const inputTokens = data.usage?.prompt_tokens, outputTokens = data.usage?.completion_tokens;
    if (!Number.isSafeInteger(inputTokens) || !Number.isSafeInteger(outputTokens) || inputTokens! < 0 || outputTokens! < 0) throw new HttpError(502, 'Azure did not return a valid usage receipt.');
    return { text: choice.message.content.trim(), model, usage: { inputTokens: inputTokens!, outputTokens: outputTokens! } };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, 'The Azure reply was interrupted or invalid. No automatic retry was made.');
  }
}
