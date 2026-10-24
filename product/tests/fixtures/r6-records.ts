// What real analysis returned, replayed. A record from the round-6 analysis bench (research/2026-10-24/benches-r6), run on
// the shipped contract: gpt-4.1-mini single, r5-outcome-first, TEST split, pass 1. Each record names a synthetic bench
// case (scripts/analysis-bench/cases.ts: fictional people, brands and lines) and what the model returned for it: the
// outcome, the reason code and the moment kinds. The bench keeps no raw replies, so r6Oracle rebuilds each reply in the
// shipped reply format from the record: the record's values, with quotes copied from the case's own lines (the key's line
// for a kind when the key has one, else the PERSON's first line). Calls' real analyse() then grounds and stores it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { LlmReply, LlmRequest } from '../../server/llm.ts';
import { perCallCases, type Case } from '../../scripts/analysis-bench/cases.ts';

export const R6_FILE = 'research/2026-10-24/benches-r6/analysis-gpt-4.1-mini.r5-outcome-first-p1.json';
interface Predicted { outcome: string | null; reasonCode: string | null; moments: string[]; crisis: boolean }
export interface R6Record { id: string; template: string; case: Case; predicted: Predicted }

const raw = JSON.parse(readFileSync(fileURLToPath(new URL('../../../' + R6_FILE, import.meta.url)), 'utf8')) as
  { promptVariant: string; split: string; model: string; items: { id: string; template: string; predicted: Predicted }[] };
const cases = new Map(perCallCases().map(c => [c.id, c]));
export const R6_META = { promptVariant: raw.promptVariant, split: raw.split, model: raw.model };
export const R6: R6Record[] = raw.items.map(i => ({ id: i.id, template: i.template, case: cases.get(i.id)!, predicted: i.predicted }));
if (R6.some(r => !r.case)) throw new Error('an r6 record names a case the bench no longer has');

const content = (c: Case) => c.lines.map(l => `${l.speaker === 'agent' ? 'AGENT' : 'PERSON'}: ${l.text}`).join('\n');

/** The analysis model, answering every call with its r6 record. `seen` counts the prompts it was given in the shipped
 *  contract's order (the OUTCOME block before KIND) and in any other order. Other purposes get an empty object. */
export function r6Oracle() {
  const byContent = new Map(R6.filter(r => r.case.lines.length).map(r => [content(r.case), r]));
  const seen = { outcomeFirst: 0, other: 0, unmatched: 0 };
  const reply = (text: string): LlmReply => ({ text, toolCalls: [], usage: { inputTokens: 800, outputTokens: 120 }, model: 'r6-record', provider: 'replay' });
  const fn = (req: LlmRequest): LlmReply => {
    if (req.purpose !== 'analysis') return reply('{}');
    const system = req.messages[0]!.content, user = req.messages[req.messages.length - 1]!.content;
    if (system.includes('patterns across phone calls')) return reply(JSON.stringify({ themes: [] }));
    const o = system.indexOf('\nOUTCOME:'), k = system.indexOf('\nKIND');   // the section headers, not the OUTPUT line's "kind":KIND
    if (o >= 0 && k > o) seen.outcomeFirst++; else seen.other++;
    const r = byContent.get(user);
    if (!r) { seen.unmatched++; return reply(JSON.stringify({ points: [], moments: [], reasonCode: null, outcome: null, forget: null })); }
    const c = r.case, person = c.lines.filter(l => l.speaker === 'caller');
    const lineFor = (kind: string) => { const m = c.key.moments.find(x => x.kind === kind); return m ? c.lines[m.line]!.text : person[0]?.text ?? ''; };
    const outcomeQuote = c.key.outcomeLine !== undefined ? c.lines[c.key.outcomeLine]!.text : person[person.length - 1]?.text ?? '';
    return reply(JSON.stringify({
      points: person[0] ? [{ claim: 'The person answered.', quote: person[0].text }] : [],
      moments: r.predicted.moments.map(kind => ({ kind, quote: lineFor(kind), note: '' })),
      reasonCode: r.predicted.reasonCode?.startsWith('CONV_') ? r.predicted.reasonCode : null,
      outcome: r.predicted.outcome ? { value: r.predicted.outcome, quote: outcomeQuote, confidence: 0.95 } : null,
      forget: null,
    }));
  };
  return { fn, seen };
}
