// Template and follow-through tools. A template is drafted (A1) and submitted to Meta (A2: its words leave Vyakti); a
// one-off template send to a person is A2; a follow-through rule is A2 (it reaches people on its own after calls),
// bound to the template's version, with its daily limit and the most it can spend a day on the card.
import { label } from '../../labels.ts';
import { many, one } from '../../db.ts';
import { tool, type Registry } from '../../tools.ts';
import { arr, num, obj, opt, str, uuid } from '../../../shared/validate.ts';
import { BLOCK_WORDS, brandDoor, gatedSend, priceMicro, type BlockReason } from './gate.ts';
import { connectionFor } from './store.ts';
import { BIND_WORDS, bindTemplate, doorOnTemplate, lintTemplate, resolved, sourceWords, submitToMeta, syncFromMeta, templateById, type TemplateRow } from './templates.ts';
import type { RuleRow } from './followthrough.ts';

const PEOPLE = ['owner', 'builder', 'operator', 'compliance'] as const;
const inr = (milli: number) => '₹' + (milli / 1000).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TRIGGERS = ['outcome', 'reason_code', 'asked_whatsapp', 'not_answered'] as const;

export function templateView(t: TemplateRow) {
  const waitingS = t.status === 'submitted' && t.submitted_at ? Math.round((Date.now() - t.submitted_at.getTime()) / 1000) : null;
  return { id: t.id, connectionId: t.connection_id, name: t.name, language: t.language, category: t.category, body: t.body,
    variables: t.variables.map((v, i) => ({ n: i + 1, source: v.source, words: sourceWords(v.source), sample: v.sample })),
    status: t.status, rejectReason: t.reject_reason, version: t.version, submittedAt: t.submitted_at, decidedAt: t.decided_at,
    waitingForReviewS: waitingS, updatedAt: t.updated_at, problems: lintTemplate(t) };
}

const triggerWords = (r: Pick<RuleRow, 'trigger_kind' | 'trigger_value'>) => r.trigger_kind === 'outcome' ? `ended with the outcome "${r.trigger_value}"`
  : r.trigger_kind === 'reason_code' ? `ended with the reason ${r.trigger_value}` : r.trigger_kind === 'asked_whatsapp' ? 'had the caller ask for it on WhatsApp'
  : 'was not answered (no answer or busy)';

export function registerFollowThroughTools(r: Registry): void {
  const variable = obj({ source: str({ min: 3, max: 70, desc: "where the value comes from: contact.name, contact.first_name, call.callback_time, brand.name, or attr:<field>" }), sample: str({ min: 1, max: 100 }) });
  r.register(tool(obj({ id: opt(uuid()), connectionId: opt(uuid()), name: str({ min: 1, max: 512 }), language: opt(str({ min: 2, max: 6 })),
    category: str({ oneOf: ['utility', 'marketing'] as const }), body: str({ min: 1, max: 1024 }), variables: opt(arr(variable, { max: 10 })) }), {
    name: 'message_template.draft', risk: 'draft', roles: [...PEOPLE],
    summary: 'Draft (or edit a draft of) a WhatsApp template: its words with {{1}}, {{2}} for values, where each value comes from, and its category (utility or marketing)',
    run: async (ctx, i) => {
      const vars = i.variables ?? [];
      const problems = lintTemplate({ name: i.name, body: i.body, category: i.category, variables: vars });
      const door = await doorOnTemplate(ctx.q, ctx.workspaceId, i.body, vars.map(v => v.sample), vars.map((v, n) => ({ key: 'v' + (n + 1), value: v.sample, purpose: 'service', source: 'sample', perContact: true }) as never), i.category as 'utility' | 'marketing');
      if (door.blocked) problems.push('the safety check stops it: ' + door.verdicts.filter(v => v.verdict.action !== 'pass').map(v => 'reason' in v.verdict ? v.verdict.reason : '').join('; '));
      if (i.id) {
        const t = await templateById(ctx.q, ctx.workspaceId, i.id, true);
        if (!t) throw new Error('no such template in this workspace');
        if (!['draft', 'rejected'].includes(t.status)) throw new Error(`this template is ${t.status} with WhatsApp; draft a new one (a new name) to change its words`);
        await ctx.q.query(`UPDATE channel_template SET name = $3, language = $4, category = $5, body = $6, variables = $7, status = 'draft', version = version + 1, updated_at = now()
          WHERE id = $1 AND workspace_id = $2`, [t.id, ctx.workspaceId, i.name, i.language ?? t.language, i.category, i.body, JSON.stringify(vars)]);
        return { ...templateView((await templateById(ctx.q, ctx.workspaceId, t.id))!), problems };
      }
      const conn = await connectionFor(ctx.q, ctx.workspaceId, i.connectionId);
      if (!conn) throw new Error('connect a WhatsApp number first (Settings > Channels)');
      try {
        const row = await one<{ id: string }>(ctx.q, `INSERT INTO channel_template (workspace_id, connection_id, name, language, category, body, variables)
          VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [ctx.workspaceId, conn.id, i.name, i.language ?? 'en', i.category, i.body, JSON.stringify(vars)]);
        return { ...templateView((await templateById(ctx.q, ctx.workspaceId, row!.id))!), problems };
      } catch (e) {
        if ((e as { code?: string }).code === '23505') throw new Error(`a template named "${i.name}" in this language already exists on this number`);
        if ((e as { code?: string }).code === '23514') throw new Error('the name may use only lower-case letters, digits and underscores, and the language looks like en or hi or en_US');
        throw e;
      }
    },
  }));

  r.register(tool(obj({ templateId: uuid() }), {
    name: 'message_template.submit', risk: 'external', roles: ['owner', 'builder', 'operator'],
    summary: "Submit a drafted WhatsApp template to Meta for review; it can be sent once Meta approves it",
    describe: async (i, ctx) => {
      const t = await templateById(ctx.q, ctx.workspaceId, i.templateId);
      return t ? `Submit the ${t.category} template "${t.name}" to Meta for review: "${t.body.length > 160 ? t.body.slice(0, 157) + '...' : t.body}"` : 'Submit this template to Meta for review';
    },
    version: async (ctx, i) => { const t = await templateById(ctx.q, ctx.workspaceId, i.templateId); return t ? `${t.id}:${t.version}:${t.status}` : null; },
    prepare: async (ctx, i) => submitToMeta(ctx.pool, ctx.workspaceId, i.templateId),
    run: async (ctx, i, p) => {
      const s = p as Awaited<ReturnType<typeof submitToMeta>>;
      await ctx.q.query(`UPDATE channel_template SET status = 'submitted', provider_template_id = $3, submitted_at = now(), reject_reason = NULL, decided_at = NULL,
        category = CASE WHEN $4 IN ('utility','marketing') THEN $4 ELSE category END, updated_at = now() WHERE id = $1 AND workspace_id = $2`,
        [i.templateId, ctx.workspaceId, s.providerTemplateId, s.category]);
      const t = await templateById(ctx.q, ctx.workspaceId, i.templateId);
      return { ...templateView(t!), note: s.category && s.category !== t!.category ? `Meta filed it as ${s.category}` : undefined };
    },
  }));

  r.register(tool(obj({ connectionId: opt(uuid()) }), {
    name: 'message_template.sync', risk: 'draft', roles: [...PEOPLE], summary: "Ask Meta for the review status of submitted templates (approved, rejected with its reason, paused)",
    prepare: async (ctx, i) => {
      const conn = await connectionFor(ctx.pool, ctx.workspaceId, i.connectionId);
      return conn ? syncFromMeta(ctx.pool, ctx.workspaceId, conn) : { checked: 0, changed: 0 };
    },
    run: async (_ctx, _i, p) => p,
  }));

  r.register(tool(obj({ status: opt(str({ oneOf: ['draft', 'submitted', 'approved', 'rejected', 'paused', 'disabled'] as const })) }), {
    name: 'message_template.list', risk: 'read', summary: 'WhatsApp templates with their review status, how long each has waited for Meta, and the price of one message',
    run: async (ctx, i) => {
      const rows = await many<TemplateRow>(ctx.q, `SELECT * FROM channel_template WHERE workspace_id = $1 AND ($2::text IS NULL OR status = $2) ORDER BY updated_at DESC`, [ctx.workspaceId, i.status ?? null]);
      const price = { utility: Math.ceil(await priceMicro(ctx.q, 'utility') / 1000), marketing: Math.ceil(await priceMicro(ctx.q, 'marketing') / 1000) };
      return { templates: rows.map(t => ({ ...templateView(t), priceInrMilli: price[t.category] })) };
    },
  }));

  r.register(tool(obj({ id: uuid() }), {
    name: 'message_template.get', risk: 'read', summary: 'One WhatsApp template: its words, values and where they come from, review status, and what was sent with it',
    run: async (ctx, i) => {
      const t = await templateById(ctx.q, ctx.workspaceId, i.id);
      if (!t) throw new Error('no such template in this workspace');
      const n = await one<{ sent: string; blocked: string }>(ctx.q, `SELECT count(*) FILTER (WHERE status NOT IN ('blocked'))::text AS sent, count(*) FILTER (WHERE status = 'blocked')::text AS blocked
        FROM channel_message WHERE workspace_id = $1 AND template_id = $2`, [ctx.workspaceId, t.id]);
      return { ...templateView(t), sent: Number(n?.sent ?? 0), blocked: Number(n?.blocked ?? 0) };
    },
  }));

  r.register(tool(obj({ templateId: uuid(), contactId: uuid(), purpose: opt(str({ min: 2, max: 80 })) }), {
    name: 'message_template.send', risk: 'external', roles: [...PEOPLE],
    summary: "Send an approved WhatsApp template to one person, its values filled from their record; every channel rule and the wallet are checked first",
    describe: async (i, ctx) => {
      const t = await templateById(ctx.q, ctx.workspaceId, i.templateId);
      return `Send the WhatsApp template "${t?.name ?? 'this template'}" to ${await label(ctx, 'contact', i.contactId)}${t ? `, up to ${inr(Math.ceil(await priceMicro(ctx.q, t.category) / 1000))}` : ''}`;
    },
    version: async (ctx, i) => { const t = await templateById(ctx.q, ctx.workspaceId, i.templateId); return t ? `${t.id}:${t.version}:${t.status}` : null; },
    prepare: async (ctx, i) => {
      const t = await templateById(ctx.pool, ctx.workspaceId, i.templateId);
      if (!t) throw new Error('no such template in this workspace');
      const b = await bindTemplate(ctx.pool, ctx.workspaceId, t, { contactId: i.contactId });
      if (!b.ok) return { messageId: null, status: 'blocked', reasons: b.reasons, missing: b.missing, body: t.body, costInrMilli: 0 };
      const door = { ...(await brandDoor(ctx.pool, ctx.workspaceId)), facts: b.facts };
      return gatedSend(ctx.pool, ctx.workspaceId, { to: { contactId: i.contactId }, content: { kind: 'template', template: resolved(t), params: b.params },
        purpose: i.purpose ?? 'follow_up', author: ctx.actor.id ? { kind: 'system', what: 'member:' + ctx.actor.id, door } : { kind: 'system', what: ctx.actor.type, door } });
    },
    run: async (_ctx, _i, p) => {
      const s = p as { reasons: string[] };
      return { ...s, reasons: s.reasons.map(x => ({ code: x, words: BLOCK_WORDS[x as BlockReason] ?? BIND_WORDS[x as keyof typeof BIND_WORDS] ?? x })) };
    },
  }));

  r.register(tool(obj({}), {
    name: 'channel.readiness', risk: 'read',
    summary: "What stands between WhatsApp and sending: the number's webhook handshake, templates waiting for Meta's review (with how long), rules whose template is not approved, and whether sending is switched on",
    run: async ctx => {
      const items: { kind: string; ok: boolean; title: string; detail: string; since: Date | null; waitingS: number | null; overdue: boolean; fix: string | null }[] = [];
      const conns = await many<{ id: string; name: string; status: string; webhook_verified_at: Date | null; created_at: Date; agent_id: string | null }>(ctx.q,
        "SELECT id, name, status, webhook_verified_at, created_at, agent_id FROM channel_connection WHERE workspace_id = $1 AND status <> 'disconnected' ORDER BY created_at", [ctx.workspaceId]);
      const secs = (d: Date) => Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
      if (!conns.length) items.push({ kind: 'number', ok: false, title: 'No WhatsApp number connected', detail: 'Add the WhatsApp Cloud API credentials in Integrations, then connect the number here.', since: null, waitingS: null, overdue: false, fix: '/settings/integrations' });
      for (const c of conns) {
        items.push({ kind: 'webhook', ok: !!c.webhook_verified_at, title: `"${c.name}": webhook`, since: c.webhook_verified_at ?? c.created_at,
          detail: c.webhook_verified_at ? 'Meta confirmed the webhook address and verify token.' : 'Waiting for Meta to call the webhook address with the verify token (set it in the Meta app dashboard).',
          waitingS: c.webhook_verified_at ? null : secs(c.created_at), overdue: false, fix: null });
        if (c.status === 'paused') items.push({ kind: 'paused', ok: false, title: `"${c.name}" is paused`, detail: 'Nothing is sent from it until it is resumed.', since: null, waitingS: null, overdue: false, fix: null });
      }
      const tpls = await many<TemplateRow>(ctx.q, "SELECT * FROM channel_template WHERE workspace_id = $1 AND status IN ('submitted','rejected','paused') ORDER BY submitted_at", [ctx.workspaceId]);
      for (const t of tpls) {
        const waited = t.status === 'submitted' && t.submitted_at ? secs(t.submitted_at) : null;
        items.push({ kind: 'template', ok: false, title: `Template "${t.name}": ${t.status === 'submitted' ? 'in review with Meta' : t.status}`, since: t.submitted_at,
          detail: t.status === 'submitted' ? 'Meta usually decides within 24 hours. It can be sent once approved.' : t.status === 'rejected' ? `Meta rejected it${t.reject_reason ? ' (' + t.reject_reason.replace(/_/g, ' ').toLowerCase() + ')' : ''}. Edit it and submit again.` : 'Meta paused it after people reported or blocked it; it cannot be sent until Meta lifts the pause.',
          waitingS: waited, overdue: waited != null && waited > 24 * 3600, fix: null });
      }
      const rules = await many<{ name: string; status: string }>(ctx.q, `SELECT f.name, t.status FROM channel_followthrough f JOIN channel_template t ON t.id = f.template_id
        WHERE f.workspace_id = $1 AND f.enabled AND t.status <> 'approved'`, [ctx.workspaceId]);
      for (const x of rules) items.push({ kind: 'rule', ok: false, title: `Follow-up "${x.name}" is waiting`, detail: `Its template is ${x.status}; it sends nothing until the template is approved.`, since: null, waitingS: null, overdue: false, fix: null });
      const live = process.env.VP_WHATSAPP_LIVE === '1';
      items.push({ kind: 'sending', ok: live, title: live ? 'Sending to WhatsApp is on' : 'Sending to WhatsApp is not switched on', since: null, waitingS: null, overdue: false, fix: null,
        detail: live ? 'Messages that pass every check are sent to Meta.' : 'This deployment does not send to Meta yet. Messages that pass every check are stored as not sent, with this reason.' });
      return { ready: items.every(i => i.ok), items };
    },
  }));

  // ---- follow-through rules ----
  const ruleInput = obj({ id: opt(uuid()), name: str({ min: 2, max: 80 }), templateId: uuid(), trigger: str({ oneOf: TRIGGERS }), value: opt(str({ min: 1, max: 80 })),
    agentId: opt(uuid()), campaignId: opt(uuid()), purpose: opt(str({ min: 2, max: 80 })), dailyLimit: opt(num({ int: true, min: 1, max: 100_000 })) });
  r.register(tool(ruleInput, {
    name: 'followthrough.rule.set', risk: 'external', roles: ['owner', 'builder', 'operator'],
    summary: 'After calls: send an approved utility WhatsApp template when a call ends with an outcome, a reason code or a request for WhatsApp, or when a campaign attempt is not answered; only to people who opted in',
    describe: async (i, ctx) => {
      const t = await templateById(ctx.q, ctx.workspaceId, i.templateId);
      const scope = i.campaignId ? `a call of ${await label(ctx, 'campaign', i.campaignId)}` : i.agentId ? `a call of ${await label(ctx, 'agent', i.agentId)}` : 'any call';
      const per = t ? Math.ceil(await priceMicro(ctx.q, t.category) / 1000) : 0;
      const lim = i.dailyLimit ?? 200;
      return `When ${scope} ${triggerWords({ trigger_kind: i.trigger as RuleRow["trigger_kind"], trigger_value: i.value ?? null })}, send the WhatsApp template "${t?.name ?? 'this template'}" to people who opted in on WhatsApp; at most ${lim.toLocaleString('en-IN')} a day, up to ${inr(per * lim)} a day`;
    },
    version: async (ctx, i) => {
      const t = await templateById(ctx.q, ctx.workspaceId, i.templateId);
      const rule = i.id ? await one<{ version: number }>(ctx.q, 'SELECT version FROM channel_followthrough WHERE id = $1 AND workspace_id = $2', [i.id, ctx.workspaceId]) : null;
      return t ? `${t.id}:${t.version}:${t.status}:${rule?.version ?? 0}` : null;
    },
    run: async (ctx, i) => {
      const t = await templateById(ctx.q, ctx.workspaceId, i.templateId);
      if (!t) throw new Error('no such template in this workspace');
      if (t.category !== 'utility') throw new Error('follow-through sends only utility templates (a summary, a link, a callback time); marketing needs its own opt-in');
      if (t.status !== 'approved') throw new Error(`the template is ${t.status}; it can be used once WhatsApp approves it`);
      if ((i.trigger === 'outcome' || i.trigger === 'reason_code') && !i.value) throw new Error(`a ${i.trigger.replace('_', ' ')} rule needs the value it waits for`);
      if (i.trigger === 'not_answered' && !i.campaignId) throw new Error('an "if not answered" rule belongs to a campaign: give campaignId');
      if (i.agentId && !(await one(ctx.q, 'SELECT 1 FROM agent WHERE id = $1 AND workspace_id = $2', [i.agentId, ctx.workspaceId]))) throw new Error('no such agent in this workspace');
      if (i.campaignId && !(await one(ctx.q, 'SELECT 1 FROM campaign WHERE id = $1 AND workspace_id = $2', [i.campaignId, ctx.workspaceId]))) throw new Error('no such campaign in this workspace');
      const vals = [ctx.workspaceId, i.name, t.id, i.agentId ?? null, i.campaignId ?? null, i.trigger, i.trigger === 'outcome' || i.trigger === 'reason_code' ? i.value : null,
        i.purpose ?? 'follow_up', i.dailyLimit ?? 200, `${ctx.actor.type}:${ctx.actor.id ?? ''}`];
      if (i.id) {
        const u = await one<{ id: string }>(ctx.q, `UPDATE channel_followthrough SET name = $2, template_id = $3, agent_id = $4, campaign_id = $5, trigger_kind = $6, trigger_value = $7,
          purpose = $8, daily_limit = $9, created_by = $10, enabled = true, version = version + 1, updated_at = now() WHERE id = $11 AND workspace_id = $1 RETURNING id`, [...vals, i.id]);
        if (!u) throw new Error('no such follow-through rule in this workspace');
        return { ruleId: u.id };
      }
      const row = await one<{ id: string }>(ctx.q, `INSERT INTO channel_followthrough (workspace_id, name, template_id, agent_id, campaign_id, trigger_kind, trigger_value, purpose, daily_limit, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, vals);
      return { ruleId: row!.id };
    },
  }));

  r.register(tool(obj({ ruleId: uuid() }), {
    // Turning a rule off only stops sends, so it never waits for approval; turning it on again is followthrough.rule.set.
    name: 'followthrough.rule.disable', risk: 'draft', roles: [...PEOPLE], summary: 'Turn a follow-through rule off: nothing more is sent by it (sent messages stay on the timeline)',
    run: async (ctx, i) => ({ disabled: ((await ctx.q.query('UPDATE channel_followthrough SET enabled = false, updated_at = now() WHERE id = $1 AND workspace_id = $2 AND enabled', [i.ruleId, ctx.workspaceId])).rowCount ?? 0) > 0 }),
  }));

  r.register(tool(obj({}), {
    name: 'followthrough.rule.list', risk: 'read', summary: 'Follow-through rules: what each waits for, its template and status, and what it did in the last 24 hours',
    run: async ctx => {
      const rows = await many<RuleRow & { template_name: string; template_status: string; sent: string; blocked: string; skipped: string }>(ctx.q,
        `SELECT f.*, t.name AS template_name, t.status AS template_status,
           (SELECT count(*) FROM channel_followthrough_run x WHERE x.rule_id = f.id AND x.result = 'sent' AND x.created_at > now() - interval '24 hours')::text AS sent,
           (SELECT count(*) FROM channel_followthrough_run x WHERE x.rule_id = f.id AND x.result LIKE 'blocked:%' AND x.created_at > now() - interval '24 hours')::text AS blocked,
           (SELECT count(*) FROM channel_followthrough_run x WHERE x.rule_id = f.id AND x.result LIKE 'skipped:%' AND x.created_at > now() - interval '24 hours')::text AS skipped
         FROM channel_followthrough f JOIN channel_template t ON t.id = f.template_id WHERE f.workspace_id = $1 ORDER BY f.created_at`, [ctx.workspaceId]);
      return { rules: rows.map(x => ({ id: x.id, name: x.name, templateId: x.template_id, templateName: x.template_name, templateStatus: x.template_status,
        agentId: x.agent_id, campaignId: x.campaign_id, trigger: x.trigger_kind, value: x.trigger_value, when: triggerWords(x), purpose: x.purpose, dailyLimit: x.daily_limit,
        enabled: x.enabled, version: x.version, last24h: { sent: Number(x.sent), blocked: Number(x.blocked), skipped: Number(x.skipped) } })) };
    },
  }));

  r.register(tool(obj({ ruleId: opt(uuid()), limit: opt(num({ int: true, min: 1, max: 200 })) }), {
    name: 'followthrough.runs', risk: 'read', summary: 'What follow-through did after recent calls: sent, or why not (each reason in words)',
    run: async (ctx, i) => {
      const rows = await many<{ rule_id: string; source_key: string; contact_id: string | null; message_id: string | null; result: string; created_at: Date }>(ctx.q,
        `SELECT rule_id, source_key, contact_id, message_id, result, created_at FROM channel_followthrough_run WHERE workspace_id = $1 AND ($2::uuid IS NULL OR rule_id = $2)
          ORDER BY created_at DESC LIMIT $3`, [ctx.workspaceId, i.ruleId ?? null, i.limit ?? 50]);
      return { runs: rows.map(x => {
        const [kind, rest] = x.result.split(':');
        const reasons = kind === 'blocked' || kind === 'skipped' ? (rest ?? '').split(',').filter(Boolean) : [];
        return { ruleId: x.rule_id, callId: x.source_key.startsWith('call:') ? x.source_key.slice(5) : null, attemptId: x.source_key.startsWith('attempt:') ? x.source_key.slice(8) : null,
          contactId: x.contact_id, messageId: x.message_id, result: kind, at: x.created_at,
          reasons: reasons.map(c => ({ code: c, words: BLOCK_WORDS[c as BlockReason] ?? BIND_WORDS[c as keyof typeof BIND_WORDS] ?? (c === 'daily_limit' ? "The rule's daily limit was reached" : c) })) };
      }) };
    },
  }));
}
