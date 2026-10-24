// One LLM door for the control plane (Operator chat, memory extraction, judges, learning proposals).
// Provider-open (directive.2026-10-18.provider-open): any OpenAI-compatible chat-completions endpoint —
// Azure OpenAI / Foundry, OpenRouter, Gemini's OpenAI-compatible endpoint — chosen per PURPOSE by env:
//   VP_LLM_<PURPOSE>_URL, VP_LLM_<PURPOSE>_KEY, VP_LLM_<PURPOSE>_MODEL   (falls back to VP_LLM_DEFAULT_*)
// Keys come from the environment only. VP_LLM_FAKE=1 swaps in a scripted fake so tests never reach a network.
// Every call returns its token usage so the caller can write a cost_line; nothing here guesses prices.
import { vertexToken } from './vertex-token.ts';

export type Purpose = 'operator' | 'memory' | 'judge' | 'learning' | 'analysis' | 'compile' | 'simulate' | 'safety_judge' | 'brief_review';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;                                   // for role 'tool'
  toolCalls?: { id: string; name: string; args: string }[];  // for role 'assistant'
}

export interface LlmTool { name: string; description: string; parameters: Record<string, unknown> }

export interface LlmRequest {
  purpose: Purpose;
  messages: ChatMessage[];
  tools?: LlmTool[];
  json?: boolean;              // ask for a JSON object reply
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  /** Override the configured model for this call (e.g. the workspace chose an Operator brain). Same endpoint and key. */
  model?: string;
}

export interface LlmReply {
  text: string;
  toolCalls: { id: string; name: string; args: string }[];
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  provider: string;
}

export class LlmError extends Error {
  constructor(message: string, public retriable: boolean) { super(message); this.name = 'LlmError'; }
}

type FakeFn = (req: LlmRequest) => LlmReply | Promise<LlmReply>;
let fake: FakeFn | null = null;

/** Tests: script the model. Pass null to restore. */
export function setFakeLlm(fn: FakeFn | null): void { fake = fn; }

function cfg(purpose: Purpose) {
  const P = purpose.toUpperCase();
  const get = (k: string) => process.env[`VP_LLM_${P}_${k}`] ?? process.env[`VP_LLM_DEFAULT_${k}`];
  return { url: get('URL'), key: get('KEY'), model: get('MODEL'), header: get('KEY_HEADER') ?? 'authorization', auth: (get('AUTH') ?? '').trim().toLowerCase() };
}

/** A real model is set up for the purpose: URL, MODEL and a key, or AUTH=vertex with a usable Vertex route (the
 *  token is minted from VERTEX_SA_FILE, vertex-token.ts). A test fake does not count. */
export function llmKeysConfigured(purpose: Purpose): boolean {
  const c = cfg(purpose);
  if (c.auth === 'vertex') return Boolean(c.url && c.model && vertexToken());
  return Boolean(c.url && c.key && c.model);
}

export function llmConfigured(purpose: Purpose): boolean {
  if (fake || process.env.VP_LLM_FAKE === '1') return true;
  return llmKeysConfigured(purpose);
}

const unsetLogged = new Set<string>();   // the operator's hint goes to the log once; a member reads plain words
async function request(req: LlmRequest, streaming: boolean) {
  const c = cfg(req.purpose);
  const token = c.auth === 'vertex' ? vertexToken() : null;
  if (!c.url || !c.model || (c.auth === 'vertex' ? !token : !c.key)) {
    if (!unsetLogged.has(req.purpose)) { unsetLogged.add(req.purpose); console.warn(`[vp] setup: no model for ${req.purpose}; set VP_LLM_${req.purpose.toUpperCase()}_URL/KEY/MODEL`); }
    throw new LlmError(`no model is configured for ${req.purpose} on this server`, false);
  }
  const model = req.model ?? c.model;
  const body: Record<string, unknown> = {
    model,
    messages: req.messages.map(m => m.role === 'tool'
      ? { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
      : m.toolCalls?.length
        ? { role: 'assistant', content: m.content || null, tool_calls: m.toolCalls.map(t => ({ id: t.id, type: 'function', function: { name: t.name, arguments: t.args } })) }
        : { role: m.role, content: m.content }),
    ...(req.maxTokens ? { max_completion_tokens: req.maxTokens } : {}),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.json ? { response_format: { type: 'json_object' } } : {}),
    ...(req.tools?.length ? { tools: req.tools.map(t => ({ type: 'function', function: t })) } : {}),
    ...(streaming ? { stream: true, stream_options: { include_usage: true } } : {}),
  };
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${await token.get()}`;
  else headers[c.header] = c.header === 'authorization' ? `Bearer ${c.key}` : c.key!;
  return { url: c.url, model, headers, body: JSON.stringify(body) };
}

async function send(r: Awaited<ReturnType<typeof request>>, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(r.url, { method: 'POST', headers: r.headers, body: r.body, signal: signal ?? AbortSignal.timeout(60_000) });
  } catch (e) {
    throw new LlmError(`could not reach the model: ${e instanceof Error ? e.message : String(e)}`, true);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new LlmError(`model returned ${res.status}: ${detail}`, res.status === 429 || res.status >= 500);
  }
  return res;
}

export async function complete(req: LlmRequest): Promise<LlmReply> {
  if (fake) return fake(req);
  if (process.env.VP_LLM_FAKE === '1') {
    return { text: req.json ? '{}' : 'ok', toolCalls: [], usage: { inputTokens: 0, outputTokens: 0 }, model: 'fake', provider: 'fake' };
  }
  const r = await request(req, false);
  const j = await (await send(r, req.signal)).json() as any;
  const msg = j.choices?.[0]?.message ?? {};
  return {
    text: typeof msg.content === 'string' ? msg.content : '',
    toolCalls: (msg.tool_calls ?? []).map((t: any) => ({ id: t.id, name: t.function?.name, args: t.function?.arguments ?? '{}' })),
    usage: { inputTokens: j.usage?.prompt_tokens ?? 0, outputTokens: j.usage?.completion_tokens ?? 0 },
    model: j.model ?? r.model,
    provider: new URL(r.url).hostname,
  };
}

/** Streaming completion: onDelta receives text as it arrives; the resolved reply is the same shape as complete()'s.
 *  The fake (setFakeLlm / VP_LLM_FAKE) emits its whole text as one delta. */
export async function stream(req: LlmRequest, onDelta: (text: string) => void): Promise<LlmReply> {
  if (fake || process.env.VP_LLM_FAKE === '1') {
    const out = await complete(req);
    if (out.text) onDelta(out.text);
    return out;
  }
  const r = await request(req, true);
  const res = await send(r, req.signal);
  const decoder = new TextDecoder();
  let buf = '', text = '', model = r.model, usage = { inputTokens: 0, outputTokens: 0 };
  const calls: { id: string; name: string; args: string }[] = [];
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buf += decoder.decode(chunk, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      let j: any;
      try { j = JSON.parse(data); } catch { continue; }
      if (j.model) model = j.model;
      if (j.usage) usage = { inputTokens: j.usage.prompt_tokens ?? 0, outputTokens: j.usage.completion_tokens ?? 0 };
      const d = j.choices?.[0]?.delta;
      if (!d) continue;
      if (typeof d.content === 'string' && d.content) { text += d.content; onDelta(d.content); }
      for (const tc of d.tool_calls ?? []) {
        const k = tc.index ?? 0;
        calls[k] ??= { id: '', name: '', args: '' };
        if (tc.id) calls[k].id = tc.id;
        if (tc.function?.name) calls[k].name += tc.function.name;
        if (tc.function?.arguments) calls[k].args += tc.function.arguments;
      }
    }
  }
  return { text, toolCalls: calls.filter(Boolean).map(c => ({ ...c, args: c.args || '{}' })), usage, model, provider: new URL(r.url).hostname };
}
