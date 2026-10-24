// Analysed calls in the shapes real analysis writes, for learning tests. Synthetic and fictional: every call comes from
// the analysis bench's own hand-written cases (scripts/analysis-bench/cases.ts), whose keys say what a careful reader
// records. What is written is what calls' analysis stores (analysis.ts store()): conversation.reason_code and
// .analysis {status:'done', reasonCode, outcomeGuess, ...}, call_moment rows (source 'analysis', kind, at_ms, quote: the
// caller's exact line), and, for insight, a call_insight row whose themes went through calls' own groundThemes().
// Shapes covered, as the 2026-10-23 round-3 bench saw them (research/2026-10-23/benches-r3, 270 analyses):
//   outcomes   agreed, not_interested, callback, needs_human, wrong_person, and none (94 of 270)
//   reasons    CONV_GOAL_DONE, CONV_CALLBACK, END_OPTED_OUT, CONV_WRONG_PERSON, CONV_LANGUAGE_MISMATCH, END_CRISIS,
//              END_EARLY_HANGUP, DIAL_NO_ANSWER, CONV_NOT_INTERESTED, CONV_NEEDS_HUMAN, CONV_COMPLAINT, ...
//   moments    objection, commitment, confusion, callback_request, opt_out, question
import type pg from 'pg';
import { one } from '../../server/db.ts';
import { groundThemes, type Theme } from '../../server/modules/calls/insights.ts';
import { perCallCases, type Case } from '../../scripts/analysis-bench/cases.ts';

export const CASES: Case[] = perCallCases();
export const byTemplate = (t: string): Case[] => CASES.filter(c => c.template === t);

export interface Written { conversationId: string; case: Case; lines: { speaker: 'agent' | 'caller'; text: string; startMs: number }[] }

/** One analysed call per case, on `versionId`, as calls' analysis leaves it. No answer: a conversation with no lines. */
export async function writeAnalysed(pool: pg.Pool, ws: string, versionId: string, cases: Case[], o: { endedAgoMin?: number } = {}): Promise<Written[]> {
  const out: Written[] = [];
  for (const [k, c] of cases.entries()) {
    const lines = c.lines.map((l, i) => ({ speaker: l.speaker, text: l.text, startMs: i * 4000 }));
    const contact = (await one<{ id: string }>(pool, 'INSERT INTO contact (workspace_id, e164, name) VALUES ($1,$2,$3) RETURNING id',
      [ws, '+9190' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0'), `Fixture person ${k + 1}`]))!.id;
    const outcomeLine = c.key.outcomeLine !== undefined ? lines[c.key.outcomeLine] : undefined;
    const analysis = { status: 'done', summary: `fixture ${c.template}`, reasonCode: c.key.reasonCode, modelReasonCode: c.key.reasonCode,
      outcomeGuess: c.key.outcome && outcomeLine ? { value: c.key.outcome, quote: outcomeLine.text } : null, quotesProposed: c.key.moments.length, quotesDropped: 0 };
    const conv = (await one<{ id: string }>(pool, `INSERT INTO conversation (workspace_id, contact_id, agent_version_id, channel, status, reason_code, end_reason,
        transcript, analysis, started_at, ended_at, duration_s)
      VALUES ($1,$2,$3,'phone','done',$4,$5,$6,$7, now() - make_interval(mins => $8) - make_interval(secs => $9), now() - make_interval(mins => $8), $9) RETURNING id`,
      [ws, contact, versionId, c.key.reasonCode, c.endReason, JSON.stringify(lines), JSON.stringify(analysis), (o.endedAgoMin ?? 5) + k, c.durationS]))!.id;
    for (const m of c.key.moments) {
      const l = lines[m.line]!;
      await pool.query(`INSERT INTO call_moment (workspace_id, conversation_id, source, kind, at_ms, note, quote) VALUES ($1,$2,'analysis',$3,$4,$5,$6)`,
        [ws, conv, m.kind, l.startMs, `fixture ${m.kind}`, l.text]);
    }
    out.push({ conversationId: conv, case: c, lines });
  }
  return out;
}

/** A call_insight row for an agent scope, with themes grounded by calls' own check: a theme survives only with 2+ quotes
 *  that are exact caller lines of the calls it names. `raw` is what the insight model would return, by call label. */
export async function writeInsight(pool: pg.Pool, ws: string, agentId: string, calls: Written[], raw: { themes: { kind: string; title: string; quotes: { call: string; text: string }[]; calls?: string[] }[] }): Promise<Theme[]> {
  const sampled = calls.map((w, i) => ({ id: w.conversationId, label: `c${i + 1}`, ended_at: new Date(), transcript: w.lines,
    reason_code: w.case.key.reasonCode, outcome: null, goal: w.case.key.outcome === 'agreed' }));
  const g = groundThemes(raw, sampled);
  await pool.query(`INSERT INTO call_insight (workspace_id, scope_type, scope_id, status, themes, calls_sampled, calls_in_scope, newest_call_at, quotes_proposed, quotes_dropped, themes_dropped)
    VALUES ($1,'agent',$2,'done',$3,$4,$4, now(), $5,$6,$7)`, [ws, agentId, JSON.stringify(g.themes), calls.length, g.quotesProposed, g.quotesDropped, g.themesDropped]);
  return g.themes;
}

/** The label a call has in writeInsight's sample (c1, c2, ...), for writing a raw theme. */
export const labelOf = (calls: Written[], w: Written) => `c${calls.indexOf(w) + 1}`;
/** The caller line of a case's first moment of `kind`. */
export const callerLine = (w: Written, kind: string) => w.lines[w.case.key.moments.find(m => m.kind === kind)!.line]!.text;
