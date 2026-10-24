// op5 recorder (scratch), preloaded in every scored run after azure-guard.mjs. r4's harness/recorder.mjs with wider
// clips and two additions; it only observes and never changes a request. Never records a URL, header or key.
// For every request to VP_LLM_DEFAULT_URL it appends to BENCH_RECORD:
//   - the offered tool names, max tokens, and whether it is JSON mode;
//   - the conversation: tool calls (name and arguments), tool results up to 8,000 chars (operator/loop.ts CAPS.resultChars,
//     so the model's whole view), assistant text up to 2,000, user text up to 1,500, the first system message as its
//     length plus its first 60 chars (which prompt it is), and every later system message (repair and check notes) up to
//     600 chars;
//   - for a request with no tools (brief review, draft from description, memory), the reply's text up to 2,000 chars and
//     its usage, or the error name if it failed (a timeout aborts it).
import { appendFileSync } from 'node:fs';
const target = process.env.VP_LLM_DEFAULT_URL, OUT = process.env.BENCH_RECORD;
const real = globalThis.fetch;
let seq = 0;
const clip = (s, n) => String(s ?? '').slice(0, n);
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  if (!OUT || url !== target) return real(input, init);
  const id = ++seq;
  let b = {};
  try { b = JSON.parse(String(init?.body ?? '{}')); } catch { /* not JSON */ }
  let firstSystem = true;
  const msgs = (b.messages ?? []).map(m => {
    if (m.role === 'tool') return { role: 'tool', content: clip(m.content, 8000) };
    if (m.tool_calls) return { role: m.role, content: m.content ? clip(m.content, 2000) : undefined, calls: m.tool_calls.map(c => ({ name: c.function?.name, args: c.function?.arguments })) };
    if (m.role === 'system') {
      if (firstSystem) { firstSystem = false; return { role: 'system', chars: String(m.content).length, head: clip(m.content, 60) }; }
      return { role: 'system', content: clip(m.content, 600) };
    }
    return { role: m.role, content: clip(m.content, m.role === 'user' ? 1500 : 2000) };
  });
  const row = { id, ts: new Date().toISOString(), tools: (b.tools ?? []).map(t => t.function?.name), maxOut: b.max_completion_tokens ?? b.max_tokens ?? null,
    json: Boolean(b.response_format), stream: Boolean(b.stream), msgs };
  const noTools = !(b.tools ?? []).length;
  let res;
  try { res = await real(input, init); }
  catch (e) {
    try { appendFileSync(OUT, JSON.stringify({ ...row, error: clip(e?.name ?? 'Error', 40) + ': ' + clip(String(e?.message ?? e).replace(/https?:\/\/\S+/g, '<url>'), 120) }) + '\n'); } catch { /* best effort */ }
    throw e;
  }
  if (noTools && !b.stream) {
    try {
      const j = await res.clone().json();
      appendFileSync(OUT, JSON.stringify({ ...row, status: res.status, reply: clip(j?.choices?.[0]?.message?.content, 2000), usage: j?.usage ?? null }) + '\n');
    } catch { appendFileSync(OUT, JSON.stringify({ ...row, status: res.status, reply: null }) + '\n'); }
  } else {
    appendFileSync(OUT, JSON.stringify({ ...row, status: res.status }) + '\n');
  }
  return res;
};
