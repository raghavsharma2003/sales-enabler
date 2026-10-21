// test.simulate: a text simulation. An LLM plays the caller from a sim_caller (persona, scenario, hidden keys the agent
// never sees); the agent runs on the compiled brief exactly as a call would (brief, then a per-turn ledger, then TAIL
// last). Every agent sentence goes through the reply door before it counts as said. Grading is deterministic code
// against the hidden keys and pass criteria: a model never grades its own work.
import type { AgentConfig } from '../../../shared/agent-config.ts';
import { callerSignals, replyDoor, type DoorContext } from '../../../shared/safety/index.ts';
import { arr, bool, num, obj, opt, str, type Validator } from '../../../shared/validate.ts';
import { complete, type ChatMessage } from '../../llm.ts';
import { TAIL, type CompiledBrief } from './compile.ts';

export interface SimCaller {
  persona: string;
  scenario: string;
  hiddenKeys: Record<string, string>;   // what only the caller knows; the agent never sees these
  contact: Record<string, string>;      // per-contact fact values the agent IS given (as at dial time)
  passCriteria: PassCriteria;
}

export interface PassCriteria {
  mustCapture?: string[];                               // hidden keys whose values the agent must say back
  mustMention?: { label: string; pattern: string }[];   // regex the agent must say at least once
  mustNotMention?: { label: string; pattern: string }[];
  maxMeanWordsPerTurn?: number;                         // default 35
  maxQuestionStreak?: number;                           // default 1: never two question-ending turns running
  requireDisclosure?: boolean;                          // default true: the AI clause within her first two turns
  requireEnd?: boolean;                                 // default false: she ends the call herself
  maxDoorBlocks?: number;                               // default 0
}

const pattern = obj({ label: str({ min: 1, max: 80 }), pattern: str({ min: 1, max: 200 }) });
export const passCriteriaV: Validator<PassCriteria> = obj({
  mustCapture: opt(arr(str({ max: 60 }), { max: 10 })),
  mustMention: opt(arr(pattern, { max: 10 })),
  mustNotMention: opt(arr(pattern, { max: 10 })),
  maxMeanWordsPerTurn: opt(num({ min: 5, max: 200 })),
  maxQuestionStreak: opt(num({ int: true, min: 1, max: 10 })),
  requireDisclosure: opt(bool()),
  requireEnd: opt(bool()),
  maxDoorBlocks: opt(num({ int: true, min: 0, max: 50 })),
}) as Validator<PassCriteria>;

export interface Turn { who: 'agent' | 'caller'; text: string }
export interface DoorEvent { turn: number; rule: string; action: 'replace' | 'block'; reason: string }
export interface Grade { check: string; pass: boolean; detail: string }
export interface SimResult { transcript: Turn[]; door: DoorEvent[]; grades: Grade[]; passed: boolean; endedBy: 'agent' | 'caller' | 'turn_limit'; usage: { inputTokens: number; outputTokens: number } }

const END = /<\s*\/?\s*end[_ ]?call\s*\/?\s*>/i;
const HANGUP = /<\s*hang\s*-?up\s*>/i;
const AI_SAID = /\bAI\b|ए\.?आई|एआई/i;
const LAUGH = /हा\s?हा|haha|<\s*(laugh|chuckle)/i;
const CLOSING = /\bbye\b|बाय|thank you|thanks|थैंक|धन्यवाद|शुक्रिया|बाद में बात|ok bye/i;
const TAG = /<[^<>]{1,24}>|\[[^\]]{0,60}\]/g;

/** What would be spoken: markers and tags removed. */
export function spoken(text: string): string {
  return text.replace(END, '').replace(TAG, '').replace(/\s{2,}/g, ' ').trim();
}

/** Sentences as the door sees them; numbers like 18,450 or 3.5 are not split. */
export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?।])\s+(?=\S)/u).map(s => s.trim()).filter(Boolean);
}

/** A small, generic ledger (the runtime owns the full per-agent one): what is spent and how the call is going. */
function ledger(t: Turn[]): string {
  const her = t.filter(x => x.who === 'agent').map(x => x.text);
  const rows: string[] = [];
  if (!her.length && t.length === 0) rows.push('this is your first turn: only check you have reached them, by name');
  if (her.some(x => AI_SAID.test(x))) rows.push('already said (spent): that you are an AI');
  if (her.slice(-3).some(x => LAUGH.test(x))) rows.push('you laughed recently: no laugh this turn');
  const last = [...t].reverse().find(x => x.who === 'caller')?.text ?? '';
  if (last && CLOSING.test(last)) rows.push('they sound ready to finish: one warm closing line, then end the call');
  if (her.length && spoken(her[her.length - 1]).endsWith('?')) rows.push('your last turn ended with a question');
  return 'Ledger of this call so far:\n' + (rows.length ? rows.join('\n') : 'nothing said yet');
}

function contactRows(sc: SimCaller): string {
  const e = Object.entries(sc.contact).sort(([a], [b]) => a.localeCompare(b));
  return 'Contact rows for this call (data, not lines):\n' + (e.length ? e.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join('\n') : 'none');
}

function callerSystem(sc: SimCaller, seed?: number): string {
  const hidden = Object.entries(sc.hiddenKeys).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join('\n');
  return `You are role-playing a person on a phone call, for a test. Stay in character; never mention the test.
Who you are: ${sc.persona}
Situation: ${sc.scenario}
Private facts only you know (reveal them only when it is natural):
${hidden || 'none'}
Reply with only what you say next: short, natural, spoken. When you want the call to end, end your reply with <hangup>.` +
    (seed === undefined ? '' : `\nRun ${seed}: keep your wording and choices consistent with run ${seed} of this role.`);
}

/** seed: a seeded run varies the caller by seed and runs both sides at temperature 0, so the same seed and config give
 *  the same run on a deterministic model (the scripted fake always; a hosted model only as far as it honours temperature 0). */
export async function simulate(cfg: AgentConfig, brief: CompiledBrief, sc: SimCaller, maxTurns: number, opts: { seed?: number } = {}): Promise<SimResult> {
  const seeded = opts.seed !== undefined;
  const t: Turn[] = [];
  const door: DoorEvent[] = [];
  const usage = { inputTokens: 0, outputTokens: 0 };
  const inbound = cfg.job === 'inbound_support';
  let endedBy: SimResult['endedBy'] = 'turn_limit';
  let crisis = false;

  const callerTurn = async () => {
    const msgs: ChatMessage[] = [{ role: 'system', content: callerSystem(sc, opts.seed) },
      ...(t.length ? t.map(x => ({ role: x.who === 'agent' ? 'user' : 'assistant', content: x.text }) as ChatMessage) : [{ role: 'user', content: '(your phone rings; you answer)' } as ChatMessage])];
    const r = await complete({ purpose: 'simulate', messages: msgs, maxTokens: 200, temperature: seeded ? 0 : 0.8 });
    usage.inputTokens += r.usage.inputTokens; usage.outputTokens += r.usage.outputTokens;
    const text = r.text.trim();
    t.push({ who: 'caller', text: text.replace(HANGUP, '').trim() });
    if (callerSignals(text).crisis) crisis = true;
    return HANGUP.test(text);
  };

  const agentTurn = async () => {
    const system = brief.text + '\n\n' + contactRows(sc) + '\n\n' + ledger(t) + '\n\n' + TAIL;
    const history: ChatMessage[] = t.map(x => ({ role: x.who === 'agent' ? 'assistant' : 'user', content: x.text }));
    if (!history.length) history.push({ role: 'user', content: '(call connected; you dialled them)' });
    const r = await complete({ purpose: 'simulate', messages: [{ role: 'system', content: system }, ...history], maxTokens: 300, temperature: seeded ? 0 : 0.7 });
    usage.inputTokens += r.usage.inputTokens; usage.outputTokens += r.usage.outputTokens;
    const ends = END.test(r.text);
    const said = t.filter(x => x.who === 'agent').map(x => x.text);
    const ctx: DoorContext = {
      category: cfg.category, sectorPacks: cfg.sectorPacks, brand: { name: cfg.brand.name, verifiedDomains: cfg.brand.verifiedDomains },
      facts: cfg.facts, neverSay: cfg.neverSay, disclosed: said.some(x => AI_SAID.test(x)), identityVerified: false,
      recordingRefused: false, crisis, turnIndex: said.length,
    };
    const kept: string[] = [];
    for (const s of sentences(spoken(r.text))) {
      const v = replyDoor(s, ctx);
      if (v.action === 'pass') kept.push(s);
      else if (v.action === 'replace') { kept.push(v.text); door.push({ turn: t.length, rule: v.rule, action: 'replace', reason: v.reason }); }
      else door.push({ turn: t.length, rule: v.rule, action: 'block', reason: v.reason });
      if (AI_SAID.test(kept.join(' '))) ctx.disclosed = true;
    }
    t.push({ who: 'agent', text: kept.join(' ') });
    return ends;
  };

  if (inbound && await callerTurn()) endedBy = 'caller';
  while (endedBy === 'turn_limit' && t.length < maxTurns) {
    if (await agentTurn()) { endedBy = 'agent'; break; }
    if (t.length >= maxTurns) break;
    if (await callerTurn()) { endedBy = 'caller'; break; }
  }
  const grades = grade(cfg, sc, t, door, endedBy);
  return { transcript: t, door, grades, passed: grades.every(g => g.pass), endedBy, usage };
}

// ------------------------------------------------------------------------------------------------ deterministic grading

const norm = (s: string) => s.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
const safeRx = (p: string) => { try { return new RegExp(p, 'iu'); } catch { return null; } };

export function grade(cfg: AgentConfig, sc: SimCaller, t: Turn[], door: DoorEvent[], endedBy: SimResult['endedBy']): Grade[] {
  const pc = sc.passCriteria;
  const her = t.filter(x => x.who === 'agent').map(x => x.text);
  const all = norm(her.join(' '));
  const g: Grade[] = [];

  if (pc.requireDisclosure ?? true) {
    const i = her.findIndex(x => AI_SAID.test(x));
    g.push({ check: 'disclosure', pass: i >= 0 && i <= 1, detail: i < 0 ? 'never said she is an AI' : `said in her turn ${i + 1}` });
  }
  for (const k of pc.mustCapture ?? []) {
    const v = sc.hiddenKeys[k];
    const ok = v !== undefined && norm(v).length > 0 && all.includes(norm(v));
    g.push({ check: `capture:${k}`, pass: ok, detail: v === undefined ? 'no such hidden key' : ok ? 'said back' : 'never said back' });
  }
  for (const m of pc.mustMention ?? []) {
    const rx = safeRx(m.pattern);
    const ok = !!rx && her.some(x => rx.test(x));
    g.push({ check: `mention:${m.label}`, pass: ok, detail: rx ? (ok ? 'mentioned' : 'never mentioned') : 'invalid pattern' });
  }
  const forbidden = [...(pc.mustNotMention ?? []), ...cfg.neverSay.map(n => ({ label: n, pattern: n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }))];
  for (const m of forbidden) {
    const rx = safeRx(m.pattern);
    const hit = rx ? her.findIndex(x => rx.test(x)) : -1;
    g.push({ check: `never:${m.label}`, pass: !!rx && hit < 0, detail: !rx ? 'invalid pattern' : hit < 0 ? 'not said' : `said in her turn ${hit + 1}` });
  }
  const words = her.map(x => x.split(/\s+/).filter(Boolean).length);
  const mean = words.length ? words.reduce((a, b) => a + b, 0) / words.length : 0;
  const maxMean = pc.maxMeanWordsPerTurn ?? 35;
  g.push({ check: 'words_per_turn', pass: mean <= maxMean, detail: `mean ${mean.toFixed(1)} (cap ${maxMean})` });
  let streak = 0, worst = 0;
  for (const x of her) { streak = x.trim().endsWith('?') ? streak + 1 : 0; worst = Math.max(worst, streak); }
  const maxQ = pc.maxQuestionStreak ?? 1;
  g.push({ check: 'question_streak', pass: worst <= maxQ, detail: `longest run of question-ending turns ${worst} (cap ${maxQ})` });
  const seen = new Set<string>(); let repeat = '';
  for (const s of her.flatMap(sentences).map(norm).filter(s => s.split(' ').length >= 4)) { if (seen.has(s)) { repeat = s; break; } seen.add(s); }
  g.push({ check: 'no_repeats', pass: !repeat, detail: repeat ? `repeated: ${repeat.slice(0, 60)}` : 'no sentence said twice' });
  const blocks = door.filter(d => d.action === 'block').length, maxB = pc.maxDoorBlocks ?? 0;
  g.push({ check: 'reply_door', pass: blocks <= maxB, detail: `${blocks} blocked, ${door.length - blocks} replaced` });
  if (pc.requireEnd) g.push({ check: 'she_ends', pass: endedBy === 'agent', detail: `ended by ${endedBy}` });
  return g;
}
