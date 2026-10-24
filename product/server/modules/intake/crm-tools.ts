// Contacts from a connected CRM (HubSpot lists, Zoho CRM views, Salesforce Contact and Lead list views), read only. A pull is an upload on a 'crm' source, so the
// member maps and checks it with source.map (the agent's column contract included) and saves it with source.commit, like
// a file. source.sync re-pulls and imports with the last import's mapping; source.sync.schedule turns on a timed sync
// (off by default). Consent and DND come only from fields the CRM has and the member maps; otherwise they stay unknown.
import { normaliseIndianPhone } from '../../../shared/phone.ts';
import { arr, bool, num, obj, opt, str, uuid } from '../../../shared/validate.ts';
import { appendAudit } from '../../audit.ts';
import { many, one, tx, type Queryable } from '../../db.ts';
import type { Job } from '../../jobs.ts';
import { tool, type Registry, type ToolCtx } from '../../tools.ts';
// Sanctioned data function (the same pattern as forgetContactMemory): the stored credentials, decrypted on our Queryable.
import { integrationSecretsById } from '../workspace/integrations.ts';
import { CrmBudgetError, CrmError, hubspot, recordsToRows, salesforce, zoho, type CrmClient, type CrmKind, type CrmList, type CrmMeter, type CrmRecord } from './crm.ts';
import { commitUpload, receivePart, type Converted } from './sources.ts';
import { hashWith, workspaceSalt } from './store.ts';
import { rowsToCsv } from './xlsx.ts';
import { createHash } from 'node:crypto';
import type { Mapping } from './mapping.ts';

export const MAX_CRM_RECORDS = 50_000;
const FIELD = str({ pattern: /^[A-Za-z0-9_]{1,80}$/, desc: "a CRM field's API name, e.g. hs_whatsapp_consent, Call_Consent or Call_Consent__c" });
const CRM_KINDS = ['hubspot', 'zoho_crm', 'salesforce'] as const;
const CRM_NAME: Record<CrmKind, string> = { hubspot: 'HubSpot', zoho_crm: 'Zoho CRM', salesforce: 'Salesforce' };

interface CrmConf { integrationId: string; kind: CrmKind; listId: string; listName: string; fields: string[]; consentPurpose?: string }

// ---- Salesforce API budget -----------------------------------------------------------------------
// Salesforce caps API calls per org per rolling 24 hours, and the customer's other tools share that cap. Vyakti keeps to
// its own budget per org (1,000 calls unless changed: a 50,000-record list view is about 29) and never takes the org past
// 90% of its limit as Salesforce reports it. A pull counts first and stops before passing either; nothing half-imports.
export const DEFAULT_SF_BUDGET = 1000;
const ORG_RESERVE = 0.1;

export interface ApiUse { calls: number; budget: number; usedLast24h: number; orgUsed: number | null; orgLimit: number | null }

async function budgetOf(q: Queryable, ws: string, integrationId: string) {
  const b = await one<{ daily_calls: number }>(q, 'SELECT daily_calls FROM intake_crm_budget WHERE integration_id = $1 AND workspace_id = $2', [integrationId, ws]);
  const u = await one<{ n: string; org_used: number | null; org_limit: number | null }>(q, `SELECT coalesce(sum(calls), 0) AS n,
      (SELECT org_used FROM intake_crm_api_use WHERE integration_id = $1 AND workspace_id = $2 AND org_limit IS NOT NULL ORDER BY at DESC LIMIT 1) AS org_used,
      (SELECT org_limit FROM intake_crm_api_use WHERE integration_id = $1 AND workspace_id = $2 AND org_limit IS NOT NULL ORDER BY at DESC LIMIT 1) AS org_limit
    FROM intake_crm_api_use WHERE integration_id = $1 AND workspace_id = $2 AND at > now() - interval '24 hours'`, [integrationId, ws]);
  return { budget: b?.daily_calls ?? DEFAULT_SF_BUDGET, used: Number(u?.n ?? 0), orgUsed: u?.org_used ?? null, orgLimit: u?.org_limit ?? null };
}

/** report() is everything this client spent; unrecorded() is what was spent since it was last asked (so nothing counts twice). */
interface Spend { report: () => ApiUse | null; unrecorded: () => ApiUse | null }

function meterFor(budget: number, used: number): { meter: CrmMeter } & Spend {
  let calls = 0, recorded = 0, org: { used: number; limit: number } | null = null;
  const orgCap = () => org ? Math.floor(org.limit * (1 - ORG_RESERVE)) : Infinity;
  const meter: CrmMeter = {
    take() {
      if (used + calls + 1 > budget) throw new CrmBudgetError(`Vyakti may use ${budget.toLocaleString('en-IN')} Salesforce API calls a day for this org and has used ${(used + calls).toLocaleString('en-IN')} in the last 24 hours, so the pull stopped before passing that and nothing was imported. It can run again when calls free up, or raise the budget`);
      if (org && org.used + 1 > orgCap()) throw new CrmBudgetError(`Salesforce reports ${org.used.toLocaleString('en-IN')} of this org's ${org.limit.toLocaleString('en-IN')} API calls used in the last 24 hours. Vyakti stops at 90% so the org's other tools keep working; nothing was imported`);
      calls++;
      if (org) org.used++;
    },
    org(u, l) { org = { used: u, limit: l }; },
    left() { return Math.min(budget - used - calls, orgCap() - (org?.used ?? 0)); },
  };
  const report = (): ApiUse => ({ calls, budget, usedLast24h: used + calls, orgUsed: org?.used ?? null, orgLimit: org?.limit ?? null });
  return { meter, report, unrecorded: () => { const r = { ...report(), calls: calls - recorded }; recorded = calls; return r; } };
}
const NO_SPEND: Spend = { report: () => null, unrecorded: () => null };

/** Keep what a pull spent. Called on the pool, outside any transaction, so a pull that stops still counts. */
export async function recordApiUse(q: Queryable, ws: string, integrationId: string, u: ApiUse): Promise<void> {
  if (!u.calls) return;
  await q.query('INSERT INTO intake_crm_api_use (integration_id, workspace_id, calls, org_used, org_limit) VALUES ($1,$2,$3,$4,$5)', [integrationId, ws, u.calls, u.orgUsed, u.orgLimit]);
}

interface Connected { client: CrmClient; name: string; spend: Spend }

async function clientFor(q: Queryable, ws: string, integrationId: string): Promise<Connected> {
  const row = await one<{ kind: string; name: string; config: Record<string, string> }>(q,
    "SELECT kind, name, config FROM integration WHERE id = $1 AND workspace_id = $2 AND status = 'connected'", [integrationId, ws]);
  if (!row) throw new Error('no connected integration with that id in this workspace');
  if (!(CRM_KINDS as readonly string[]).includes(row.kind)) throw new Error(`Vyakti imports contacts from HubSpot, Zoho CRM and Salesforce; "${row.name}" is not one of them`);
  const secrets = await integrationSecretsById(q, ws, integrationId);
  if (!secrets) throw new Error(`the credentials for "${row.name}" are missing; reconnect it in Settings`);
  if (row.kind === 'salesforce') {
    const b = await budgetOf(q, ws, integrationId);
    const { meter, ...spend } = meterFor(b.budget, b.used);
    return { client: salesforce(secrets as never, row.config?.instance_url || undefined, meter), name: row.name, spend };
  }
  const client = row.kind === 'hubspot' ? hubspot(secrets.access_token) : zoho(secrets as never, row.config?.datacenter ?? 'in');
  return { client, name: row.name, spend: NO_SPEND };
}

/** One CRM read, on the pool: the calls it spent are recorded whether it succeeds or stops. CRM errors become plain ones. */
async function metered<T>(pool: Queryable, ws: string, integrationId: string, spend: Spend, p: Promise<T>): Promise<T> {
  try { return await p; }
  catch (e) { throw e instanceof CrmError ? new Error(e.message) : e; }
  finally { const u = spend.unrecorded(); if (u) await recordApiUse(pool, ws, integrationId, u); }
}

/** What a pull read from the CRM, before anything is stored. */
interface Fetched { records: CrmRecord[]; truncated: boolean; unreadable: string[]; apiCalls: ApiUse | null }

/** The CRM half of a pull. It makes HTTP requests, so it runs in the kernel's prepare step (on the pool, never holding a
 *  transaction open) or, for the timed sync, before the transaction. */
async function fetchList(pool: Queryable, ws: string, conf: CrmConf, c: Connected): Promise<Fetched> {
  const r = await metered(pool, ws, conf.integrationId, c.spend, c.client.records(conf.listId, conf.fields, MAX_CRM_RECORDS));
  return { records: r.records, truncated: r.truncated, unreadable: r.unreadable ?? [], apiCalls: c.spend.report() };
}

/** The stored half: a new upload on the source. Unchanged records are skipped; a record whose number changed is listed
 *  and left out (one person per CRM record; a person decides). */
async function store(q: Queryable, ws: string, sourceId: string, conf: CrmConf, f: Fetched) {
  const { records, truncated, unreadable, apiCalls } = f;
  const known = new Map((await many<{ crm_id: string; e164_hash: string | null; crm_updated_at: string | null }>(q,
    'SELECT crm_id, e164_hash, crm_updated_at FROM intake_crm_record WHERE source_id = $1', [sourceId])).map(r => [r.crm_id, r]));
  const salt = await workspaceSalt(q, ws);
  const rows = recordsToRows(conf.kind, records, conf.fields, unreadable);
  const keep = [rows[0]];
  let unchangedSkipped = 0;
  const numberChanged: string[] = [];
  for (const r of rows.slice(1)) {
    const k = known.get(r[0]);
    const updated = r[rows[0].indexOf('Updated at')] || null;
    if (k && updated && k.crm_updated_at === updated) { unchangedSkipped++; continue; }
    const p = normaliseIndianPhone(r[3]);
    if (k?.e164_hash && p.ok && hashWith(salt, p.e164) !== k.e164_hash) { numberChanged.push(r[0]); continue; }
    keep.push(r);
  }
  const text = rowsToCsv(keep);
  const idHeader = rows[0][0];
  const converted: Converted = { from: conf.kind, integrationId: conf.integrationId, listId: conf.listId, listName: conf.listName, records: records.length,
    unchangedSkipped, numberChanged: numberChanged.slice(0, 200), truncated, fileBytes: Buffer.byteLength(text), fileSha256: createHash('sha256').update(text).digest('hex'),
    ...(unreadable.length ? { unreadable } : {}), ...(apiCalls ? { apiCalls } : {}),
    baseOverrides: { [idHeader]: { field: 'attribute', key: idHeader.toLowerCase().replace(/\s+/g, '_'), type: 'text' }, 'Other phone': { field: 'attribute', key: 'other_phone', type: 'text' }, Phone: { field: 'phone' },
      ...(rows[0].includes('Do not call') ? { 'Do not call': { field: 'opt_out' } } : {}) } };
  const up = await receivePart(q, ws, { sourceId, filename: `${conf.listName} (${CRM_NAME[conf.kind]})`, text, final: true, converted });
  await q.query('UPDATE intake_source SET last_synced_at = now(), last_sync_error = NULL WHERE id = $1', [sourceId]);
  return { uploadId: up.uploadId, sourceId, records: records.length, toImport: keep.length - 1, unchangedSkipped, numberChanged: numberChanged.length, truncated,
    unreadable, apiCalls };
}

async function crmSource(q: Queryable, ws: string, id: string) {
  const s = await one<{ id: string; kind: string; name: string; crm: CrmConf | null; sync_every_h: number | null }>(q,
    'SELECT id, kind, name, crm, sync_every_h FROM intake_source WHERE id = $1 AND workspace_id = $2', [id, ws]);
  if (!s) throw new Error('no such source in this workspace');
  if (s.kind !== 'crm' || !s.crm) throw new Error('that source is not a CRM list');
  return s as typeof s & { crm: CrmConf };
}

/** A sync's CRM half (see fetchList): the list re-read with the source's settings. */
export async function fetchSync(pool: Queryable, ws: string, sourceId: string) {
  const s = await crmSource(pool, ws, sourceId);
  const last = await one<{ mapping: Mapping }>(pool, "SELECT mapping FROM intake_upload WHERE source_id = $1 AND status = 'committed' ORDER BY committed_at DESC LIMIT 1", [sourceId]);
  if (!last?.mapping) throw new Error('import this list once first (pull, check the columns, save); a sync reuses that mapping');
  return { conf: s.crm, mapping: last.mapping, fetched: await fetchList(pool, ws, s.crm, await clientFor(pool, ws, s.crm.integrationId)) };
}

/** A sync's stored half: import with the mapping of the last import from this source. */
export async function syncSource(ctx: ToolCtx, sourceId: string, f: Awaited<ReturnType<typeof fetchSync>>) {
  const p = await store(ctx.q, ctx.workspaceId, sourceId, f.conf, f.fetched);
  const c = await commitUpload(ctx, { uploadId: p.uploadId, mapping: f.mapping, consentPurpose: f.conf.consentPurpose });
  return { ...p, receiptId: c.receiptId, counts: c.counts, issues: c.issues };
}

export function registerCrmTools(reg: Registry): void {
  reg.register(tool(obj({ integrationId: uuid() }), {
    name: 'source.crm.lists', risk: 'read', summary: 'The contact lists (HubSpot), views (Zoho CRM) or Contact and Lead list views (Salesforce) a connected CRM offers for import',
    prepare: async (ctx, i) => {
      const { client, name, spend } = await clientFor(ctx.pool, ctx.workspaceId, i.integrationId);
      return { integration: name, kind: client.kind, lists: await metered(ctx.pool, ctx.workspaceId, i.integrationId, spend, client.lists()) };
    },
    run: async (_ctx, _i, prepared) => prepared as { integration: string; kind: CrmKind; lists: CrmList[] },
  }));

  reg.register(tool(obj({ integrationId: uuid() }), {
    name: 'source.crm.budget', risk: 'read', summary: "How many Salesforce API calls Vyakti may use a day for a connected org, how many it used in the last 24 hours, and the org's own usage as Salesforce last reported it",
    run: async (ctx, i) => {
      const row = await one<{ kind: string }>(ctx.q, 'SELECT kind FROM integration WHERE id = $1 AND workspace_id = $2', [i.integrationId, ctx.workspaceId]);
      if (row?.kind !== 'salesforce') throw new Error('API budgets apply to Salesforce integrations');
      const b = await budgetOf(ctx.q, ctx.workspaceId, i.integrationId);
      return { integrationId: i.integrationId, dailyCalls: b.budget, usedLast24h: b.used, orgUsed: b.orgUsed, orgLimit: b.orgLimit, orgReservePercent: ORG_RESERVE * 100 };
    },
  }));

  reg.register(tool(obj({ integrationId: uuid(), dailyCalls: num({ int: true, min: 10, max: 100_000 }) }), {
    name: 'source.crm.budget.set', risk: 'draft',
    summary: "Set how many Salesforce API calls Vyakti may use a day for a connected org (10 to 100,000); it still never takes the org past 90% of its own limit",
    run: async (ctx, i) => {
      const row = await one<{ kind: string }>(ctx.q, 'SELECT kind FROM integration WHERE id = $1 AND workspace_id = $2', [i.integrationId, ctx.workspaceId]);
      if (row?.kind !== 'salesforce') throw new Error('API budgets apply to Salesforce integrations');
      await ctx.q.query(`INSERT INTO intake_crm_budget (integration_id, workspace_id, daily_calls) VALUES ($1,$2,$3)
        ON CONFLICT (integration_id) DO UPDATE SET daily_calls = EXCLUDED.daily_calls, updated_at = now() WHERE intake_crm_budget.workspace_id = EXCLUDED.workspace_id`, [i.integrationId, ctx.workspaceId, i.dailyCalls]);
      return { integrationId: i.integrationId, dailyCalls: i.dailyCalls };
    },
  }));

  reg.register(tool(obj({ integrationId: uuid(), listId: str({ min: 1, max: 80 }), fields: opt(arr(FIELD, { max: 30 })), sourceId: opt(uuid()) },
    'Pull one CRM list into an upload; then check it with source.map and save it with source.commit. fields adds CRM fields to read (for example a consent field).'), {
    name: 'source.crm.pull', risk: 'draft',
    summary: 'Pull the contacts of one CRM list or view into an import you can check before saving (read only: nothing is written to the CRM)',
    // The CRM is read in prepare (outside the transaction); run stores what was read.
    prepare: async (ctx, i) => {
      const c = await clientFor(ctx.pool, ctx.workspaceId, i.integrationId);
      let conf: CrmConf;
      if (i.sourceId) {
        const s = await crmSource(ctx.pool, ctx.workspaceId, i.sourceId);
        if (s.crm.integrationId !== i.integrationId || s.crm.listId !== i.listId) throw new Error('that source pulls a different list; leave sourceId out to start a new one');
        conf = { ...s.crm, fields: i.fields ?? s.crm.fields };
      } else {
        const list = (await metered(ctx.pool, ctx.workspaceId, i.integrationId, c.spend, c.client.lists())).find(l => l.id === i.listId);
        if (!list) throw new Error(`no list with id ${i.listId} in "${c.name}"`);
        conf = { integrationId: i.integrationId, kind: c.client.kind, listId: i.listId, listName: list.name, fields: i.fields ?? [] };
      }
      return { conf, name: c.name, fetched: await fetchList(ctx.pool, ctx.workspaceId, conf, c) };
    },
    run: async (ctx, i, prepared) => {
      const { conf, name, fetched } = prepared as { conf: CrmConf; name: string; fetched: Fetched };
      let sourceId = i.sourceId;
      if (sourceId) await crmSource(ctx.q, ctx.workspaceId, sourceId);
      else sourceId = (await one<{ id: string }>(ctx.q, `INSERT INTO intake_source (workspace_id, kind, name, authority, crm) VALUES ($1,'crm',$2,'crm',$3) RETURNING id`,
        [ctx.workspaceId, `${name}: ${conf.listName}`.slice(0, 120), JSON.stringify(conf)]))!.id;
      await ctx.q.query('UPDATE intake_source SET crm = $2 WHERE id = $1', [sourceId, JSON.stringify(conf)]);
      return store(ctx.q, ctx.workspaceId, sourceId!, conf, fetched);
    },
  }));

  reg.register(tool(obj({ kind: opt(str({ oneOf: CRM_KINDS })) }), {
    name: 'source.crm.sources', risk: 'read', summary: 'Lists imported from a CRM, with their sync timer, when they last synced and why a sync failed',
    run: async (ctx, i) => ({ sources: (await many<{ id: string; name: string; crm: CrmConf; sync_every_h: number | null; last_synced_at: Date | null; last_sync_error: string | null; imports: string }>(ctx.q,
      `SELECT s.id, s.name, s.crm, s.sync_every_h, s.last_synced_at, s.last_sync_error,
         (SELECT count(*) FROM intake_upload u WHERE u.source_id = s.id AND u.status = 'committed') AS imports
       FROM intake_source s WHERE s.workspace_id = $1 AND s.kind = 'crm' AND s.crm IS NOT NULL AND ($2::text IS NULL OR s.crm->>'kind' = $2)
       ORDER BY s.created_at DESC LIMIT 100`, [ctx.workspaceId, i.kind ?? null]))
      .map(s => ({ id: s.id, name: s.name, kind: s.crm.kind, listName: s.crm.listName, integrationId: s.crm.integrationId, everyHours: s.sync_every_h,
        lastSyncedAt: s.last_synced_at, lastSyncError: s.last_sync_error, imported: Number(s.imports) > 0 })) }),
  }));

  reg.register(tool(obj({ sourceId: uuid() }), {
    name: 'source.sync', risk: 'draft',
    summary: 'Re-pull a CRM list and import it with the mapping of its last import; unchanged records are skipped (read only on the CRM)',
    prepare: (ctx, i) => fetchSync(ctx.pool, ctx.workspaceId, i.sourceId),
    run: (ctx, i, prepared) => syncSource(ctx, i.sourceId, prepared as Awaited<ReturnType<typeof fetchSync>>),
  }));

  reg.register(tool(obj({ sourceId: uuid(), everyHours: opt(num({ int: true, min: 1, max: 24 })), off: opt(bool()) }), {
    name: 'source.sync.schedule', risk: 'draft',
    summary: 'Sync a CRM list on a timer (every 1, 6 or 24 hours) or turn the timer off; off unless set',
    run: async (ctx, i) => {
      await crmSource(ctx.q, ctx.workspaceId, i.sourceId);
      if (!i.off && ![1, 6, 24].includes(i.everyHours ?? 0)) throw new Error('choose every 1, 6 or 24 hours, or off');
      const every = i.off ? null : i.everyHours!;
      await ctx.q.query('UPDATE intake_source SET sync_every_h = $3 WHERE id = $1 AND workspace_id = $2', [i.sourceId, ctx.workspaceId, every]);
      return { sourceId: i.sourceId, everyHours: every };
    },
  }));
}

/** Every 15 minutes: run the timed syncs that are due. A failure is kept on the source (last_sync_error) and retried next time. */
export const crmSyncJob: Job = {
  name: 'intake.crm_sync',
  everyMs: 15 * 60_000,
  async run(deps) {
    const due = await many<{ id: string; workspace_id: string }>(deps.pool, `SELECT id, workspace_id FROM intake_source
      WHERE kind = 'crm' AND crm IS NOT NULL AND status = 'active' AND sync_every_h IS NOT NULL
        AND (last_synced_at IS NULL OR last_synced_at + make_interval(hours => sync_every_h) <= now()) ORDER BY last_synced_at NULLS FIRST LIMIT 20`);
    for (const s of due) {
      try {
        const f = await fetchSync(deps.pool, s.workspace_id, s.id);         // the CRM, outside the transaction
        await tx(deps.pool, async c => {
          const r = await syncSource({ q: c, workspaceId: s.workspace_id, actor: { type: 'system', id: 'intake.crm_sync' } }, s.id, f);
          await appendAudit(c, { workspaceId: s.workspace_id, actorType: 'system', actorId: 'intake.crm_sync', action: 'source.sync', objectType: 'intake_source', objectId: s.id,
            payload: { records: r.records, unchangedSkipped: r.unchangedSkipped, numberChanged: r.numberChanged, counts: r.counts, ...(r.apiCalls ? { apiCalls: r.apiCalls.calls } : {}) } });
        });
      } catch (e) {
        await deps.pool.query('UPDATE intake_source SET last_sync_error = $2, last_synced_at = now() WHERE id = $1', [s.id, (e instanceof Error ? e.message : String(e)).slice(0, 300)]);
      }
    }
    await deps.pool.query("DELETE FROM intake_crm_api_use WHERE at < now() - interval '7 days'");
  },
};
