import { createHash } from 'node:crypto';
import { HttpError, field } from '../server/http';
import seeds from '../../evals/scenarios.json';

export type Criterion = { id: string; text: string };
export type Scenario = { id: string; familyId: string; version: number; name: string; language: string; scenario: string; expectedOutcome: string; criteria: Criterion[]; source: 'seed' | 'operator'; createdAt?: string };
export type Turn = { role: 'user' | 'assistant'; text: string };
export type Evidence = { entryIndex: number; quote: string };
export type Judgment = { criterionId: string; verdict: 'met' | 'not_met' | 'uncertain'; rationale: string; evidence: Evidence[] };
export type Assessment = { id: string; createdAt: string; scenarioId: string; rubricVersion: number; rubricSnapshot?: Scenario; sourceType: 'session' | 'trial'; sourceId: string; transcript: Turn[]; provider: string; inputMode: string; configSnapshot: unknown; model: string; usage: { inputTokens: number; outputTokens: number }; aiRunId: string; rawAiText?: string; status: 'pending' | 'complete' | 'invalid'; judgments: Judgment[]; invalidReason?: string; measurement: { transcriptEntries: number; assistantEntries: number; userEntries: number } };
export type AssessmentReview = { id: string; createdAt: string; assessmentId: string; criterionId: string; verdict: Judgment['verdict']; reason: string; operatorId: string; scenarioId: string; rubricVersion: number; sourceType: Assessment['sourceType']; sourceId: string; transcriptDigest: string; rawVerdict: Judgment['verdict']; rawRationale: string };
export const textCannotScoreCriterion = (criterion: string): boolean => /\b(acoustic|audio|speech|voice|pronunciation|prosody|pacing|latency|endpoint\w*|playback|interrupt\w*|silence|microphone|noise|caption\w*|timing|mute\w*|pause|heard|sounds?)\b/i.test(criterion);

const max = (v: unknown, n: number, label: string) => { if (typeof v !== 'string' || !v.trim() || v.length > n) throw new HttpError(400, `${label} must be 1–${n} characters.`); return v.trim(); };
export function seedScenarios(): Scenario[] {
  return (seeds as { id: string; category: string; setup: string; input: string; expected: string }[]).map(s => ({
    id: `${s.id}:v1`, familyId: s.id, version: 1, name: s.category.replaceAll('_', ' '), language: s.id.includes('.lang.') ? 'Hindi-English' : 'English / unspecified',
    scenario: `${s.setup}\n${s.input}`, expectedOutcome: s.expected, criteria: [{ id: 'outcome', text: s.expected }], source: 'seed',
  }));
}
export function parseScenario(body: Record<string, unknown>, familyId: string, version: number): Scenario {
  const criteria = body.criteria;
  if (!Array.isArray(criteria) || criteria.length < 1 || criteria.length > 8) throw new HttpError(400, 'Provide 1–8 observable criteria.');
  const parsed = criteria.map((value, index) => ({ id: `c${index + 1}`, text: max(value, 500, `Criterion ${index + 1}`) }));
  return { id: `${familyId}:v${version}`, familyId, version, name: field(body, 'name', 120), language: field(body, 'language', 80), scenario: field(body, 'scenario', 3000), expectedOutcome: field(body, 'expectedOutcome', 2000), criteria: parsed, source: 'operator' };
}
export function parseTranscript(value: unknown): Turn[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) throw new HttpError(400, 'A transcript needs 1–100 entries.');
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new HttpError(400, `Invalid transcript entry ${index}.`);
    const turn = entry as Record<string, unknown>;
    if (turn.role !== 'user' && turn.role !== 'assistant') throw new HttpError(400, `Invalid transcript role at entry ${index}.`);
    return { role: turn.role, text: max(turn.text, 10000, `Transcript entry ${index}`) };
  });
}
export function transcriptDigest(turns: Turn[]): string { return createHash('sha256').update(JSON.stringify(turns)).digest('hex'); }
export function parseJudgments(raw: string, scenario: Scenario, turns: Turn[]): Judgment[] {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('AI returned malformed JSON.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('AI returned an invalid evaluation object.');
  const rows = (parsed as Record<string, unknown>).judgments;
  if (!Array.isArray(rows) || rows.length !== scenario.criteria.length) throw new Error('AI did not evaluate each criterion exactly once.');
  const seen = new Set<string>();
  return rows.map((row): Judgment => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('AI judgment is malformed.');
    const value = row as Record<string, unknown>;
    if (typeof value.criterionId !== 'string' || !scenario.criteria.some(c => c.id === value.criterionId) || seen.has(value.criterionId)) throw new Error('AI criterion ID is invalid or repeated.');
    seen.add(value.criterionId);
    if (value.verdict !== 'met' && value.verdict !== 'not_met' && value.verdict !== 'uncertain') throw new Error('AI verdict is invalid.');
    const criterion = scenario.criteria.find(c => c.id === value.criterionId)!;
    if (textCannotScoreCriterion(criterion.text) && value.verdict !== 'uncertain') throw new Error('Transcript-only judgment cannot score an acoustic or timing criterion.');
    if (typeof value.rationale !== 'string' || !value.rationale.trim() || value.rationale.length > 1000) throw new Error('AI rationale is invalid.');
    if (!Array.isArray(value.evidence) || value.evidence.length > 5 || (value.verdict !== 'uncertain' && value.evidence.length === 0)) throw new Error('AI evidence is missing or excessive.');
    const evidence = value.evidence.map((e): Evidence => {
      if (!e || typeof e !== 'object' || Array.isArray(e)) throw new Error('AI quote is malformed.');
      const source = e as Record<string, unknown>;
      if (!Number.isSafeInteger(source.entryIndex) || Number(source.entryIndex) < 0 || Number(source.entryIndex) >= turns.length || typeof source.quote !== 'string' || source.quote.length < 4 || source.quote.length > 450 || !turns[Number(source.entryIndex)].text.includes(source.quote)) throw new Error('AI quote does not match its bounded transcript source.');
      return { entryIndex: Number(source.entryIndex), quote: source.quote };
    });
    return { criterionId: value.criterionId, verdict: value.verdict, rationale: value.rationale.trim(), evidence };
  });
}
