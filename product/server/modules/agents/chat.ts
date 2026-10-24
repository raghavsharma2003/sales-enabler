// test.chat: a typed practice chat. The builder types as the caller; she answers from the same compiled brief, ledger,
// TAIL and marker rules as a call, and every sentence goes through the same door the call runtime uses
// (product/voice/vpvoice/safety.py reply_door with its runtime-only checks): the crisis lines first once someone is in
// danger, the honest answer first when asked if she is an AI, the AI disclosure in her first breath, then the shared
// RD rules on each sentence and on it joined with the one before, and a replacement ends the reply. Nothing is dialled,
// nothing goes to the call log: a chat costs only model tokens, like a practice caller, and is stored only when kept.
import type { AgentConfig } from '../../../shared/agent-config.ts';
import { callerSignals, expandLexicon, normalise, redact, replyDoor, safetyText, type CallerSignals, type DoorContext } from '../../../shared/safety/index.ts';
import { affirmsAi, disclosureLine, openingDiscloses } from '../../../shared/safety/disclosure.ts';
import { judgeCallerCrisis } from '../../../shared/safety/judge.ts';
import type { SafetyRuleId } from '../../../shared/runtime-protocol.ts';
import { complete, type ChatMessage } from '../../llm.ts';
import { contactRows, markerRules, TAIL, type CompiledBrief } from './compile.ts';
import { END, sentences, spoken, type Turn } from './simulate.ts';

/** What the door did to one sentence, in words a buyer reads beside the reply. `original` is the draft sentence she did
 *  not say (shown only to the builder, never spoken). */
export interface ChatNote { rule: SafetyRuleId; action: 'replace' | 'block' | 'prefix'; label: string; reason: string; original?: string }
export interface ChatTurnResult {
  caller: string | null;           // the typed line as stored: sensitive digits masked
  said: string;                    // what she would say, after the door
  notes: ChatNote[];
  signals: Pick<CallerSignals, 'crisis' | 'asksIfAi' | 'optOut' | 'refusesRecording' | 'readingSensitiveDigits' | 'wantsHuman'>;
  ended: boolean;                  // she ended the conversation (<end_call>)
  usage: { inputTokens: number; outputTokens: number };
}

const CRISIS_LINES = ['14416', '112'];
const LABELS: Partial<Record<SafetyRuleId, string>> = {
  RD1: 'AI disclosure', RD2: 'Honest answer about being an AI', RD3: 'Crisis support', RD4: 'Sensitive details',
  RD5: 'Figure not in her facts', RD6: 'Link not on a verified domain', RD7: 'Pressure or manipulation', RD8: 'Personal details',
  RD9: 'Dues call rules', RD10: 'Recording', RD11: 'Identity not confirmed',
};
const label = (rule: SafetyRuleId) => LABELS[rule] ?? 'Safety rule';

let aiClauseRe: RegExp | null = null;
/** Any mention of AI or a bot; a mention is not a disclosure (Python has_ai_clause). */
function hasAiClause(text: string): boolean {
  aiClauseRe ??= new RegExp(expandLexicon('@ai_clause'), 'iu');
  return aiClauseRe.test(normalise(text));
}

interface ChatState { disclosed: boolean; crisis: boolean; linesGiven: boolean; askedAi: boolean; optOut: boolean; recordingRefused: boolean; agentTurns: number }

/** The call state a runtime would hold, rebuilt from the chat so far (the chat is stateless on the server). */
function stateOf(cfg: AgentConfig, history: Turn[], sig: CallerSignals | null, judged: boolean): ChatState {
  const clause = cfg.opening.disclosureClause ?? '';
  const her = history.filter(t => t.who === 'agent').map(t => t.text);
  const callers = history.filter(t => t.who === 'caller').map(t => callerSignals(t.text));
  const linesGiven = her.some(t => CRISIS_LINES.every(x => t.includes(x)));
  return {
    disclosed: her.some(t => sentences(t).some(s => affirmsAi(s, clause))),
    // A crisis is sticky for the call: the floor on any caller line, the judge on this one, or lines already given.
    crisis: judged || !!sig?.crisis || callers.some(c => c.crisis) || linesGiven,
    linesGiven,
    askedAi: !!sig?.asksIfAi,
    optOut: !!sig?.optOut || callers.some(c => c.optOut),
    recordingRefused: !!sig?.refusesRecording || callers.some(c => c.refusesRecording),
    agentTurns: her.length,
  };
}

/** The per-turn ledger (product/voice/vpvoice/brief.py rows that matter for a typed chat). */
function ledger(s: ChatState, history: Turn[]): string {
  const rows: string[] = [];
  const her = history.filter(t => t.who === 'agent').map(t => t.text);
  if (!s.agentTurns) rows.push('this is your first turn: this breath must carry the brand and your one AI clause, lightly, in passing');
  if (s.disclosed) rows.push('already said (spent): that you are an AI');
  if (s.askedAi) rows.push('they just asked if you are an AI: say yes plainly first, lightly, then carry on');
  if (s.crisis) rows.push('they may be in danger: the goal is suspended; be with them, give the support lines, offer a person; never end the call');
  if (s.optOut) rows.push('they asked not to be called again: confirm in one warm line that they will not be called, no pitch, then <end_call>');
  if (s.recordingRefused) rows.push('they asked not to be recorded: recording is off now; say so in a few words if it comes up');
  if (her.length && spoken(her[her.length - 1]).endsWith('?')) rows.push('your last turn ended with a question');
  return 'Ledger of this call so far:\n' + (rows.length ? rows.join('\n') : 'nothing said yet');
}

/** One reply through the runtime door. Mirrors safety.py reply_door: the first sentence carries the crisis lines, the
 *  honest answer or the disclosure; each sentence is judged alone and joined with the one before; a replacement ends it. */
export function doorReply(cfg: AgentConfig, raw: string, s: ChatState, prevSaid: string): { said: string; notes: ChatNote[] } {
  const brand = cfg.brand.name;
  const clause = cfg.opening.disclosureClause ?? '';
  const parts = sentences(spoken(raw));
  const opening = s.agentTurns === 0 && openingDiscloses(parts, clause);
  const ctx: DoorContext = {
    category: cfg.category, sectorPacks: cfg.sectorPacks, brand: { name: brand, verifiedDomains: cfg.brand.verifiedDomains },
    facts: cfg.facts, neverSay: cfg.neverSay, disclosed: s.disclosed, identityVerified: false,
    recordingRefused: s.recordingRefused, crisis: s.crisis, turnIndex: s.agentTurns,
  };
  const kept: string[] = [], notes: ChatNote[] = [];
  let prev = sentences(prevSaid).pop() ?? '';
  let linesGiven = s.linesGiven;
  for (let i = 0; i < parts.length; i++) {
    let t = parts[i];
    const rest = parts.slice(i).join(' ');            // a replacement ends the reply: all of this goes unsaid
    const first = i === 0;
    if (ctx.crisis && !linesGiven && !CRISIS_LINES.every(x => t.includes(x))) {
      kept.push(safetyText('crisis_support', brand));
      notes.push({ rule: 'RD3', action: 'replace', label: label('RD3'), reason: 'Someone may be in danger: Tele-MANAS 14416 and 112 come first, and a person is offered', original: rest });
      break;
    }
    let pre: ChatNote | null = null;
    if (first && s.askedAi && !affirmsAi(t, clause)) {
      if (hasAiClause(t)) {
        kept.push(safetyText('honest_ai', brand || 'is company'));
        notes.push({ rule: 'RD2', action: 'replace', label: label('RD2'), reason: 'Asked if she is an AI, she answers honestly', original: rest });
        break;
      }
      t = safetyText('honest_ai', brand || 'is company') + ' ' + t;
      pre = { rule: 'RD2', action: 'prefix', label: label('RD2'), reason: 'Asked if she is an AI, the honest answer comes first' };
    } else if (first && !ctx.disclosed && s.agentTurns === 0 && !opening && !affirmsAi(t, clause)) {
      t = disclosureLine(brand, cfg.languages.primary) + ' ' + t;
      pre = { rule: 'RD1', action: 'prefix', label: label('RD1'), reason: 'Her first breath carries the AI disclosure' };
    }
    if (affirmsAi(t, clause)) ctx.disclosed = true;
    let v = replyDoor(t, ctx);
    if (v.action === 'pass' && prev) {
      const j = replyDoor(prev + ' ' + t, ctx);
      if (j.action !== 'pass') v = { ...j, reason: `${j.reason} (across two sentences)` };
    }
    if (v.action === 'replace') {
      kept.push(v.text);
      notes.push({ rule: v.rule, action: 'replace', label: label(v.rule), reason: v.reason, original: rest });
      break;
    }
    if (v.action === 'block') {
      notes.push({ rule: v.rule, action: 'block', label: label(v.rule), reason: v.reason, original: parts[i] });
      prev = parts[i];
      continue;
    }
    kept.push(t);
    if (pre) notes.push(pre);
    if (CRISIS_LINES.every(x => t.includes(x))) linesGiven = true;
    prev = t;
  }
  return { said: kept.join(' '), notes };
}

/** One exchange: the typed caller line (null for her opening on an outbound call), then her reply through the door. */
export async function chatTurn(cfg: AgentConfig, brief: CompiledBrief, history: Turn[], message: string | null, contact: Record<string, string>): Promise<ChatTurnResult> {
  const usage = { inputTokens: 0, outputTokens: 0 };
  let sig: CallerSignals | null = null, judged = false, caller: string | null = null;
  const t: Turn[] = history.map(x => ({ who: x.who, text: x.who === 'caller' ? redact(x.text) : x.text }));
  if (message !== null) {
    sig = callerSignals(message);
    const prev = t.filter(x => x.who === 'caller').pop()?.text;
    // The floor, plus the caller-crisis judge when a safety_judge model is configured (raise-only, as on a call).
    const j = await judgeCallerCrisis(message, { prev });
    judged = j.crisis;
    if (j.usage) { usage.inputTokens += j.usage.inputTokens; usage.outputTokens += j.usage.outputTokens; }
    caller = redact(message);
    t.push({ who: 'caller', text: caller });
  }
  const s = stateOf(cfg, t.slice(0, message === null ? t.length : -1), sig, judged);
  const system = brief.text + '\n\n' + contactRows(contact) + '\n\n' + ledger(s, t) + '\n\n' + TAIL + '\n\n' + markerRules(cfg);
  const msgs: ChatMessage[] = t.map(x => ({ role: x.who === 'agent' ? 'assistant' : 'user', content: x.text }));
  if (!msgs.length) msgs.push({ role: 'user', content: '(call connected; you dialled them)' });
  const r = await complete({ purpose: 'simulate', messages: [{ role: 'system', content: system }, ...msgs], maxTokens: 300, temperature: 0.7 });
  usage.inputTokens += r.usage.inputTokens; usage.outputTokens += r.usage.outputTokens;
  const prevSaid = [...t].reverse().find(x => x.who === 'agent')?.text ?? '';
  const { said, notes } = doorReply(cfg, r.text, s, prevSaid);
  const pick = (x: CallerSignals | null) => ({ crisis: s.crisis, asksIfAi: !!x?.asksIfAi, optOut: !!x?.optOut, refusesRecording: !!x?.refusesRecording,
    readingSensitiveDigits: !!x?.readingSensitiveDigits, wantsHuman: !!x?.wantsHuman });
  return { caller, said, notes, signals: pick(sig), ended: END.test(r.text) && !s.crisis, usage };
}
