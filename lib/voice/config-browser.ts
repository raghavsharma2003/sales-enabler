import type { VoiceConfiguration } from './contracts';

const DEFAULT_TIMEOUT_MS = 12_000;

export type BoundedRequestOptions = {
  request?: typeof fetch;
  timeoutMs?: number;
  timeoutMessage: string;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
};

function abortError() {
  return new DOMException('The request was cancelled.', 'AbortError');
}

export async function fetchJsonWithTimeout<T>(url: string, init: RequestInit, options: BoundedRequestOptions): Promise<{ response: Response; data: T }> {
  const request = options.request ?? fetch;
  const schedule = options.schedule ?? ((callback, delay) => setTimeout(callback, delay));
  const cancel = options.cancel ?? (timer => clearTimeout(timer));
  const externalSignal = init.signal;
  if (externalSignal?.aborted) throw abortError();
  const controller = new AbortController();
  let rejectBoundary!: (reason: Error) => void;
  const boundary = new Promise<never>((_resolve, reject) => { rejectBoundary = reject; });
  const externalAbort = () => { controller.abort(); rejectBoundary(abortError()); };
  externalSignal?.addEventListener('abort', externalAbort, { once: true });
  const timer = schedule(() => {
    controller.abort();
    rejectBoundary(new Error(options.timeoutMessage));
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const operation = Promise.resolve()
    .then(() => request(url, { ...init, signal: controller.signal }))
    .then(async response => ({ response, data: await response.json() as T }));
  try { return await Promise.race([operation, boundary]); }
  finally { cancel(timer); externalSignal?.removeEventListener('abort', externalAbort); }
}

export async function loadVoiceConfiguration(url: string, options: Omit<BoundedRequestOptions, 'timeoutMessage'> & { signal: AbortSignal }) {
  let result: { response: Response; data: VoiceConfiguration & { error?: string } };
  try {
    result = await fetchJsonWithTimeout<VoiceConfiguration & { error?: string }>(url, { cache: 'no-store', signal: options.signal }, {
      ...options,
      timeoutMessage: 'Voice settings took too long to respond. Check your connection and try again.',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError' || error instanceof Error && error.message.startsWith('Voice settings took too long')) throw error;
    throw new Error('Could not load voice settings. Check your connection and try again.');
  }
  if (!result.response.ok) throw new Error(result.data.error || 'Could not load voice settings.');
  return result.data;
}
