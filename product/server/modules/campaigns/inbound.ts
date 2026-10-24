// Inbound calls (must-be brief 8, the control-plane half). A workspace number is bound to a published agent version
// (inbound.route.set, policy; optionally an inbound deployment whose split then picks the version). When someone rings
// it, the carrier's relay calls POST /hooks/telephony/inbound (signed like the KYC hook with VP_TELEPHONY_WEBHOOK_SECRET):
// the caller is looked up by E.164 in the number's own workspace, a hold is taken against the wallet and the workspace
// cap only (never a campaign's), a ticket with direction 'inbound' and consent basis 'inbound' goes to the runtime, and
// the runtime's stream URL comes back for the relay to connect the leg to.
//
// They called us, so a caller who opted out or asked to be erased still reaches the agent: with no memory, and marked
// no-marketing on the ticket (she helps with what they called about; nothing is offered). An erased caller's number is
// not stored on the call. A carrier retry of the same call (same callId) gets the same answer, never a second call.
// Built against FakeTelephony; the live carrier waits on the campaigns "go".
import { createHash, randomUUID } from 'node:crypto';
import type { Deps } from '../../app.ts';
import { many, one, tx, type Queryable } from '../../db.ts';
import { HttpError, type Req, type Res } from '../../http.ts';
import { numberHash } from '../../identity.ts';
import { release, reserve } from '../../ledger.ts';
import { runtime, verify } from '../../runtime-client.ts';
import { tool, type Registry } from '../../tools.ts';
import { appendAudit } from '../../audit.ts';
import type { AgentConfig } from '../../../shared/agent-config.ts';
import { normaliseIndianPhone } from '../../../shared/phone.ts';
import type { CallTicket } from '../../../shared/runtime-protocol.ts';
import { combinationId, resolveStack } from '../../../shared/stacks.ts';
import { obj, opt, str, uuid, ValidationError } from '../../../shared/validate.ts';
import { callHoldInrMilli } from '../money/blockers.ts';
import { mayDial, transferTarget } from './allowlist.ts';
import { tombstoneHashes } from './gate.ts';
import { DEFAULT_MAX_DURATION_S, DEFAULT_PER_MINUTE_INR_MILLI } from './defaults.ts';
import { freshAttributes, memoryBrief, ticketFacts } from './worker.ts';

const SYSTEM = { type: 'system' as const, id: 'telephony.inbound' };
type Who = NonNullable<CallTicket['inbound']>['who'];
type ContactRow = { id: string; name: string | null; language: string | null; timezone: string | null; custom: Record<string, unknown> | null };

// ---- routes: which agent answers which number ----------------------------------------------------------------------
async function routeView(q: Queryable, ws: string, numberId?: string) {
  return many<{ numberId: string; e164: string; agentId: string | null; agentName: string | null; versionId: string | null; versionNumber: number | null;
    deploymentId: string | null; split: { version_id: string; percent: number }[] | null; updatedAt: Date }>(q,
    `SELECT r.number_id AS "numberId", n.e164, a.id AS "agentId", a.name AS "agentName", v.id AS "versionId", v.number AS "versionNumber",
            r.deployment_id AS "deploymentId", d.split, r.updated_at AS "updatedAt"
     FROM inbound_route r JOIN phone_number n ON n.id = r.number_id AND n.workspace_id = r.workspace_id
     LEFT JOIN agent_version v ON v.id = r.agent_version_id
     LEFT JOIN agent a ON a.id = v.agent_id AND a.workspace_id = r.workspace_id
     LEFT JOIN deployment d ON d.id = r.deployment_id AND d.workspace_id = r.workspace_id
     WHERE r.workspace_id = $1 AND ($2::uuid IS NULL OR r.number_id = $2::uuid) ORDER BY n.e164`, [ws, numberId ?? null]);
}

export function registerInboundTools(reg: Registry): void {
  reg.register(tool(obj({ numberId: uuid(), agentVersionId: uuid(), deploymentId: opt(uuid()) }), {
    name: 'inbound.route.set', risk: 'policy',
    summary: 'Answer calls to one of your numbers with a published agent version (or an inbound deployment that splits between versions)',
    describe: async (i, ctx) => {
      const n = await one<{ e164: string }>(ctx.q, 'SELECT e164 FROM phone_number WHERE id = $1 AND workspace_id = $2', [i.numberId, ctx.workspaceId]);
      const v = await one<{ name: string; number: number }>(ctx.q, `SELECT a.name, v.number FROM agent_version v JOIN agent a ON a.id = v.agent_id
        WHERE v.id = $1 AND a.workspace_id = $2`, [i.agentVersionId, ctx.workspaceId]);
      return `Answer calls to ${n?.e164 ?? 'this number'} with ${v ? `${v.name}, version ${v.number}` : 'this agent'}${i.deploymentId ? ', split as its inbound deployment says' : ''}`;
    },
    version: async (ctx, i) => (await one<{ v: string }>(ctx.q, `SELECT coalesce(max(updated_at)::text, 'none') AS v FROM inbound_route WHERE workspace_id = $1 AND number_id = $2`,
      [ctx.workspaceId, i.numberId]))!.v,
    run: async (ctx, i) => {
      const n = await one<{ status: string }>(ctx.q, 'SELECT status FROM phone_number WHERE id = $1 AND workspace_id = $2', [i.numberId, ctx.workspaceId]);
      if (!n) throw new ValidationError('numberId', 'no such number in this workspace');
      if (n.status === 'released') throw new ValidationError('numberId', 'this number has been released');
      const v = await one<{ kind: string; agent_id: string; brief: string | null }>(ctx.q, `SELECT v.kind, v.agent_id, v.config->'brief'->>'text' AS brief
        FROM agent_version v JOIN agent a ON a.id = v.agent_id WHERE v.id = $1 AND a.workspace_id = $2`, [i.agentVersionId, ctx.workspaceId]);
      if (!v) throw new ValidationError('agentVersionId', 'no such agent version in this workspace');
      if (v.kind !== 'published' || !v.brief) throw new ValidationError('agentVersionId', 'only a published version answers calls; publish the agent first');
      if (i.deploymentId) {
        const d = await one<{ binding: string; agent_id: string }>(ctx.q, 'SELECT binding, agent_id FROM deployment WHERE id = $1 AND workspace_id = $2', [i.deploymentId, ctx.workspaceId]);
        if (!d) throw new ValidationError('deploymentId', 'no such deployment in this workspace');
        if (d.binding !== 'inbound' || d.agent_id !== v.agent_id) throw new ValidationError('deploymentId', "the deployment must be this agent's inbound deployment");
      }
      await ctx.q.query(`INSERT INTO inbound_route (workspace_id, number_id, agent_version_id, deployment_id, created_by) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (number_id) DO UPDATE SET agent_version_id = $3, deployment_id = $4, updated_at = now()`,
        [ctx.workspaceId, i.numberId, i.agentVersionId, i.deploymentId ?? null, `${ctx.actor.type}:${ctx.actor.id}`]);
      return { route: (await routeView(ctx.q, ctx.workspaceId, i.numberId))[0] };
    },
  }));

  reg.register(tool(obj({ numberId: uuid() }), {
    name: 'inbound.route.clear', risk: 'policy', summary: 'Stop answering calls to one of your numbers (callers hear the carrier\'s line)',
    run: async (ctx, i) => {
      const r = await ctx.q.query('DELETE FROM inbound_route WHERE workspace_id = $1 AND number_id = $2', [ctx.workspaceId, i.numberId]);
      if (!r.rowCount) throw new ValidationError('numberId', 'that number is not answering calls');
      return { cleared: true };
    },
  }));

  reg.register(tool(obj({}), {
    name: 'inbound.route.list', risk: 'read', summary: 'Which agent answers calls to each of your numbers',
    run: async ctx => ({ routes: await routeView(ctx.q, ctx.workspaceId) }),
  }));
}

// ---- the hook --------------------------------------------------------------------------------------------------------
const inboundEvent = obj({ provider: str({ min: 1, max: 40 }), callId: str({ min: 1, max: 120 }), to: str({ min: 3, max: 40 }), from: opt(str({ max: 40 })) });

/** A plain refusal the relay can act on (it plays its own fixed line); never a stack or an env var. */
const refuse = (status: number, code: string, message: string): Res => ({ status, body: { accepted: false, code, message } });

/** The version that answers: the deployment's split when the route has one (stable per call), else the bound version. */
function pick(route: { agent_version_id: string | null; split: { version_id: string; percent: number }[] | null }, callId: string): string | null {
  if (!route.split?.length) return route.agent_version_id;
  const roll = parseInt(createHash('sha256').update(callId).digest('hex').slice(0, 8), 16) % 100;
  let acc = 0;
  for (const s of route.split) { acc += s.percent; if (roll < acc) return s.version_id; }
  return route.split[route.split.length - 1].version_id;
}

export function inboundHook(deps: Deps) {
  return async (req: Req): Promise<Res> => {
    const secret = process.env.VP_TELEPHONY_WEBHOOK_SECRET;
    if (!secret || secret.length < 32) throw new HttpError(503, 'not_configured', 'the telephony webhook is not configured');
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    const sig = req.headers['x-vp-signature'];
    if (!raw || typeof sig !== 'string' || !verify(secret, raw, sig)) throw new HttpError(401, 'bad_signature', 'the signature is missing, stale or wrong');
    let e;
    try { e = inboundEvent(JSON.parse(raw)); } catch (err) {
      throw new HttpError(err instanceof ValidationError ? 422 : 400, 'bad_body', err instanceof Error ? err.message : 'the body is not valid JSON');
    }
    const to = normaliseIndianPhone(e.to);
    if (!to.ok) return refuse(404, 'not_our_number', 'This number is not one of ours.');
    const from = normaliseIndianPhone(e.from ?? '');

    // The number decides the workspace; nothing in the body names one.
    const lines = await many<{ id: string; workspace_id: string; e164: string; status: string; carrier: string }>(deps.pool,
      "SELECT id, workspace_id, e164, status, carrier FROM phone_number WHERE e164 = $1 AND status <> 'released'", [to.e164]);
    if (!lines.length) return refuse(404, 'not_our_number', 'This number is not one of ours.');
    if (lines.length > 1) return refuse(409, 'ambiguous_number', 'This number is held by more than one workspace; nobody answers until that is fixed.');
    const line = lines[0], ws = line.workspace_id;

    // A carrier retry of the same call gets the same answer.
    const eventId = 'inbound:' + e.callId;          // telephony_event's key is shared with KYC events
    const seen = await one<{ payload: { conversationId: string; stream: unknown } }>(deps.pool, "SELECT payload FROM telephony_event WHERE provider = $1 AND event_id = $2 AND kind = 'inbound'",
      [e.provider, eventId]);
    if (seen) return { body: { accepted: true, duplicate: true, ...seen.payload } };

    if (line.status !== 'active') return refuse(409, 'number_paused', 'This number is paused, so calls to it are not answered.');
    const route = await one<{ agent_version_id: string | null; split: { version_id: string; percent: number }[] | null }>(deps.pool,
      `SELECT r.agent_version_id, d.split FROM inbound_route r LEFT JOIN deployment d ON d.id = r.deployment_id AND d.workspace_id = r.workspace_id
       WHERE r.workspace_id = $1 AND r.number_id = $2`, [ws, line.id]);
    if (!route) return refuse(409, 'not_answering', 'This number is not set up to answer calls yet.');
    const versionId = pick(route, e.callId);
    const v = versionId ? await one<{ id: string; agent_id: string; kind: string; config: { agent?: AgentConfig; brief?: CallTicket['brief'] } }>(deps.pool,
      `SELECT v.id, v.agent_id, v.kind, v.config FROM agent_version v JOIN agent a ON a.id = v.agent_id WHERE v.id = $1 AND a.workspace_id = $2`, [versionId, ws]) : null;
    if (!v || !v.config.agent || !v.config.brief?.text) return refuse(409, 'not_answering', 'The agent for this number has no published version to answer with.');
    const agent = v.config.agent;
    // The agent's hand-off number would reach the carrier on a transfer: under the telephony allowlist it must be listed.
    const bridge = transferTarget(agent);
    if (bridge && !mayDial(bridge).ok) return refuse(409, 'transfer_not_allowlisted', 'This number cannot answer right now: its agent hands calls to a number this server may not call.');

    // Who is calling, in this workspace only: erased (tombstone or erased contact), opted out, known, or unknown.
    let who: Who = 'unknown_caller';
    let contact: ContactRow | null = null;
    if (from.ok) {
      const hash = await numberHash(deps.pool, ws, from.e164);
      const tomb = await one(deps.pool, 'SELECT 1 FROM tombstone WHERE workspace_id = $1 AND e164_hash = ANY($2)', [ws, [hash, ...tombstoneHashes(ws, from.e164)]]);
      const c = tomb ? null : await one<ContactRow & { erased_at: Date | null }>(deps.pool,
        'SELECT id, name, language, timezone, custom, erased_at FROM contact WHERE workspace_id = $1 AND e164 = $2', [ws, from.e164]);
      if (tomb || c?.erased_at) who = 'erased';
      else {
        const sup = await one(deps.pool, `SELECT 1 FROM suppression WHERE workspace_id = $1 AND scope = 'workspace'
          AND (e164 = $2 OR e164_hash = $3 OR ($4::uuid IS NOT NULL AND contact_id = $4::uuid)) LIMIT 1`, [ws, from.e164, hash, c?.id ?? null]);
        contact = c ?? null;
        who = sup ? 'suppressed' : c ? 'known' : 'unknown_caller';
      }
    }
    const noMarketing = who === 'suppressed' || who === 'erased';

    // What she may know: a known caller's facts and memory; an opted-out caller's facts (service only) and no memory;
    // nothing about an erased caller.
    const d = { pool: deps.pool, registry: deps.registry };
    const mem = who === 'known' && contact ? await memoryBrief(d, ws, contact.id, v.agent_id, agent.memory?.read !== false)
      : { memoryBrief: '', memoryStatus: (who === 'suppressed' || who === 'erased' ? 'disabled' : 'none') as CallTicket['contact']['memoryStatus'] };
    const facts = contact ? ticketFacts(agent.facts ?? [], noMarketing ? 'service' : agent.category,
      {}, { ...(contact.custom ?? {}), ...(await freshAttributes(d, contact.id, (agent.facts ?? []).filter(f => f.perContact).map(f => f.key))) }) : {};

    const stack = resolveStack(agent.voice);
    const maxDurationS = agent.limits?.maxDurationS ?? DEFAULT_MAX_DURATION_S;
    // The hold, as the dial gate's G9 sizes it: the money module's rate for this stack, else the conservative ceiling.
    const quoted = await callHoldInrMilli(deps.pool, { stackId: stack.id, components: stack.components, maxDurationS }).catch(() => null);
    const hold = quoted && quoted > 0 ? quoted : Math.ceil(maxDurationS / 60) * DEFAULT_PER_MINUTE_INR_MILLI;

    const conversationId = randomUUID();
    let opened;
    try { opened = await tx(deps.pool, async c => {
      // The hold: the wallet and the workspace cap only (inbound never counts against a campaign cap).
      const r = await reserve(c, { workspaceId: ws, inrMilli: hold });   // linked to the conversation below, once it exists
      if (!r.ok) return r;
      await c.query(`INSERT INTO conversation (id, workspace_id, contact_id, agent_version_id, channel, direction, status, carrier_call_id, called_number_id, caller_e164, inbound_note)
        VALUES ($1,$2,$3,$4,'phone','inbound','live',$5,$6,$7,$8)`,
        [conversationId, ws, who === 'erased' ? null : contact?.id ?? null, v.id, e.callId, line.id, who === 'erased' || !from.ok ? null : from.e164, who]);
      await c.query('UPDATE reservation SET conversation_id = $2 WHERE id = $1', [r.reservationId, conversationId]);
      await appendAudit(c, { workspaceId: ws, actorType: 'system', actorId: SYSTEM.id, action: 'inbound.answer', objectType: 'conversation', objectId: conversationId,
        payload: { numberId: line.id, versionId: v.id, who } });
      return r;
    }); } catch (err) {
      // Two deliveries of the same call at once: the second meets the first's conversation (unique carrier call id).
      if ((err as { code?: string }).code !== '23505') throw err;
      const first = await one<{ id: string }>(deps.pool, 'SELECT id FROM conversation WHERE workspace_id = $1 AND carrier_call_id = $2', [ws, e.callId]);
      return { body: { accepted: true, duplicate: true, conversationId: first?.id ?? null, stream: null } };
    }
    if (!opened.ok) return refuse(402, opened.cause, opened.cause === 'cap_reached'
      ? 'Calls cannot be answered right now: this workspace has reached its spend cap.' : 'Calls cannot be answered right now: the wallet has no balance for them.');

    const ticket: CallTicket = {
      protocol: 1, conversationId, attemptId: null, workspaceId: ws, direction: 'inbound',
      transport: { kind: 'sip_inbound', from: who === 'erased' || !from.ok ? '' : from.e164, to: line.e164, carrierCallId: e.callId, trunk: line.carrier },
      agent, brief: v.config.brief,
      stack: { id: stack.id, combinationId: combinationId(stack, agent.voice.voiceId), components: stack.components },
      contact: { displayName: who === 'known' || who === 'suppressed' ? contact?.name ?? '' : '',
        ...(contact?.language && who !== 'erased' ? { language: contact.language as CallTicket['contact']['language'] } : {}),
        timezone: contact?.timezone ?? 'Asia/Kolkata', facts, ...mem },
      consent: { basis: 'inbound' },
      inbound: { who, noMarketing, calledNumber: line.e164 },
      limits: { maxDurationS, maxCostInrMilli: hold },
      test: false,
    };
    let reply;
    try { reply = await runtime().start(ticket); } catch (err) { reply = { accepted: false, reason: err instanceof Error ? err.message : String(err) }; }
    if (!reply.accepted) {
      await tx(deps.pool, async c => {
        const h = await one<{ id: string }>(c, "SELECT id FROM reservation WHERE conversation_id = $1 AND status = 'held'", [conversationId]);
        if (h) await release(c, h.id);
        await c.query("UPDATE conversation SET status = 'failed', end_reason = 'failed', ended_at = now() WHERE id = $1", [conversationId]);
      });
      console.warn(`[vp] inbound ${conversationId}: the voice runtime did not take the call: ${reply.reason ?? 'no reason'}`);
      return refuse(503, 'runtime_unavailable', 'Calls to this number cannot be answered right now. Please try again shortly.');
    }
    const stream = reply.join && 'url' in reply.join ? { url: reply.join.url, token: (reply.join as { token?: string }).token ?? null } : null;
    await deps.pool.query("INSERT INTO telephony_event (provider, event_id, workspace_id, kind, payload) VALUES ($1,$2,$3,'inbound',$4) ON CONFLICT DO NOTHING",
      [e.provider, eventId, ws, JSON.stringify({ conversationId, stream })]);
    return { body: { accepted: true, conversationId, stream } };
  };
}
