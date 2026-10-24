// Integrations: a generic registry of kinds. Credentials are staged encrypted (integration.stage_secrets), then
// integration.connect moves them into the integration row, still encrypted. The kernel keeps an approved
// action's args and result in plain JSON, so a secret must never be an argument of an approval-gated tool.
import { label } from '../../labels.ts';
import type { Queryable } from '../../db.ts';
import type { Registry } from '../../tools.ts';
import { tool } from '../../tools.ts';
import { many, one } from '../../db.ts';
import { obj, opt, record, str, uuid } from '../../../shared/validate.ts';
import { open, seal } from './crypto.ts';
import { STASH_TTL_MS } from './common.ts';

// `usedBy` says what reads the stored credentials today. A kind without it is stored, and nothing uses it yet.
export interface Kind { label: string; secrets: readonly string[]; config: readonly string[]; usedBy?: string }
export const INTEGRATION_KINDS: Record<string, Kind> = {
  hubspot: { label: 'HubSpot CRM', secrets: ['access_token'], config: ['portal_id'] },
  zoho_crm: { label: 'Zoho CRM', secrets: ['client_id', 'client_secret', 'refresh_token'], config: ['datacenter'] },
  salesforce: { label: 'Salesforce', secrets: ['client_id', 'client_secret', 'refresh_token'], config: ['instance_url'] },
  google_workspace: { label: 'Google Sheets and Calendar', secrets: ['service_account_json'], config: ['calendar_id', 'sheet_id'] },
  whatsapp_cloud: { label: 'WhatsApp Cloud API', secrets: ['access_token'], config: ['phone_number_id'] },
  exotel: { label: 'Exotel', secrets: ['api_key', 'api_token'], config: ['account_sid', 'subdomain'] },
  slack: { label: 'Slack', secrets: ['webhook_url'], config: [], usedBy: 'Notifications post alerts to its channel' },
  // Slack is read by notifications (notifications.ts): its incoming-webhook address must be on hooks.slack.com.
  custom_http: { label: 'Your own HTTP service', secrets: ['bearer_token'], config: ['base_url'],
    usedBy: 'Webhooks on its base address send its bearer token with every event' },
};

const kind = str({ oneOf: Object.keys(INTEGRATION_KINDS) });

/** Slack incoming webhooks live on hooks.slack.com. VP_SLACK_WEBHOOK_BASE replaces that base (tests, a private proxy). */
export function slackBase(env: NodeJS.ProcessEnv = process.env): string { return (env.VP_SLACK_WEBHOOK_BASE || 'https://hooks.slack.com/').replace(/\/?$/, '/'); }
export function slackUrlAllowed(raw: string, env: NodeJS.ProcessEnv = process.env): boolean {
  let u: URL, b: URL;
  try { u = new URL(raw); b = new URL(slackBase(env)); } catch { return false; }
  return u.origin === b.origin && u.pathname.startsWith(b.pathname) && !u.username && !u.password && (u.protocol === 'https:' || !!env.VP_SLACK_WEBHOOK_BASE);
}

export async function integrationSecrets(q: Queryable, workspaceId: string, name: string): Promise<Record<string, string> | null> {
  const row = await one<{ secret_ciphertext: string | null }>(q, "SELECT secret_ciphertext FROM integration WHERE workspace_id = $1 AND name = $2 AND status = 'connected'", [workspaceId, name]);
  return row?.secret_ciphertext ? JSON.parse(open(workspaceId, 'integration', row.secret_ciphertext)) : null;
}

export async function integrationSecretsById(q: Queryable, workspaceId: string, id: string): Promise<Record<string, string> | null> {
  const row = await one<{ secret_ciphertext: string | null }>(q, "SELECT secret_ciphertext FROM integration WHERE workspace_id = $1 AND id = $2 AND status = 'connected'", [workspaceId, id]);
  return row?.secret_ciphertext ? JSON.parse(open(workspaceId, 'integration', row.secret_ciphertext)) : null;
}

export function registerIntegrations(r: Registry) {
  r.register(tool(obj({}), {
    name: 'integration.kinds', risk: 'read', summary: 'List the kinds of integration that can be connected and what each needs',
    run: async () => ({ kinds: Object.entries(INTEGRATION_KINDS).map(([id, k]) => ({ id, label: k.label, secrets: k.secrets, config: k.config, usedBy: k.usedBy ?? null })) }),
  }));

  r.register(tool(obj({ kind, secrets: record(str({ min: 1, max: 8000 }), { maxKeys: 10 }) }), {
    name: 'integration.stage_secrets', risk: 'draft', summary: 'Hand over credentials for an integration; they are encrypted and held until you connect it',
    run: async (ctx, i) => {
      const k = INTEGRATION_KINDS[i.kind];
      const missing = k.secrets.filter(s => !(s in i.secrets)), extra = Object.keys(i.secrets).filter(s => !k.secrets.includes(s));
      if (missing.length || extra.length) throw new Error(`${k.label} needs exactly: ${k.secrets.join(', ')}${missing.length ? `; missing ${missing.join(', ')}` : ''}${extra.length ? `; not expected: ${extra.join(', ')}` : ''}`);
      if (i.kind === 'slack' && !slackUrlAllowed(i.secrets.webhook_url)) throw new Error(`a Slack incoming-webhook address starts with ${slackBase()}; alerts are sent nowhere else`);
      await ctx.q.query("DELETE FROM secret_box WHERE workspace_id = $1 AND expires_at < now()", [ctx.workspaceId]);
      const row = await one<{ id: string }>(ctx.q,
        `INSERT INTO secret_box (workspace_id, purpose, ciphertext, meta, expires_at) VALUES ($1,'stash',$2,$3, now() + ($4 || ' milliseconds')::interval) RETURNING id`,
        [ctx.workspaceId, seal(ctx.workspaceId, 'stash', JSON.stringify(i.secrets)), { kind: i.kind }, String(STASH_TTL_MS)]);
      return { stashId: row!.id, kind: i.kind, keys: Object.keys(i.secrets), note: 'Now connect it with integration.connect and this stashId. The values cannot be read back.' };
    },
  }));

  r.register(tool(obj({ kind, name: str({ min: 1, max: 80 }), config: opt(record(str({ max: 300 }), { maxKeys: 10 })), stashId: uuid() }), {
    name: 'integration.connect', risk: 'policy', summary: 'Connect an outside service so agents and campaigns can use it',
    describe: i => `Connect ${INTEGRATION_KINDS[i.kind].label} as "${i.name}"`,
    run: async (ctx, i) => {
      const k = INTEGRATION_KINDS[i.kind];
      const extra = Object.keys(i.config ?? {}).filter(c => !k.config.includes(c));
      if (extra.length) throw new Error(`${k.label} settings allowed: ${k.config.join(', ') || 'none'}; not expected: ${extra.join(', ')}`);
      const stash = await one<{ ciphertext: string; meta: { kind?: string } }>(ctx.q,
        "DELETE FROM secret_box WHERE id = $1 AND workspace_id = $2 AND purpose = 'stash' AND expires_at > now() RETURNING ciphertext, meta", [i.stashId, ctx.workspaceId]);
      if (!stash) throw new Error('the credentials were not found or have expired; hand them over again with integration.stage_secrets');
      if (stash.meta.kind !== i.kind) throw new Error(`those credentials were staged for ${stash.meta.kind}, not ${i.kind}`);
      const secrets = JSON.parse(open(ctx.workspaceId, 'stash', stash.ciphertext)) as Record<string, string>;
      try {
        const row = await one<{ id: string }>(ctx.q,
          `INSERT INTO integration (workspace_id, kind, name, config, secret_ciphertext, secret_keys, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [ctx.workspaceId, i.kind, i.name, i.config ?? {}, seal(ctx.workspaceId, 'integration', JSON.stringify(secrets)), Object.keys(secrets), ctx.actor.id ?? ctx.actor.type]);
        return { id: row!.id, kind: i.kind, name: i.name, secretKeys: Object.keys(secrets) };
      } catch (e) {
        if ((e as { code?: string }).code === '23505') throw new Error(`an integration named "${i.name}" already exists; disconnect it first or pick another name`);
        throw e;
      }
    },
  }));

  r.register(tool(obj({}), {
    name: 'integration.list', risk: 'read', summary: 'List connected integrations (never their credentials)',
    run: async ctx => ({
      integrations: await many(ctx.q, `SELECT id, kind, name, status, config, secret_keys AS "secretKeys", created_at AS "connectedAt" FROM integration WHERE workspace_id = $1 ORDER BY created_at`, [ctx.workspaceId]),
    }),
  }));

  r.register(tool(obj({ id: uuid() }), {
    name: 'integration.disconnect', risk: 'destructive', summary: 'Disconnect an integration and erase its stored credentials',
    describe: async (i, ctx) => `Disconnect the integration ${await label(ctx, 'integration', i.id)} and erase its stored credentials`,
    version: async (ctx, i) => (await one<{ v: string }>(ctx.q, "SELECT name || '|' || status || '|' || updated_at::text AS v FROM integration WHERE id = $1 AND workspace_id = $2", [i.id, ctx.workspaceId]))?.v ?? null,
    run: async (ctx, i) => {
      const n = await ctx.q.query("UPDATE integration SET status = 'disconnected', secret_ciphertext = NULL, secret_keys = '{}', updated_at = now() WHERE id = $1 AND workspace_id = $2 AND status = 'connected'", [i.id, ctx.workspaceId]);
      if (!n.rowCount) throw new Error('no connected integration with that id in this workspace');
      return { id: i.id, disconnected: true };
    },
  }));
}
