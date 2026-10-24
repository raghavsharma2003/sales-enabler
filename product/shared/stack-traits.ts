// What each voice stack is good and weak at, in plain English for the stack picker. Hand-written lines restate only what
// the catalog already records (shared/stacks.ts notes and risks, from our own tests); the speed line and the cut-in
// figure come from shared/stack-measures.json, so they change when new measurements are loaded and never disagree with
// the gate. Kept apart from stacks.ts, which has a Python mirror (product/voice StackParity).
import type { Figure, VoiceStack } from './stacks.ts';
import { GATE, MEASURES, gateStatus } from './stack-gate.ts';

const WRITTEN: Record<string, { goodAt: string[]; weakAt: string[] }> = {
  'v2-live': { goodAt: ['The best-judged model family in our written tests', 'One model hears and speaks, with no separate speech recognition'],
    weakAt: ['Talked over callers on about 40% of turns in the lab'] },
  'v2-flashlite': { goodAt: ['The fastest of the well-judged models in our written tests'], weakAt: [] },
  'v2-54mini': { goodAt: ['OpenAI’s fast model, for teams that prefer OpenAI'], weakAt: [] },
  'v2-38flash': { goodAt: ['The best-judged model in our written tests'], weakAt: ['Slow to answer from India'] },
  'v2-mai': { goodAt: ['The fastest voice to start speaking', 'Picks an emotion style for each reply'], weakAt: ['Its price has not been checked against a real bill yet'] },
  'v2-luna': { goodAt: [], weakAt: ['Judged last of these in our written tests', 'Not yet tried on a call'] },
  'sarvam-india': { goodAt: ['Runs in India end to end'], weakAt: ['Sarvam may train on your call data unless you opt out with them'] },
};

/** Talking over the caller, as a figure: measured on test calls, or said to be not measured (never zero). */
export function cutInFigure(id: string): Figure {
  const m = MEASURES[id]?.cutInRate;
  if (!m) return { value: 'not measured', grade: 'not_measured', source: 'How often she talks over the caller has not been measured on test calls for this stack yet.' };
  return { value: `${Math.round(m.value * 100)}% of turns`, grade: 'measured',
    source: `Measured on test calls: she talked over the caller on ${Math.round(m.value * 100)}% of ${m.n} turns (${m.date}). The target is at most ${Math.round(GATE.cutInRateMax * 100)}%.` };
}

/** Good at and weak at, for the picker: the written lines, the measured speed against the target, and the known risks. */
export function plainTraits(s: VoiceStack): { goodAt: string[]; weakAt: string[] } {
  const w = WRITTEN[s.id] ?? { goodAt: [], weakAt: [] };
  const goodAt = [...w.goodAt], weakAt = [...w.weakAt];
  const g = gateStatus(s.id), gap = MEASURES[s.id]?.replyGapP50Ms;
  if (g.state === 'meets') goodAt.push('Meets the speed and turn-taking target on test calls');
  else if (gap && gap.value > GATE.replyGapP50Ms) weakAt.push(`Slower than our target: a median reply of ${(gap.value / 1000).toFixed(1)} s on test calls, against ${(GATE.replyGapP50Ms / 1000).toFixed(1)} s`);
  else if (gap) goodAt.push(`Quick replies: a median of ${(gap.value / 1000).toFixed(1)} s on test calls`);
  if (s.status === 'beta') weakAt.push(s.id === 'custom' ? 'Built from parts: test calls only until it has been measured' : 'Test calls only until it is measured and cleared');
  for (const r of s.risks ?? []) if (!weakAt.includes(r)) weakAt.push(r);
  return { goodAt, weakAt };
}
