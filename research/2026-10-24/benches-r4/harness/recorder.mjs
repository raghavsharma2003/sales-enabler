// Diagnostic preload (scratch): for every request to VP_LLM_DEFAULT_URL, append the conversation's tool calls and tool
// results (truncated) to BENCH_RECORD. Never records a URL, header or key.
import { appendFileSync } from 'node:fs';
const target = process.env.VP_LLM_DEFAULT_URL, OUT = process.env.BENCH_RECORD;
const real = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  if (OUT && url === target) {
    try {
      const b = JSON.parse(String(init?.body ?? '{}'));
      const msgs = (b.messages ?? []).map(m => m.role === 'tool' ? { role: 'tool', content: String(m.content).slice(0, 1500) }
        : m.tool_calls ? { role: m.role, calls: m.tool_calls.map(c => ({ name: c.function?.name, args: c.function?.arguments })) }
        : m.role === 'system' ? { role: 'system', chars: String(m.content).length } : { role: m.role, content: String(m.content ?? '').slice(0, 400) });
      appendFileSync(OUT, JSON.stringify({ ts: new Date().toISOString(), tools: (b.tools ?? []).map(t => t.function?.name), msgs }) + '\n');
    } catch { /* not JSON */ }
  }
  return real(input, init);
};
