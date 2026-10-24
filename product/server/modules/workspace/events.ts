// call.ended: the one versioned full record of a finished call, queued for every webhook that listens.
// Schema vp.call.v1, documented in EVENTS.md next to this file. Test calls never emit. The contact's number and name are
// masked unless the endpoint was created with contactNumber 'full'. The recording link is signed and lives an hour (the
// longest the voice runtime accepts). A call whose transcript was purged carries an empty transcript and says why.
import type { Registry, ToolCtx } from '../../tools.ts';
import { tool } from '../../tools.ts';
import { many, one } from '../../db.ts';
import { recordingLink } from '../../recording-url.ts';
import { obj, uuid } from '../../../shared/validate.ts';
import { REASON_CODES } from '../calls/taxonomy.ts';
import { recordingFor } from '../calls/tools.ts';
import { retentionPolicy } from '../intake/retention.ts';
import { transcriptRemovedWhy } from '../memory/transcript-purge.ts';

export const CALL_SCHEMA = 'vp.call.v1';
const RECORDING_TTL_S = 3600;

export const maskPhone = (e164: string | null) => !e164 ? null : e164.startsWith('+') ? e164.slice(0, 3) + '•••••' + e164.slice(-4) : '•••';
export const initials = (n: string | null) => { const w = (n ?? '').trim().split(/\s+/).filter(Boolean); return w.length ? w.map(x => x[0].toUpperCase() + '.').join(' ') : null; };

type Row = Record<string, any>;

export async function callRecord(ctx: ToolCtx, conversationId: string): Promise<{ masked: Record<string, unknown>; whole: Record<string, unknown> } | null> {
  const c = await one<Row>(ctx.q, `SELECT cv.*, a.campaign_id, k.name AS campaign_name, ag.id AS agent_id, ag.name AS agent_name, av.number AS agent_version_number,
      ct.e164, ct.name AS contact_name, ct.language AS contact_language, ct.erased_at,
      (SELECT o.value FROM outcome o WHERE o.conversation_id = cv.id AND o.workspace_id = cv.workspace_id ORDER BY CASE o.grade WHEN 'verified' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, o.created_at DESC LIMIT 1) AS best_outcome,
      (SELECT o.grade FROM outcome o WHERE o.conversation_id = cv.id AND o.workspace_id = cv.workspace_id ORDER BY CASE o.grade WHEN 'verified' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, o.created_at DESC LIMIT 1) AS best_grade
    FROM conversation cv
    LEFT JOIN attempt a ON a.id = cv.attempt_id AND a.workspace_id = cv.workspace_id
    LEFT JOIN campaign k ON k.id = a.campaign_id AND k.workspace_id = cv.workspace_id
    LEFT JOIN agent_version av ON av.id = cv.agent_version_id
    LEFT JOIN agent ag ON ag.id = av.agent_id AND ag.workspace_id = cv.workspace_id
    LEFT JOIN contact ct ON ct.id = cv.contact_id AND ct.workspace_id = cv.workspace_id
    WHERE cv.id = $1 AND cv.workspace_id = $2`, [conversationId, ctx.workspaceId]);
  if (!c || c.channel === 'test') return null;
  const costs = await many<Row>(ctx.q, 'SELECT component, provider, quantity::float AS quantity, unit, inr_milli::int AS inr_milli FROM cost_line WHERE conversation_id = $1 AND workspace_id = $2 ORDER BY created_at', [c.id, ctx.workspaceId]);
  const removed = transcriptRemovedWhy(c, (await retentionPolicy(ctx.q, ctx.workspaceId)).policy.transcripts_days);
  const rec = await recordingFor(ctx, c);
  // expiresAt is set only for a link we signed; re-sign it for an hour. An address stored on the call is passed on as it is.
  const signed = rec.url && rec.expiresAt ? recordingLink(c.id, ctx.workspaceId, { ttlS: RECORDING_TTL_S }) : null;
  const recording = signed ? { url: signed.url, expiresAt: signed.expiresAt } : rec.url ? { url: rec.url, expiresAt: null } : { url: null, why: rec.why };
  const reason = REASON_CODES.find(r => r.code === c.reason_code);
  const a = (c.analysis ?? {}) as Record<string, any>;
  const handOffs = await many<Row>(ctx.q, "SELECT mode, destination, status, brief->>'reason' AS reason FROM hand_off WHERE conversation_id = $1 AND workspace_id = $2 ORDER BY created_at", [c.id, ctx.workspaceId]);
  const base = {
    schema: CALL_SCHEMA, workspaceId: ctx.workspaceId,
    call: { id: c.id, channel: c.channel, direction: c.direction, status: c.status, startedAt: c.started_at, endedAt: c.ended_at, durationS: c.duration_s,
      endReason: c.end_reason, reasonCode: c.reason_code, reasonLabel: reason?.label ?? null, flagged: c.flagged, flags: c.flags },
    campaign: c.campaign_id ? { id: c.campaign_id, name: c.campaign_name } : null,
    agent: c.agent_id ? { id: c.agent_id, name: c.agent_name, version: Number(c.agent_version_number), versionId: c.agent_version_id } : null,
    outcome: { value: c.best_outcome, grade: c.best_grade },
    analysis: { status: a.status ?? null, summary: a.summary ?? null, points: a.points ?? [], quotes: a.quotes ?? [], followups: a.followups ?? {} },
    handOffs: handOffs.map(h => ({ mode: h.mode, destination: h.destination, status: h.status, reason: h.reason })),
    transcript: removed ? [] : (c.transcript ?? []), transcriptRemoved: removed,
    cost: { totalInrMilli: Number(c.cost_inr_milli), lines: costs },
    recording,
    runManifest: c.run_manifest,
  };
  // An erased person is never named, whatever the endpoint asked for.
  const person = (whole: boolean) => !c.contact_id || c.erased_at ? { id: c.contact_id ?? null, phone: null, name: null, language: null, erased: !!c.erased_at }
    : { id: c.contact_id, phone: whole ? c.e164 : maskPhone(c.e164), name: whole ? c.contact_name : initials(c.contact_name), language: c.contact_language ?? null, erased: false };
  return { masked: { ...base, contact: person(false) }, whole: { ...base, contact: person(true) } };
}

export function registerEvents(r: Registry) {
  r.register(tool(obj({ conversationId: uuid() }), {
    name: 'webhook.emit_call', risk: 'draft', roles: [], summary: 'Queue the call.ended record of a finished call for every webhook that listens',
    run: async (ctx, i) => {
      if (ctx.actor.type === 'member') throw new Error('only the platform emits events');
      const anyone = await one(ctx.q, "SELECT 1 FROM webhook_endpoint WHERE workspace_id = $1 AND status = 'active' LIMIT 1", [ctx.workspaceId]);
      if (!anyone) return { queued: 0, why: 'no webhook is set up' };
      const rec = await callRecord(ctx, i.conversationId);
      if (!rec) return { queued: 0, why: 'test calls and unknown calls do not emit' };
      const n = await one<{ n: number }>(ctx.q, 'SELECT vp_emit($1, $2, $3::jsonb, $4::jsonb, $5) AS n', [ctx.workspaceId, 'call.ended', JSON.stringify(rec.masked), JSON.stringify(rec.whole), i.conversationId]);
      return { queued: n!.n };
    },
  }));
}
