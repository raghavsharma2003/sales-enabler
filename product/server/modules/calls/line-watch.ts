// Blueprint decision 9, the per-line half (decision.2026-10-24.catastrophic-line-detector): one line of hers that people
// keep reacting badly to is caught within the script's first calls, and the script is slowed to 25%. Learning's harm lane
// (learning/harm.ts) catches harm classes; this catches a line. Pure detection first (no database, no model), then the
// tool that reads the window and writes learning's script_throttle row, so campaigns' G12 slows the script with no new
// hook and learning's script.pacing.restore restores it.
//   a line      one agent turn, normalised: lower case, letters and digits in any script, digits as #, the person's own
//               name and 1-character tokens dropped. Two lines are the same line when their token sets overlap with
//               Jaccard >= SAME_LINE (greedy, in call order; the first seen is the one quoted).
//   a reaction  a caller hang-up (END_EARLY_HANGUP, END_HUNG_UP_MID) goes to her last line; an opt-out (a caller line the
//               safety floor reads as opt-out, or an opt_out moment) to her line just before it; a complaint
//               (CONV_COMPLAINT) to her line before the first objection moment's caller line, else her last line.
//   the trip    a line said in n calls of the window, with a reaction after it in k of them, trips when k >= MIN_BAD and
//               the one-sided binomial P(X >= k | n, p0) < ALPHA; p0 is OPENER_P0 for her first line (the early-hang-up
//               monitor's own threshold) and LINE_P0 for any later line (assumed, see the decision's reverse_if).
import { many, one, type Queryable } from '../../db.ts';
import { callerSignals } from '../../../shared/safety/index.ts';

export const LINE_WINDOW = 15, MIN_BAD = 3, ALPHA = 0.01, OPENER_P0 = 0.35, LINE_P0 = 0.15, SAME_LINE = 0.7, THROTTLE_FACTOR = 0.25;
export type Reaction = 'hang_up' | 'opt_out' | 'complaint';
export const REACTION_WORDS: Record<Reaction, string> = { hang_up: 'hung up', opt_out: 'asked not to be called', complaint: 'complained' };

type Line = { speaker: 'agent' | 'caller'; text: string; startMs?: number };
export interface WatchedCall {
  id: string; reason_code: string | null; transcript: Line[] | null; contact_name: string | null;
  moments: { kind: string; quote: string | null; at_ms: number | null }[];
}

export function tokens(text: string, drop: Set<string> = new Set()): Set<string> {
  const t = text.toLowerCase().normalize('NFC').replace(/\d+/g, '#').match(/[\p{L}\p{M}#]+/gu) ?? [];
  return new Set(t.filter(w => [...w].length > 1 && !drop.has(w)));
}
/** Her line as quoted in the issue: the person's own name never travels with it. */
export function withoutName(text: string, name: string | null): string {
  const parts = (name ?? '').split(/\s+/).filter(w => [...w].length > 1).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return parts.length ? text.replace(new RegExp(`(?<![\\p{L}\\p{M}])(${parts.join('|')})(?![\\p{L}\\p{M}])`, 'giu'), '[name]') : text;
}
const jaccard = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let n = 0; for (const x of a) if (b.has(x)) n++;
  return n / (a.size + b.size - n);
};

/** One call: the index of each of her lines, and which lines a reaction followed (by line index). */
export function reactions(c: WatchedCall): { agentLines: number[]; bad: Map<number, Reaction> } {
  const lines = c.transcript ?? [];
  const agentLines = lines.flatMap((l, i) => (l.speaker === 'agent' ? [i] : []));
  const bad = new Map<number, Reaction>();
  if (!agentLines.length) return { agentLines, bad };
  const before = (i: number) => { for (let j = i - 1; j >= 0; j--) if (lines[j].speaker === 'agent') return j; return -1; };
  const last = agentLines[agentLines.length - 1];
  const callerAt = (quote: string | null) => quote ? lines.findIndex(l => l.speaker === 'caller' && l.text.trim() === quote.trim()) : -1;
  // Opt-out first: it says the most about the line before it.
  const optLine = lines.findIndex(l => l.speaker === 'caller' && callerSignals(l.text).optOut);
  const optMoment = c.moments.filter(m => m.kind === 'opt_out').map(m => callerAt(m.quote)).find(i => i >= 0) ?? -1;
  const opt = [optLine, optMoment].filter(i => i >= 0).sort((a, b) => a - b)[0];
  if (opt !== undefined && before(opt) >= 0) bad.set(before(opt), 'opt_out');
  if (c.reason_code === 'CONV_COMPLAINT') {
    const o = c.moments.filter(m => m.kind === 'objection').map(m => callerAt(m.quote)).find(i => i >= 0) ?? -1;
    const at = o >= 0 ? before(o) : last;
    if (at >= 0 && !bad.has(at)) bad.set(at, 'complaint');
  }
  if ((c.reason_code === 'END_EARLY_HANGUP' || c.reason_code === 'END_HUNG_UP_MID') && !bad.has(last)) bad.set(last, 'hang_up');
  return { agentLines, bad };
}

/** P(X >= k) for X ~ Binomial(n, p). */
export function tail(k: number, n: number, p: number): number {
  let s = 0, c = 1;
  for (let i = 0; i <= n; i++) { if (i > 0) c = (c * (n - i + 1)) / i; if (i >= k) s += c * p ** i * (1 - p) ** (n - i); }
  return s;
}

export interface LineTrip {
  line: string; opener: boolean; said: number; bad: number; p: number;
  calls: { callId: string; reaction: Reaction | null }[];
}

/** Over calls in order (oldest first), the first window of LINE_WINDOW consecutive calls in which one line trips. */
export function catastrophicLine(calls: WatchedCall[]): LineTrip | null {
  type Cluster = { rep: Set<string>; text: string; opener: boolean; hits: { call: number; reaction: Reaction | null }[] };
  const clusters: Cluster[] = [];
  const seen = calls.map(c => {
    const drop = tokens(c.contact_name ?? '');
    const { agentLines, bad } = reactions(c);
    const lines = c.transcript ?? [];
    return agentLines.map((i, n) => ({ toks: tokens(lines[i].text, drop), text: withoutName(lines[i].text, c.contact_name), opener: n === 0, reaction: bad.get(i) ?? null }));
  });
  for (let end = 0; end < calls.length; end++) {
    for (const l of seen[end]) {
      if (!l.toks.size) continue;
      let c = clusters.find(x => x.opener === l.opener && jaccard(x.rep, l.toks) >= SAME_LINE);
      if (!c) clusters.push(c = { rep: l.toks, text: l.text, opener: l.opener, hits: [] });
      const prev = c.hits.find(h => h.call === end);
      if (prev) prev.reaction ??= l.reaction; else c.hits.push({ call: end, reaction: l.reaction });
    }
    // Each new call closes a window: the last LINE_WINDOW calls up to it.
    const from = Math.max(0, end - LINE_WINDOW + 1);
    for (const c of clusters) {
      const inWin = c.hits.filter(h => h.call >= from && h.call <= end);
      const k = inWin.filter(h => h.reaction).length, n = inWin.length;
      if (k < MIN_BAD) continue;
      const p = tail(k, n, c.opener ? OPENER_P0 : LINE_P0);
      if (p < ALPHA) return { line: c.text, opener: c.opener, said: n, bad: k, p, calls: inWin.map(h => ({ callId: calls[h.call].id, reaction: h.reaction })) };
    }
  }
  return null;
}

const LIVE = `c.channel <> 'test' AND coalesce(c.run_manifest->>'test', 'false') <> 'true' AND c.status IN ('ended','processing','done')`;

/** script.line_check: after a live call is analysed, read the script's recent analysed live calls (since its last
 *  restore) and slow it when one of her lines trips. One active throttle per script, whichever lane wrote it. */
export async function lineCheck(q: Queryable, ws: string, conversationId: string) {
  const cv = await one<{ version_id: string | null; agent_id: string | null }>(q,
    `SELECT c.agent_version_id AS version_id, v.agent_id FROM conversation c LEFT JOIN agent_version v ON v.id = c.agent_version_id WHERE c.id = $1 AND c.workspace_id = $2`, [conversationId, ws]);
  if (!cv?.version_id || !cv.agent_id) return { state: 'no_script' as const };
  const active = await one<{ id: string }>(q, 'SELECT id FROM script_throttle WHERE workspace_id = $1 AND agent_version_id = $2 AND restored_at IS NULL', [ws, cv.version_id]);
  if (active) return { state: 'throttled' as const, throttleId: active.id };
  const since = (await one<{ at: Date | null }>(q, 'SELECT max(restored_at) AS at FROM script_throttle WHERE workspace_id = $1 AND agent_version_id = $2', [ws, cv.version_id]))?.at ?? null;
  const calls = (await many<WatchedCall>(q, `SELECT c.id, c.reason_code, c.transcript, ct.name AS contact_name,
        coalesce((SELECT json_agg(json_build_object('kind', m.kind, 'quote', m.quote, 'at_ms', m.at_ms)) FROM call_moment m
                  WHERE m.conversation_id = c.id AND m.workspace_id = c.workspace_id), '[]'::json) AS moments
      FROM conversation c LEFT JOIN contact ct ON ct.id = c.contact_id AND ct.workspace_id = c.workspace_id
      WHERE c.workspace_id = $1 AND c.agent_version_id = $2 AND ${LIVE} AND c.analysis->>'status' = 'done'
        AND ($3::timestamptz IS NULL OR c.ended_at > $3)
      ORDER BY c.ended_at DESC NULLS LAST, c.id DESC LIMIT $4`, [ws, cv.version_id, since, LINE_WINDOW])).reverse();
  const trip = catastrophicLine(calls);
  if (!trip) return { state: 'ok' as const, calls: calls.length };
  const v = await one<{ number: number; name: string }>(q, 'SELECT v.number, a.name FROM agent_version v JOIN agent a ON a.id = v.agent_id WHERE v.id = $1', [cv.version_id]);
  const counts = (r: Reaction) => trip.calls.filter(c => c.reaction === r).length;
  const said = (['hang_up', 'opt_out', 'complaint'] as Reaction[]).filter(r => counts(r)).map(r => `${counts(r)} ${REACTION_WORDS[r]}`).join(', ');
  const detail = { kind: 'script_throttled', signal: 'catastrophic_line', agentId: cv.agent_id, versionId: cv.version_id, agentName: v?.name, versionNumber: v?.number,
    factor: THROTTLE_FACTOR, window: LINE_WINDOW, line: trip.line, opener: trip.opener, said: trip.said, bad: trip.bad, p: Number(trip.p.toPrecision(3)),
    calls: trip.calls.map(c => c.callId), reactions: trip.calls.filter(c => c.reaction),
    summary: `After one line of ${v?.name ?? 'this agent'}, version ${v?.number ?? '?'}, people reacted badly on ${trip.bad} of the ${trip.said} calls where she said it (${said}): "${trip.line}". Its campaigns are slowed to ${THROTTLE_FACTOR * 100}% of their lines until a member restores them.` };
  const issue = (await one<{ id: string }>(q, `INSERT INTO issue (workspace_id, category, severity, subject_type, subject_id, detail) VALUES ($1,'Safety','critical','agent_version',$2,$3) RETURNING id`,
    [ws, cv.version_id, JSON.stringify(detail)]))!.id;
  const t = await one<{ id: string }>(q, `INSERT INTO script_throttle (workspace_id, agent_id, agent_version_id, factor, issue_id, detail) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (agent_version_id) WHERE restored_at IS NULL DO NOTHING RETURNING id`, [ws, cv.agent_id, cv.version_id, THROTTLE_FACTOR, issue, JSON.stringify(detail)]);
  if (!t) { await q.query('DELETE FROM issue WHERE id = $1', [issue]); return { state: 'throttled' as const }; }   // the other lane got there first
  return { state: 'throttled_now' as const, throttleId: t.id, issueId: issue, factor: THROTTLE_FACTOR, line: trip.line, said: trip.said, bad: trip.bad };
}
