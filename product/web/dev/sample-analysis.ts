// DEV ONLY. A canned stand-in for the post-call analysis model, so calls on the seeded dev workspace show a finished
// summary and outcome instead of "No outcome yet". Every claim it writes starts "Sample analysis (dev only)", so a screen
// can never pass it off as real analysis. It reads the real prompt (analysisPrompt) and the real transcript and quotes
// only the person's own lines, so the real grounding checks still run on what it says. It refuses to load in production.
import type { LlmReply, LlmRequest } from '../../server/llm.ts';

if (process.env.NODE_ENV === 'production') {
  throw new Error('web/dev/sample-analysis.ts is a development stand-in and must never load with NODE_ENV=production');
}

export const SAMPLE_MARK = 'Sample analysis (dev only)';
const NEGATIVE = /\b(nahi|nako|illa|na|mat|no|not|don't|stop|later|baad mein)\b/i;
const reply = (text: string): LlmReply => ({ text, toolCalls: [], usage: { inputTokens: 300, outputTokens: 60 }, model: 'sample-analysis (dev)', provider: 'dev-script' });

export function sampleAnalysis(req: LlmRequest): LlmReply {
  const system = req.messages[0]?.content ?? '', user = req.messages[req.messages.length - 1]?.content ?? '';
  if (system.includes('patterns across phone calls')) return reply(JSON.stringify({ themes: [] }));   // cross-call insight: honest "no themes"
  const person = user.split('\n').filter(l => l.startsWith('PERSON: ')).map(l => l.slice(8).trim()).filter(Boolean);
  if (!person.length) return reply(JSON.stringify({ points: [], moments: [], reasonCode: null, outcome: null, forget: null }));
  let values: string[] = [];
  try { values = JSON.parse(/VALUE one of (\[[^\]]*\])/.exec(system)?.[1] ?? '[]'); } catch { values = []; }
  const last = person[person.length - 1];
  const negative = person.some(p => NEGATIVE.test(p));
  const pick = negative ? values.find(v => /not|no|declin|refus|lost/i.test(v)) ?? values[values.length - 1]
    : values.find(v => /agree|yes|paid|renew|book|confirm|interest|won|done/i.test(v)) ?? values[0];
  return reply(JSON.stringify({
    points: [{ claim: `${SAMPLE_MARK}: the person ${negative ? 'did not go ahead' : 'went ahead'} on this call.`, quote: last }],
    moments: person.filter(p => p.includes('?')).slice(0, 2).map(p => ({ kind: 'question', quote: p, note: SAMPLE_MARK })),
    reasonCode: negative ? 'CONV_NOT_INTERESTED' : 'CONV_GOAL_DONE',
    outcome: pick ? { value: pick, quote: last, confidence: 0.9 } : null,
    forget: null,
  }));
}
