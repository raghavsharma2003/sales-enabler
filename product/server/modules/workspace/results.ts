// Results out: the versioned records that leave Vyakti (webhooks, call.record) and the calls export.
// Schema and examples: product/docs/webhooks.md. Records are built when they are SENT, from what the database holds then,
// so an erasure or the transcripts retention that lands before a send, a retry or a replay is always respected:
//   - an erased person (contact erased in place, or an erase_me request on file) goes out with no number, no name and no words;
//   - a call whose words were removed (erasure or retention) sends transcript [] with transcriptRemoved set, and no
//     summary, points, quotes or hand-off summary;
//   - test calls are never a record (channel 'test' or run_manifest.test).
// Phone numbers go out in full or masked (+91•••••1234, name as initials): per webhook endpoint, and for call.record by role
// (a viewer always gets them masked). call.export is owner or compliance only, so its file has full numbers.
import type pg from 'pg';
import type { Router, Req } from '../../http.ts';
import { HttpError } from '../../http.ts';
import type { Caller } from '../../auth.ts';
import type { Queryable } from '../../db.ts';
import { many, one, tx } from '../../db.ts';
import { appendAudit } from '../../audit.ts';
import { tool, type Registry } from '../../tools.ts';
import { recordingLink } from '../../recording-url.ts';
import { bool, num, obj, opt, str, uuid } from '../../../shared/validate.ts';
import { BEST_GRADE, BEST_OUTCOME } from '../calls/stats.ts';
import { REASON_CODES, reasonFor } from '../calls/taxonomy.ts';
import { recordingFor } from '../calls/tools.ts';
import { redactAnalysis, transcriptRemovedWhy } from '../memory/transcript-purge.ts';
import { retentionPolicy } from '../intake/retention.ts';
import { csvCell } from './audit-export.ts';

export type ContactNumber = 'full' | 'masked';
export const BUILDS = ['call.v1', 'contact_opt_out.v1', 'hand_off.v1', 'test.v1'] as const;
export type Build = (typeof BUILDS)[number];

/** The events Vyakti sends, in the order a settings page lists them. */
export const EVENTS = [
  { event: 'call.ended', schema: 'vyakti.call.v1', label: 'A call ended',
    description: 'The full call record once its analysis is done: outcome, reason, transcript, costs, recording link.' },
  { event: 'campaign.state_changed', schema: 'vyakti.campaign_state.v1', label: 'A campaign changed state',
    description: 'Started, paused, resumed, completed or cancelled.' },
  { event: 'contact.opted_out', schema: 'vyakti.contact_opt_out.v1', label: 'A person opted out',
    description: 'They asked on a call, were marked in an imported file, or someone on your team added them.' },
  { event: 'hand_off.created', schema: 'vyakti.hand_off.v1', label: 'A call was handed to a person',
    description: 'The agent transferred the call or queued a callback.' },
  { event: 'wallet.low', schema: 'vyakti.wallet_state.v1', label: 'The wallet is running low',
    description: 'The balance went below the low mark, to zero or below.' },
] as const;
export const EVENT_NAMES = EVENTS.map(e => e.event);

/** A record that can never be built (a test call, a row that is gone): the delivery fails at once instead of retrying. */
export class NotSendable extends Error {}

const E164 = /^\+\d{8,15}$/;
export const maskE164 = (e164: string) => e164.slice(0, 3) + '•••••' + e164.slice(-4);
const initials = (n: string | null) => n ? n.trim().split(/\s+/).map(w => w[0] ?? '').join('').toUpperCase() + '.' : null;

interface PersonRow { contact_id: string | null; contact_e164: string | null; contact_name: string | null; contact_erased_at: Date | null; erase_requested: boolean }
const PERSON_COLS = `ct.e164 AS contact_e164, ct.name AS contact_name, ct.erased_at AS contact_erased_at,
  EXISTS (SELECT 1 FROM forget_request f WHERE f.workspace_id = ct.workspace_id AND f.contact_id = ct.id AND f.scope = 'erase_me') AS erase_requested`;
const erasedPerson = (r: PersonRow) => !!r.contact_erased_at || r.erase_requested || !!r.contact_e164?.startsWith('erased:');

function person(r: PersonRow, n: ContactNumber, fallbackE164?: string | null) {
  if (!r.contact_id && !fallbackE164) return null;
  if (erasedPerson(r)) return { id: r.contact_id, e164: null, masked: false, name: null, erased: true };
  const e = r.contact_e164 ?? fallbackE164 ?? null;
  const e164 = e && E164.test(e) ? (n === 'masked' ? maskE164(e) : e) : null;
  return { id: r.contact_id, e164, masked: n === 'masked' && !!e164, name: n === 'masked' ? initials(r.contact_name) : r.contact_name, erased: false };
}

interface Line { speaker: string; text: string; startMs?: number; endMs?: number }

/** The full record of one ended call, as call.ended sends it and call.record returns it. */
export async function callRecord(q: Queryable, ws: string, conversationId: string, o: { contactNumber: ContactNumber; recordingTtlS?: number }) {
  const c = await one<Record<string, any>>(q, `SELECT cv.*, a.campaign_id, k.name AS campaign_name, ag.id AS agent_id, ag.name AS agent_name, av.number AS agent_version_number,
      ${PERSON_COLS}, ${BEST_OUTCOME} AS best_outcome, ${BEST_GRADE} AS best_grade
    FROM conversation cv
    LEFT JOIN attempt a ON a.id = cv.attempt_id AND a.workspace_id = cv.workspace_id
    LEFT JOIN campaign k ON k.id = a.campaign_id AND k.workspace_id = cv.workspace_id
    LEFT JOIN agent_version av ON av.id = cv.agent_version_id
    LEFT JOIN agent ag ON ag.id = av.agent_id AND ag.workspace_id = cv.workspace_id
    LEFT JOIN contact ct ON ct.id = cv.contact_id AND ct.workspace_id = cv.workspace_id
    WHERE cv.id = $1 AND cv.workspace_id = $2`, [conversationId, ws]);
  if (!c) throw new NotSendable('no such call in this workspace');
  if (c.channel === 'test' || c.run_manifest?.test === true) throw new NotSendable('test calls are never sent');
  const { policy } = await retentionPolicy(q, ws);
  const erased = erasedPerson(c as PersonRow);
  // Words go when the purge ran, and already when an erasure is on file but the purge has not reached this call yet.
  const removedReason: 'erased' | 'retention' | null = c.transcript_purged_at ? (c.transcript_purge_reason === 'erased' ? 'erased' : 'retention') : erased ? 'erased' : null;
  const transcriptRemoved = removedReason
    ? { reason: removedReason, message: transcriptRemovedWhy({ transcript_purged_at: c.transcript_purged_at ?? new Date(), transcript_purge_reason: removedReason }, policy.transcripts_days) }
    : null;
  const words = !transcriptRemoved;
  const analysis = (words ? c.analysis : c.analysis && redactAnalysis(c.analysis)) as Record<string, any> | null;

  const lines: Line[] = words && Array.isArray(c.transcript) ? (c.transcript as Line[]).slice(0, 2000) : [];
  const costs = await many<{ component: string; provider: string; quantity: number; unit: string; inr_milli: number; priced: boolean }>(q,
    `SELECT component, provider, quantity::float AS quantity, unit, inr_milli::int AS inr_milli, coalesce(detail->>'priced', 'true') <> 'false' AS priced
     FROM cost_line WHERE conversation_id = $1 AND workspace_id = $2 ORDER BY created_at, id`, [c.id, ws]);
  const moments = await many<{ kind: string; at_ms: number | null; quote: string | null }>(q,
    'SELECT kind, at_ms, quote FROM call_moment WHERE conversation_id = $1 AND workspace_id = $2 ORDER BY at_ms NULLS LAST', [c.id, ws]);
  const facts = c.contact_id && !erased ? await many<{ kind: string; key: string | null; value: unknown; quote: string }>(q,
    "SELECT kind, key, value, quote FROM memory_fact WHERE workspace_id = $1 AND contact_id = $2 AND conversation_id = $3 AND status = 'active' ORDER BY created_at", [ws, c.contact_id, c.id]) : [];
  const handOffs = await many<{ id: string; mode: string; destination: string | null; status: string; brief: any; created_at: Date }>(q,
    'SELECT id, mode, destination, status, brief, created_at FROM hand_off WHERE conversation_id = $1 AND workspace_id = $2 ORDER BY created_at', [c.id, ws]);
  const rec = await recordingFor({ q, workspaceId: ws, actor: { type: 'system', id: 'workspace.results' } }, c);
  // A link this server signs is re-signed for the longest life the runtime accepts, so a receiver has time to fetch it.
  const recording = rec.url ? (rec.expiresAt ? recordingLink(c.id, ws, { ttlS: o.recordingTtlS ?? 3600 }) ?? { url: rec.url, expiresAt: rec.expiresAt } : { url: rec.url, expiresAt: null }) : null;
  const rc = reasonFor(c.reason_code);

  return {
    schema: 'vyakti.call.v1' as const,
    id: c.id as string, workspaceId: ws, channel: c.channel as string, direction: c.direction as string, status: c.status as string,
    startedAt: c.started_at as Date, endedAt: (c.ended_at ?? null) as Date | null, durationS: c.duration_s ?? null, endReason: c.end_reason ?? null,
    contact: person(c as PersonRow, o.contactNumber),
    campaign: c.campaign_id ? { id: c.campaign_id as string, name: (c.campaign_name ?? null) as string | null } : null,
    attemptId: c.attempt_id ?? null,
    agent: c.agent_id ? { id: c.agent_id as string, name: c.agent_name as string, version: Number(c.agent_version_number), versionId: c.agent_version_id as string } : null,
    outcome: c.best_outcome ? { value: c.best_outcome as string, grade: c.best_grade as string, counts: c.outcome === c.best_outcome } : null,
    reason: rc ? { code: rc.code, label: rc.label } : null,
    flagged: !!c.flagged, flags: (c.flags ?? []) as string[],
    transcriptRemoved,
    transcript: lines.map(l => ({ speaker: l.speaker, text: l.text, startMs: l.startMs ?? null, endMs: l.endMs ?? null })),
    summary: words && typeof analysis?.summary === 'string' && analysis.summary ? analysis.summary as string : null,
    extracted: {
      facts: facts.map(f => ({ kind: f.kind, key: f.key, value: f.value, ...(words ? { quote: f.quote } : {}) })),
      points: words && Array.isArray(analysis?.points) ? analysis!.points.map((p: any) => ({ claim: p.claim, quote: p.quote, startMs: p.startMs ?? null })) : [],
      moments: moments.map(m => ({ kind: m.kind, atMs: m.at_ms, ...(words && m.quote ? { quote: m.quote } : {}) })),
      followUpRequested: analysis?.reasonCode === 'CONV_CALLBACK',
    },
    handOffs: handOffs.map(h => ({ id: h.id, mode: h.mode, destination: h.destination, status: h.status, reason: h.brief?.reason ?? null,
      ...(words && typeof h.brief?.summary === 'string' ? { summary: h.brief.summary } : {}), createdAt: h.created_at })),
    analysis: analysis ? { status: analysis.status ?? null, model: analysis.model ?? null, quotesDropped: analysis.quotesDropped ?? 0 } : null,
    cost: { currency: 'INR' as const, totalInrMilli: Number(c.cost_inr_milli ?? 0), lateInrMilli: Number(c.late_cost_inr_milli ?? 0),
      lines: costs.map(l => ({ component: l.component, provider: l.provider, quantity: l.quantity, unit: l.unit, inrMilli: l.inr_milli, priced: l.priced })) },
    recording, recordingUnavailable: recording ? null : rec.why,
    runManifest: c.run_manifest ?? {},
  };
}

const VIA: Record<string, string> = { in_call: 'call', manual: 'staff', dpdp: 'privacy_request' };

export async function contactOptOutRecord(q: Queryable, ws: string, suppressionId: string, o: { contactNumber: ContactNumber }) {
  const s = await one<PersonRow & { id: string; e164: string | null; scope: string; scope_id: string | null; reason: string; source: string | null; evidence: any; created_at: Date; campaign_name: string | null }>(q,
    `SELECT s.id, s.contact_id, s.e164, s.scope, s.scope_id, s.reason, s.source, s.evidence, s.created_at, k.name AS campaign_name, ${PERSON_COLS}
     FROM suppression s LEFT JOIN contact ct ON ct.id = s.contact_id AND ct.workspace_id = s.workspace_id
     LEFT JOIN campaign k ON s.scope = 'campaign' AND k.id = s.scope_id AND k.workspace_id = s.workspace_id
     WHERE s.id = $1 AND s.workspace_id = $2`, [suppressionId, ws]);
  if (!s) throw new NotSendable('the suppression was removed before it was sent');
  return {
    schema: 'vyakti.contact_opt_out.v1' as const, suppressionId: s.id, workspaceId: ws,
    contact: person(s, o.contactNumber, s.e164),
    scope: s.scope, campaign: s.scope === 'campaign' && s.scope_id ? { id: s.scope_id, name: s.campaign_name } : null,
    // The quote a caller said stays in Vyakti; the receiver gets which call it was.
    via: VIA[s.source ?? ''] ?? 'import', conversationId: s.evidence?.conversationId ?? null, at: s.created_at,
  };
}

export async function handOffRecord(q: Queryable, ws: string, handOffId: string, o: { contactNumber: ContactNumber }) {
  const h = await one<PersonRow & { id: string; conversation_id: string | null; mode: string; destination: string | null; status: string; brief: any; created_at: Date;
    channel: string | null; run_manifest: any; transcript_purged_at: Date | null; campaign_id: string | null; campaign_name: string | null; agent_id: string | null; agent_name: string | null; agent_version_number: number | null }>(q,
    `SELECT h.id, h.conversation_id, h.mode, h.destination, h.status, h.brief, h.created_at, cv.channel, cv.run_manifest, cv.transcript_purged_at, cv.contact_id,
            a.campaign_id, k.name AS campaign_name, ag.id AS agent_id, ag.name AS agent_name, av.number AS agent_version_number, ${PERSON_COLS}
     FROM hand_off h LEFT JOIN conversation cv ON cv.id = h.conversation_id AND cv.workspace_id = h.workspace_id
     LEFT JOIN attempt a ON a.id = cv.attempt_id AND a.workspace_id = cv.workspace_id
     LEFT JOIN campaign k ON k.id = a.campaign_id AND k.workspace_id = cv.workspace_id
     LEFT JOIN agent_version av ON av.id = cv.agent_version_id LEFT JOIN agent ag ON ag.id = av.agent_id AND ag.workspace_id = cv.workspace_id
     LEFT JOIN contact ct ON ct.id = cv.contact_id AND ct.workspace_id = cv.workspace_id
     WHERE h.id = $1 AND h.workspace_id = $2`, [handOffId, ws]);
  if (!h) throw new NotSendable('no such hand-off in this workspace');
  if (h.channel === 'test' || h.run_manifest?.test === true) throw new NotSendable('test calls are never sent');
  const words = !h.transcript_purged_at && !erasedPerson(h);
  return {
    schema: 'vyakti.hand_off.v1' as const, id: h.id, workspaceId: ws, conversationId: h.conversation_id, mode: h.mode, destination: h.destination, status: h.status,
    reason: h.brief?.reason ?? null, ...(words && typeof h.brief?.summary === 'string' ? { summary: h.brief.summary } : {}),
    contact: person(h, o.contactNumber),
    campaign: h.campaign_id ? { id: h.campaign_id, name: h.campaign_name } : null,
    agent: h.agent_id ? { id: h.agent_id, name: h.agent_name, version: Number(h.agent_version_number) } : null,
    at: h.created_at,
  };
}

const SAMPLE_ID = '00000000-0000-4000-8000-000000000000';
/** A made-up record of the given event's shape, for "Send a test event". Every value is synthetic. */
export function sampleRecord(event: string, ws: string, n: ContactNumber): Record<string, unknown> {
  const e164 = '+919000000000', contact = { id: SAMPLE_ID, e164: n === 'masked' ? maskE164(e164) : e164, masked: n === 'masked', name: n === 'masked' ? 'SP.' : 'Sample Person', erased: false };
  const at = new Date().toISOString(), campaign = { id: SAMPLE_ID, name: 'Sample campaign' };
  switch (event) {
    case 'campaign.state_changed': return { campaignId: SAMPLE_ID, name: 'Sample campaign', from: 'running', to: 'paused', cause: 'person', at };
    case 'contact.opted_out': return { schema: 'vyakti.contact_opt_out.v1', suppressionId: SAMPLE_ID, workspaceId: ws, contact, scope: 'workspace', campaign: null, via: 'call', conversationId: SAMPLE_ID, at };
    case 'hand_off.created': return { schema: 'vyakti.hand_off.v1', id: SAMPLE_ID, workspaceId: ws, conversationId: SAMPLE_ID, mode: 'warm', destination: 'team:support', status: 'queued',
      reason: 'asked_for_person', summary: 'Sample summary: the person asked to speak to someone about their bill.', contact, campaign, agent: { id: SAMPLE_ID, name: 'Sample agent', version: 1 }, at };
    default: return {
      schema: 'vyakti.call.v1', id: SAMPLE_ID, workspaceId: ws, channel: 'phone', direction: 'outbound', status: 'done', startedAt: at, endedAt: at, durationS: 42, endReason: 'completed',
      contact, campaign, attemptId: SAMPLE_ID, agent: { id: SAMPLE_ID, name: 'Sample agent', version: 1, versionId: SAMPLE_ID },
      outcome: { value: 'agreed', grade: 'ai_guess', counts: false }, reason: { code: 'CONV_GOAL_DONE', label: reasonFor('CONV_GOAL_DONE')?.label ?? 'The agenda was completed' },
      flagged: false, flags: [], transcriptRemoved: null,
      transcript: [{ speaker: 'agent', text: 'Hello, this is a sample call from Vyakti.', startMs: 0, endMs: 2500 }, { speaker: 'caller', text: 'This is a sample reply.', startMs: 3000, endMs: 4500 }],
      summary: 'Sample summary.', extracted: { facts: [], points: [], moments: [], followUpRequested: false }, handOffs: [],
      analysis: { status: 'done', model: null, quotesDropped: 0 },
      cost: { currency: 'INR', totalInrMilli: 0, lateInrMilli: 0, lines: [] }, recording: null, recordingUnavailable: 'This is a sample event; there is no recording.', runManifest: {},
    };
  }
}

/** Build what a delivery sends. `payload` holds the ids the event was queued with. */
export async function buildRecord(q: Queryable, ws: string, build: Build, payload: Record<string, any>, event: string, o: { contactNumber: ContactNumber }): Promise<unknown> {
  switch (build) {
    case 'call.v1': return callRecord(q, ws, String(payload.conversationId), o);
    case 'contact_opt_out.v1': return contactOptOutRecord(q, ws, String(payload.suppressionId), o);
    case 'hand_off.v1': return handOffRecord(q, ws, String(payload.handOffId), o);
    case 'test.v1': return sampleRecord(event, ws, o.contactNumber);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// call.export: the calls list for a filter, as CSV, streamed at download time.

const DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/;
const exportInput = obj({
  campaignId: opt(uuid()), agentVersionId: opt(uuid()),
  outcome: opt(str({ max: 80, desc: "one of this workspace's outcome values, e.g. 'agreed'" })),
  reasonCode: opt(str({ oneOf: REASON_CODES.map(r => r.code) })),
  from: opt(str({ pattern: DATE })), to: opt(str({ pattern: DATE })), flagged: opt(bool()),
});
type ExportFilter = ReturnType<typeof exportInput>;
const HOLD_MS = 24 * 3600_000, PAGE = 500, MAX_ROWS = 200_000;

const COLUMNS = ['call_id', 'started_at', 'ended_at', 'duration_s', 'direction', 'campaign', 'agent', 'agent_version', 'phone', 'contact_name', 'outcome', 'outcome_grade',
  'reason_code', 'reason', 'end_reason', 'cost_inr', 'flagged', 'flags', 'transcript_removed', 'summary'] as const;

/** The calls-list filter plus what every export leaves out: test calls, live calls, suppressed and erased people. */
function exportWhere(ws: string, f: ExportFilter): { where: string; params: unknown[] } {
  const where = [`cv.workspace_id = $1`, `cv.channel <> 'test'`, `coalesce(cv.run_manifest->>'test', 'false') <> 'true'`, `cv.status <> 'live'`,
    `(ct.id IS NULL OR (ct.erased_at IS NULL AND ct.e164 NOT LIKE 'erased:%'))`,
    `NOT EXISTS (SELECT 1 FROM forget_request f WHERE f.workspace_id = cv.workspace_id AND f.contact_id = cv.contact_id AND f.scope = 'erase_me')`,
    `NOT EXISTS (SELECT 1 FROM suppression s WHERE s.workspace_id = cv.workspace_id AND s.scope = 'workspace' AND (s.contact_id = cv.contact_id OR (ct.e164 IS NOT NULL AND s.e164 = ct.e164)))`];
  const params: unknown[] = [ws];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', '$' + params.length)); };
  if (f.campaignId) add('a.campaign_id = ?', f.campaignId);
  if (f.agentVersionId) add('cv.agent_version_id = ?', f.agentVersionId);
  if (f.reasonCode) add('cv.reason_code = ?', f.reasonCode);
  if (f.outcome) add(`${BEST_OUTCOME} = ?`, f.outcome);
  if (f.from) add('cv.started_at >= ?::timestamptz', f.from);
  if (f.to) add('cv.started_at < ?::timestamptz', f.to);
  if (f.flagged !== undefined) add('cv.flagged = ?', f.flagged);
  return { where: where.join(' AND '), params };
}
const EXPORT_FROM = `FROM conversation cv LEFT JOIN attempt a ON a.id = cv.attempt_id AND a.workspace_id = cv.workspace_id
  LEFT JOIN campaign k ON k.id = a.campaign_id AND k.workspace_id = cv.workspace_id
  LEFT JOIN agent_version av ON av.id = cv.agent_version_id LEFT JOIN agent ag ON ag.id = av.agent_id AND ag.workspace_id = cv.workspace_id
  LEFT JOIN contact ct ON ct.id = cv.contact_id AND ct.workspace_id = cv.workspace_id`;

const inr = (milli: unknown) => (Number(milli ?? 0) / 1000).toFixed(3);
export function exportLine(r: Record<string, any>): string {
  const iso = (d: unknown) => d ? new Date(d as string).toISOString() : '';
  const removed = r.transcript_purged_at ? (r.transcript_purge_reason === 'erased' ? 'erased' : 'retention') : '';
  const summary = !removed && typeof r.analysis?.summary === 'string' ? r.analysis.summary : '';
  // Values Vyakti produced are written as they are; everything a person or a model wrote goes through csvCell (formula-escaped).
  return [r.id, iso(r.started_at), iso(r.ended_at), r.duration_s ?? '', r.direction, csvCell(r.campaign_name), csvCell(r.agent_name), r.agent_version_number ?? '',
    typeof r.e164 === 'string' && E164.test(r.e164) ? r.e164 : '', csvCell(r.contact_name), csvCell(r.outcome), r.grade ?? '', r.reason_code ?? '',
    csvCell(reasonFor(r.reason_code)?.label ?? ''), csvCell(r.end_reason), inr(r.cost_inr_milli), r.flagged ? 'yes' : 'no', csvCell((r.flags ?? []).join(' ')), removed, csvCell(summary)].join(',');
}

async function exportCount(q: Queryable, ws: string, f: ExportFilter): Promise<number> {
  const { where, params } = exportWhere(ws, f);
  return (await one<{ n: number }>(q, `SELECT count(*)::int AS n ${EXPORT_FROM} WHERE ${where}`, params))!.n;
}

/** Stream the export's rows a page at a time, newest first (keyset on started_at, id). */
export async function streamCallsCsv(pool: pg.Pool, ws: string, f: ExportFilter, write: (s: string) => void, closed?: AbortSignal): Promise<number> {
  write(COLUMNS.join(',') + '\r\n');
  const { where, params } = exportWhere(ws, f);
  let after: { t: Date; id: string } | null = null, n = 0;
  while (!closed?.aborted && n < MAX_ROWS) {
    const p = [...params];
    let w = where;
    if (after) { p.push(after.t, after.id); w += ` AND (cv.started_at, cv.id) < ($${p.length - 1}::timestamptz, $${p.length}::uuid)`; }
    p.push(Math.min(PAGE, MAX_ROWS - n));
    const rows = await many<Record<string, any>>(pool, `SELECT cv.id, cv.started_at, cv.ended_at, cv.duration_s, cv.direction, cv.reason_code, cv.end_reason, cv.cost_inr_milli,
        cv.flagged, cv.flags, cv.analysis, cv.transcript_purged_at, cv.transcript_purge_reason, k.name AS campaign_name, ag.name AS agent_name, av.number AS agent_version_number,
        ct.e164, ct.name AS contact_name, ${BEST_OUTCOME} AS outcome, ${BEST_GRADE} AS grade
      ${EXPORT_FROM} WHERE ${w} ORDER BY cv.started_at DESC, cv.id DESC LIMIT $${p.length}`, p);
    if (!rows.length) break;
    write(rows.map(exportLine).join('\r\n') + '\r\n');
    n += rows.length;
    const last = rows[rows.length - 1];
    after = { t: last.started_at, id: last.id };
    if (rows.length < PAGE) break;
  }
  return n;
}

function describeFilter(f: ExportFilter, campaign: string | null): string {
  const parts = [campaign ? `the campaign ${campaign}` : null, f.outcome ? `outcome ${f.outcome}` : null, f.reasonCode ? `reason ${reasonFor(f.reasonCode)?.label ?? f.reasonCode}` : null,
    f.from ? `from ${f.from.slice(0, 10)}` : null, f.to ? `to ${f.to.slice(0, 10)}` : null, f.flagged === true ? 'flagged only' : f.flagged === false ? 'not flagged' : null,
    f.agentVersionId ? 'one agent version' : null].filter(Boolean);
  return parts.length ? ` (${parts.join(', ')})` : ' (every call)';
}

export function registerResults(r: Registry) {
  r.register(tool(obj({}), {
    name: 'webhook.events', risk: 'read', summary: 'List the events a webhook can listen for and the record each one sends',
    run: async () => ({ events: EVENTS }),
  }));

  r.register(tool(obj({ conversationId: uuid() }), {
    name: 'call.record', risk: 'read', summary: 'The versioned full record of one call, exactly as the call.ended webhook sends it (phone numbers masked for viewers)',
    run: async (ctx, i) => {
      try { return await callRecord(ctx.q, ctx.workspaceId, i.conversationId, { contactNumber: ctx.actor.role === 'viewer' ? 'masked' : 'full', recordingTtlS: 600 }); }
      catch (e) { if (e instanceof NotSendable) throw new Error(e.message === 'test calls are never sent' ? 'this is a test call; test calls have no results record' : e.message); throw e; }
    },
  }));

  r.register(tool(exportInput, {
    name: 'call.export', risk: 'policy', roles: ['owner', 'compliance'],
    summary: 'Export the calls list for a filter as CSV (personal data leaves Vyakti; approved by Compliance or Owner, audited)',
    describe: async (i, ctx) => {
      const k = i.campaignId ? (await one<{ name: string }>(ctx.q, 'SELECT name FROM campaign WHERE id = $1 AND workspace_id = $2', [i.campaignId, ctx.workspaceId]))?.name ?? 'this campaign' : null;
      return `Export the calls list${describeFilter(i, k)} as CSV with full phone numbers. Test calls, suppressed people and erased people are left out. Personal data leaves Vyakti.`;
    },
    run: async (ctx, i) => {
      const rows = await exportCount(ctx.q, ctx.workspaceId, i);
      const row = await one<{ id: string; expires_at: Date }>(ctx.q,
        `INSERT INTO call_export (workspace_id, filters, requested_by, approved_by, expires_at) VALUES ($1,$2,$3,$4, now() + ($5 || ' milliseconds')::interval) RETURNING id, expires_at`,
        [ctx.workspaceId, JSON.stringify(i), ctx.actor.id ?? ctx.actor.type, /^[0-9a-f-]{36}$/i.test(ctx.actor.id ?? '') ? ctx.actor.id : null, String(HOLD_MS)]);
      return { exportId: row!.id, rows: Math.min(rows, MAX_ROWS), expiresAt: row!.expires_at, download: `/v1/exports/calls/${row!.id}`,
        note: 'The file is made when it is downloaded, from the calls as they are then: anyone suppressed or erased since is left out.' };
    },
  }));

  r.register(tool(obj({ limit: opt(num({ int: true, min: 1, max: 50 })) }), {
    name: 'call.export.list', risk: 'read', roles: ['owner', 'compliance'], summary: 'List recent calls exports and whether each can still be downloaded',
    run: async (ctx, i) => ({
      exports: await many(ctx.q, `SELECT id, filters, requested_by AS "requestedBy", approved_by AS "approvedBy", downloads, created_at AS "createdAt", expires_at AS "expiresAt",
          expires_at > now() AS downloadable FROM call_export WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2`, [ctx.workspaceId, i.limit ?? 20]),
    }),
  }));
}

export function resultsRoutes(router: Router, pool: pg.Pool, auth: (req: Req) => Promise<Caller>) {
  // The file itself, streamed. A signed-in owner or compliance member only (not an API key); every download is in the ledger.
  router.add('GET', '/v1/exports/calls/:id', async req => {
    const c = await auth(req);
    if (c.via === 'key' || !c.memberId) throw new HttpError(403, 'human_only', 'calls exports are downloaded by a signed-in person');
    if (c.actor.role !== 'owner' && c.actor.role !== 'compliance') throw new HttpError(403, 'forbidden', 'only an owner or compliance member can download calls exports');
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw new HttpError(404, 'not_found', 'no such export');
    const x = await tx(pool, async q => {
      const row = await one<{ filters: ExportFilter; expires_at: Date; created_at: Date }>(q,
        'SELECT filters, expires_at, created_at FROM call_export WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [req.params.id, c.workspaceId]);
      if (!row) throw new HttpError(404, 'not_found', 'no such export');
      if (row.expires_at.getTime() < Date.now()) throw new HttpError(410, 'expired', 'this export has expired; export again');
      await q.query('UPDATE call_export SET downloads = downloads + 1 WHERE id = $1', [req.params.id]);
      await appendAudit(q, { workspaceId: c.workspaceId, actorType: 'member', actorId: c.memberId, action: 'call.export.download', objectType: 'call_export', objectId: req.params.id, payload: { filters: row.filters } });
      return row;
    });
    const filters = exportInput(x.filters);
    return {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="vyakti-calls-${x.created_at.toISOString().slice(0, 10)}-${req.params.id.slice(0, 8)}.csv"`,
        'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
      stream: async (write, closed) => {
        try { await streamCallsCsv(pool, c.workspaceId, filters, write, closed); }
        catch (e) { console.error('[vp] calls export', e instanceof Error ? e.message : e); write('\r\n"the export stopped early; download it again"\r\n'); }
      },
    };
  });
}
