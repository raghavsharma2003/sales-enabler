// agent.create from plain words: the compile-purpose model drafts the variable parts of an AgentConfig as JSON; code
// supplies the structure (ids, limits, memory, no stack), validates it strictly, and lints it. The result is only ever a
// draft: it is shown with its lint findings, and publishing still needs a clean compile and a human approval.
import { CALL_CATEGORIES, JOBS, LANGUAGES, SECTOR_PACKS, type AgentConfig } from '../../../shared/agent-config.ts';
import { ValidationError } from '../../../shared/validate.ts';
import { complete } from '../../llm.ts';
import { validateConfig } from './config.ts';

const SYSTEM = `You draft the configuration of a phone agent for an Indian business from the owner's plain words.
Answer with one JSON object with exactly these fields:
brand {name, spokenName, verifiedDomains: []}, job (one of: ${JOBS.join(', ')}), jobDescription (only when job is custom),
category (one of: ${CALL_CATEGORIES.join(', ')}), sectorPacks (from: ${SECTOR_PACKS.join(', ')}),
languages {primary, allowed, mirrorCaller} (from: ${LANGUAGES.join(', ')}),
persona {name, gender (female|male|neutral), register (warm_peer|polite_professional|crisp_efficient|gentle_elder_respect),
energy 1-5, humour 0-2, honorific (aap|tum|mirror), notes: []},
goals [{id (snake_case), description, outcome (snake_case), required}], facts [{key (snake_case), value, purpose
(service|offer|identity|logistics), perContact (true when the value differs per customer)}], neverSay [],
opening {disclosureClause, usefulFirst}, objections [{trigger, approach}],
handOff {when: [asks_for_human|crisis|complaint|legal_threat|out_of_scope|payment_dispute|repeated_misunderstanding],
target {kind: callback|queue}, warmSummary}.
Rules: every text field except fact values is a short note about behaviour written in English, never a line to say:
no quotation marks, no first person, no greetings, no questions, no digits, no Hindi script. Numbers, prices, dates
and timings go only in fact values. Anything per customer (name, amount, due date) is a perContact fact whose value
says where it comes from. disclosureClause always says she is the business's AI assistant, mentioned in passing.
Never invent a fact the owner did not give; leave it out instead.`;

const STRUCTURE = {
  schema: 1, agentId: '', version: 0, versionHash: '', tools: [],
  memory: { read: true, write: true, briefMaxBytes: 1200 },
  limits: { maxDurationS: 300, maxSilenceS: 10, maxTurns: 40 },
  voice: { stackId: '' },
  recording: { enabled: true, announce: true },
} as const;

const DRAFTED = ['brand', 'job', 'jobDescription', 'category', 'sectorPacks', 'languages', 'persona', 'goals', 'facts', 'neverSay', 'opening', 'objections', 'handOff'] as const;

export class DraftError extends Error {
  constructor(message: string, public path?: string) { super(message); this.name = 'DraftError'; }
}

export async function draftFromDescription(description: string): Promise<{ config: AgentConfig; usage: { inputTokens: number; outputTokens: number } }> {
  const r = await complete({ purpose: 'compile', json: true, maxTokens: 2500, temperature: 0.2,
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: description }] });
  let j: Record<string, unknown>;
  try { j = JSON.parse(r.text); } catch { throw new DraftError('the drafting model did not return JSON; try again or start from a template'); }
  if (typeof j !== 'object' || j === null || Array.isArray(j)) throw new DraftError('the drafting model did not return an object');
  const picked: Record<string, unknown> = {};
  for (const k of DRAFTED) if (j[k] !== undefined) picked[k] = j[k];
  // Code owns provenance and structure: every drafted fact is marked as drafted, and no stack is ever chosen here.
  if (Array.isArray(picked.facts)) picked.facts = picked.facts.map(f => (typeof f === 'object' && f ? { ...f, source: 'llm.draft' } : f));
  picked.neverSay ??= [];
  picked.objections ??= [];
  picked.sectorPacks ??= [];
  try {
    return { config: validateConfig({ ...structuredClone(STRUCTURE), ...picked }), usage: r.usage };
  } catch (e) {
    if (e instanceof ValidationError) throw new DraftError(`the drafted agent did not validate (${e.message}); try again with more detail or start from a template`, e.path);
    throw e;
  }
}
