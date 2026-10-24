// BLIND-BR2 no-model probe, part 1 (VP_JUDGE_EVAL_FAKE module). judge-eval calls this instead of a model; it appends
// the user message judge-eval built for each item to $PROBE_CAPTURE (a scratch file, deleted by the verifier) and
// answers "no findings". No network, no model, nothing printed.
import { appendFileSync } from 'node:fs';
export default (req) => {
  const user = req.messages.find(m => m.role === 'user')?.content ?? '';
  appendFileSync(process.env.PROBE_CAPTURE, JSON.stringify({ purpose: req.purpose, user }) + '\n');
  return { text: '{"findings": []}', toolCalls: [], usage: { inputTokens: 0, outputTokens: 0 }, model: 'fake', provider: 'fake' };
};
