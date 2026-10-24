// Contacts from a connected CRM (HubSpot lists, Zoho CRM views), read only. A pull is an upload on a 'crm' source, so the
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
import { CrmError, hubspot, recordsToRows, zoho, type CrmClient } from './crm.ts';
import { commitUpload, receivePart, type Converted } from './sources.ts';
import { hashWith, workspaceSalt } from './store.ts';
import { rowsToCsv } from './xlsx.ts';
import { createHash } from 'node:crypto';
import type { Mapping } from './mapping.ts';

export const MAX_CRM_RECORDS = 50_000;
const FIELD = str({ pattern: /^[A-Za-z0-9_]{1,80}$/, desc: "a CRM field's API name, e.g. hs_whatsapp_consent or Call_Consent" });
const CRM_KINDS = ['hubspot', 'zoho_crm'] as const;

interface CrmConf { integrationId: string; kind: 'hubspot' | 'zoho_crm'; listId: string; listName: string; fields: string[]; consentPurpose?: string }

async function clientFor(q: Queryable, ws: string, integrationId: string): Promise<{ client: CrmClient; name: string }> {
  const row = await one<{ kind: string; name: string; config: Record<string, string> }>(q,
    "SELECT kind, name, config FROM integration WHERE id = $1 AND workspace_id = $2 AND status = 'connected'", [integrationId, ws]);
  if (!row) throw new Error('no connected integration with that id in this workspace');
  if (!(CRM_KINDS as readonly string[]).includes(row.kind)) throw new Error(`Vyakti imports contacts from HubSpot and Zoho CRM; "${row.name}" is not one of them`);
  const secrets = await integrationSecretsById(q, ws, integrationId);
  if (!secrets) throw new Error(`the credentials for "${row.name}" are missing; reconnect it in Settings`);
  const client = row.kind === 'hubspot' ? hubspot(secrets.access_token) : zoho(secrets as never, row.config?.datacenter ?? 'in');
  return { client, name: row.name };
}

const crmErr = <T>(p: Promise<T>) => p.catch(e => { throw e instanceof CrmError ? new Error(e.message) : e; });

/** Pull a CRM list into a new upload on the source. Unchanged records are skipped; a record whose number changed is
 *  listed and left out (one person per CRM record; a person decides). */
async function pull(q: Queryable, ws: string, sourceId: string, conf: CrmConf) {
  const { client } = await clientFor(q, ws, conf.integrationId);
  const { records, truncated } = await crmErr(client.records(conf.listId, conf.fields, MAX_CRM_RECORDS));
  const known = new Map((await many<{ crm_id: string; e164_hash: string | null; crm_updated_at: string | null }>(q,
    'SELECT crm_id, e164_hash, crm_updated_at FROM intake_crm_record WHERE source_id = $1', [sourceId])).map(r => [r.crm_id, r]));
  const salt = await workspaceSalt(q, ws);
  const rows = recordsToRows(conf.kind, records, conf.fields);
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
    baseOverrides: { [idHeader]: { field: 'attribute', key: idHeader.toLowerCase().replace(/\s+/g, '_'), type: 'text' }, 'Other phone': { field: 'attribute', key: 'other_phone', type: 'text' }, Phone: { field: 'phone' } } };
  const up = await receivePart(q, ws, { sourceId, filename: `${conf.listName} (${conf.kind === 'hubspot' ? 'HubSpot' : 'Zoho CRM'})`, text, final: true, converted });
  await q.query('UPDATE intake_source SET last_synced_at = now(), last_sync_error = NULL WHERE id = $1', [sourceId]);
  return { uploadId: up.uploadId, sourceId, records: records.length, toImport: keep.length - 1, unchangedSkipped, numberChanged: numberChanged.length, truncated };
}

async function crmSource(q: Queryable, ws: string, id: string) {
  const s = await one<{ id: string; kind: string; name: string; crm: CrmConf | null; sync_every_h: number | null }>(q,
    'SELECT id, kind, name, crm, sync_every_h FROM intake_source WHERE id = $1 AND workspace_id = $2', [id, ws]);
  if (!s) throw new Error('no such source in this workspace');
  if (s.kind !== 'crm' || !s.crm) throw new Error('that source is not a CRM list');
  return s as typeof s & { crm: CrmConf };
}

/** Re-pull and import with the mapping of the last import from this source. */
export async function syncSource(ctx: ToolCtx, sourceId: string) {
  const s = await crmSource(ctx.q, ctx.workspaceId, sourceId);
  const last = await one<{ mapping: Mapping }>(ctx.q, "SELECT mapping FROM intake_upload WHERE source_id = $1 AND status = 'committed' ORDER BY committed_at DESC LIMIT 1", [sourceId]);
  if (!last?.mapping) throw new Error('import this list once first (pull, check the columns, save); a sync reuses that mapping');
  const p = await pull(ctx.q, ctx.workspaceId, sourceId, s.crm);
  const c = await commitUpload(ctx, { uploadId: p.uploadId, mapping: last.mapping, consentPurpose: s.crm.consentPurpose });
  return { ...p, receiptId: c.receiptId, counts: c.counts, issues: c.issues };
}

export function registerCrmTools(reg: Registry): void {
  reg.register(tool(obj({ integrationId: uuid() }), {
    name: 'source.crm.lists', risk: 'read', summary: 'The contact lists (HubSpot) or views (Zoho CRM) a connected CRM offers for import',
    run: async (ctx, i) => {
      const { client, name } = await clientFor(ctx.q, ctx.workspaceId, i.integrationId);
      return { integration: name, kind: client.kind, lists: await crmErr(client.lists()) };
    },
  }));

  reg.register(tool(obj({ integrationId: uuid(), listId: str({ min: 1, max: 80 }), fields: opt(arr(FIELD, { max: 30 })), sourceId: opt(uuid()) },
    'Pull one CRM list into an upload; then check it with source.map and save it with source.commit. fields adds CRM fields to read (for example a consent field).'), {
    name: 'source.crm.pull', risk: 'draft',
    summary: 'Pull the contacts of one CRM list or view into an import you can check before saving (read only: nothing is written to the CRM)',
    run: async (ctx, i) => {
      const { client, name } = await clientFor(ctx.q, ctx.workspaceId, i.integrationId);
      let sourceId = i.sourceId, conf: CrmConf;
      if (sourceId) {
        const s = await crmSource(ctx.q, ctx.workspaceId, sourceId);
        if (s.crm.integrationId !== i.integrationId || s.crm.listId !== i.listId) throw new Error('that source pulls a different list; leave sourceId out to start a new one');
        conf = { ...s.crm, fields: i.fields ?? s.crm.fields };
      } else {
        const list = (await crmErr(client.lists())).find(l => l.id === i.listId);
        if (!list) throw new Error(`no list with id ${i.listId} in "${name}"`);
        conf = { integrationId: i.integrationId, kind: client.kind, listId: i.listId, listName: list.name, fields: i.fields ?? [] };
        sourceId = (await one<{ id: string }>(ctx.q, `INSERT INTO intake_source (workspace_id, kind, name, authority, crm) VALUES ($1,'crm',$2,'crm',$3) RETURNING id`,
          [ctx.workspaceId, `${name}: ${list.name}`.slice(0, 120), JSON.stringify(conf)]))!.id;
      }
      await ctx.q.query('UPDATE intake_source SET crm = $2 WHERE id = $1', [sourceId, JSON.stringify(conf)]);
      return pull(ctx.q, ctx.workspaceId, sourceId!, conf);
    },
  }));

  reg.register(tool(obj({ sourceId: uuid() }), {
    name: 'source.sync', risk: 'draft',
    summary: 'Re-pull a CRM list and import it with the mapping of its last import; unchanged records are skipped (read only on the CRM)',
    run: (ctx, i) => syncSource(ctx, i.sourceId),
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
        await tx(deps.pool, async c => {
          const r = await syncSource({ q: c, workspaceId: s.workspace_id, actor: { type: 'system', id: 'intake.crm_sync' } }, s.id);
          await appendAudit(c, { workspaceId: s.workspace_id, actorType: 'system', actorId: 'intake.crm_sync', action: 'source.sync', objectType: 'intake_source', objectId: s.id,
            payload: { records: r.records, unchangedSkipped: r.unchangedSkipped, numberChanged: r.numberChanged, counts: r.counts } });
        });
      } catch (e) {
        await deps.pool.query('UPDATE intake_source SET last_sync_error = $2, last_synced_at = now() WHERE id = $1', [s.id, (e instanceof Error ? e.message : String(e)).slice(0, 300)]);
      }
    }
  },
};
