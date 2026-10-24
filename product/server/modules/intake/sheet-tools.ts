// Google Sheets as a live source: a tab read through the workspace's service account, or a published CSV link. A sheet is a
// 'sheet' source whose text goes through the ordinary upload, preview, receipt and write path; source.sync re-reads it with the
// last import's mapping and source.sync.schedule puts it on a timer (crm-tools.ts). Rows dedupe on the number, as a file.
// Reads run in the kernel's prepare step (outside the transaction). Read only: nothing is written to a sheet.
import { createHash } from 'node:crypto';
import { obj, opt, str, uuid } from '../../../shared/validate.ts';
import { one, type Queryable } from '../../db.ts';
import { tool, type Registry } from '../../tools.ts';
// Sanctioned data function: the stored service account, decrypted on our Queryable (workspace's vault).
import { integrationSecretsById } from '../workspace/integrations.ts';
import { CrmError } from './crm.ts';
import type { CrmConf } from './crm-tools.ts';
import { fetchCsvLink, serviceAccount, sheetsClient, spreadsheetId } from './sheets.ts';
import { receivePart } from './sources.ts';
import { rowsToCsv } from './xlsx.ts';

const plain = <T>(p: Promise<T>) => p.catch(e => { throw e instanceof CrmError ? new Error(e.message) : e; });

async function clientFor(q: Queryable, ws: string, integrationId: string) {
  const row = await one<{ kind: string; name: string }>(q, "SELECT kind, name FROM integration WHERE id = $1 AND workspace_id = $2 AND status = 'connected'", [integrationId, ws]);
  if (!row) throw new Error('no connected integration with that id in this workspace');
  if (row.kind !== 'google_workspace') throw new Error(`"${row.name}" is not a Google service account; connect "Google Sheets and Calendar" in Settings`);
  const secrets = await integrationSecretsById(q, ws, integrationId);
  if (!secrets?.service_account_json) throw new Error(`the credentials for "${row.name}" are missing; reconnect it in Settings`);
  return { client: sheetsClient(serviceAccount(secrets.service_account_json)), name: row.name };
}

/** A sheet's current text (CSV), from its tab or its published link. */
export async function readSheet(q: Queryable, ws: string, conf: CrmConf): Promise<string> {
  if (conf.csvUrl) return plain(fetchCsvLink(conf.csvUrl));
  const { client } = await clientFor(q, ws, conf.integrationId);
  return rowsToCsv(await plain(client.rows(conf.spreadsheetId!, conf.listId)));
}

/** The text as a new upload on the sheet source. */
export async function storeSheet(q: Queryable, ws: string, sourceId: string, conf: CrmConf, text: string) {
  const up = await receivePart(q, ws, { sourceId, filename: `${conf.listName} (Google Sheets)`, text, final: true });
  await q.query('UPDATE intake_source SET last_synced_at = now(), last_sync_error = NULL WHERE id = $1', [sourceId]);
  const records = Math.max(0, text.split('\n').filter(l => l.trim()).length - 1);
  return { uploadId: up.uploadId, sourceId, records, toImport: records, unchangedSkipped: 0, numberChanged: 0, truncated: false, unreadable: [] as string[], apiCalls: null };
}

export function registerSheetTools(reg: Registry): void {
  reg.register(tool(obj({ integrationId: uuid(), spreadsheet: str({ min: 20, max: 300, desc: "the sheet's address (docs.google.com/spreadsheets/d/…) or its id" }) }), {
    name: 'source.sheet.tabs', risk: 'read', summary: 'The tabs of a Google Sheet shared with the workspace\'s service account',
    prepare: async (ctx, i) => {
      const { client } = await clientFor(ctx.pool, ctx.workspaceId, i.integrationId);
      const id = spreadsheetId(i.spreadsheet);
      return { spreadsheetId: id, ...(await plain(client.tabs(id))) };
    },
    run: async (_ctx, _i, prepared) => prepared as { spreadsheetId: string; title: string; tabs: { id: string; name: string; size: number | null }[] },
  }));

  reg.register(tool(obj({ integrationId: opt(uuid()), spreadsheet: opt(str({ min: 20, max: 300 })), tab: opt(str({ min: 1, max: 100 })), csvUrl: opt(str({ min: 20, max: 500 })), sourceId: opt(uuid()) },
    'Either integrationId + spreadsheet + tab (a sheet shared with the service account), or csvUrl (File > Share > Publish to the web, CSV). Then check it with source.map and save it with source.commit.'), {
    name: 'source.sheet.pull', risk: 'draft',
    summary: 'Read a Google Sheet tab (or its published CSV link) into an import you can check before saving; a sync re-reads it later (read only)',
    prepare: async (ctx, i) => {
      let conf: CrmConf;
      if (i.sourceId) {
        const s = await one<{ kind: string; crm: CrmConf | null }>(ctx.pool, 'SELECT kind, crm FROM intake_source WHERE id = $1 AND workspace_id = $2', [i.sourceId, ctx.workspaceId]);
        if (!s || s.kind !== 'sheet' || s.crm?.kind !== 'google_sheets') throw new Error('that source is not a Google Sheet');
        conf = s.crm;
      } else if (i.csvUrl && !i.integrationId) {
        conf = { integrationId: '', kind: 'google_sheets', csvUrl: i.csvUrl, listId: createHash('sha256').update(i.csvUrl).digest('hex').slice(0, 16), listName: 'Published sheet', fields: [] };
      } else if (i.integrationId && i.spreadsheet && i.tab && !i.csvUrl) {
        const { client } = await clientFor(ctx.pool, ctx.workspaceId, i.integrationId);
        const id = spreadsheetId(i.spreadsheet);
        const meta = await plain(client.tabs(id));
        if (!meta.tabs.some(t => t.name === i.tab)) throw new Error(`no tab "${i.tab}" in "${meta.title}" (tabs: ${meta.tabs.map(t => t.name).join(', ')})`);
        conf = { integrationId: i.integrationId, kind: 'google_sheets', spreadsheetId: id, listId: i.tab, listName: `${meta.title}: ${i.tab}`, fields: [] };
      } else throw new Error('give either a published CSV link (csvUrl), or a service account with the sheet and its tab (integrationId, spreadsheet, tab)');
      return { conf, text: await readSheet(ctx.pool, ctx.workspaceId, conf) };
    },
    run: async (ctx, i, prepared) => {
      const { conf, text } = prepared as { conf: CrmConf; text: string };
      const sourceId = i.sourceId ?? (await one<{ id: string }>(ctx.q, `INSERT INTO intake_source (workspace_id, kind, name, authority, crm) VALUES ($1,'sheet',$2,'upload',$3) RETURNING id`,
        [ctx.workspaceId, `Google Sheets: ${conf.listName}`.slice(0, 120), JSON.stringify(conf)]))!.id;
      return storeSheet(ctx.q, ctx.workspaceId, sourceId, conf, text);
    },
  }));
}
