// Names for approval cards. A card says what will happen in words a person reads ("Pause Diwali reminders"), never an
// id or a hash. Each label is looked up inside the workspace; anything not found reads as a plain phrase ("this
// campaign"), never as the id it was given. tests/describe-labels.test.ts runs every describe() and fails on any hex
// run of 8 or more characters.
import { one } from './db.ts';
import type { ToolCtx } from './tools.ts';

type Kind = 'agent' | 'agent_version' | 'campaign' | 'contact' | 'member' | 'api_key' | 'webhook' | 'integration' | 'suppression'
  | 'fact' | 'experiment' | 'proposal' | 'attempt' | 'number' | 'call';

const FALLBACK: Record<Kind, string> = {
  agent: 'this agent', agent_version: 'this agent version', campaign: 'this campaign', contact: 'this contact', member: 'this member',
  api_key: 'this API key', webhook: 'this webhook', integration: 'this integration', suppression: 'this suppression', fact: 'this remembered fact',
  experiment: 'this experiment', proposal: 'this proposal', attempt: 'this call attempt', number: 'this line', call: 'this call',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SQL: Record<Kind, string> = {
  agent: `SELECT name AS l FROM agent WHERE id = $1 AND workspace_id = $2`,
  agent_version: `SELECT a.name || ', version ' || v.number AS l FROM agent_version v JOIN agent a ON a.id = v.agent_id WHERE v.id = $1 AND a.workspace_id = $2`,
  campaign: `SELECT name AS l FROM campaign WHERE id = $1 AND workspace_id = $2`,
  contact: `SELECT coalesce(nullif(name, ''), 'ends ' || right(regexp_replace(e164, '\\D', '', 'g'), 4)) AS l FROM contact WHERE id = $1 AND workspace_id = $2`,
  member: `SELECT coalesce(nullif(name, ''), email) AS l FROM member WHERE id = $1 AND workspace_id = $2`,
  api_key: `SELECT name AS l FROM api_key WHERE id = $1 AND workspace_id = $2`,
  webhook: `SELECT url AS l FROM webhook_endpoint WHERE id = $1 AND workspace_id = $2`,
  integration: `SELECT name AS l FROM integration WHERE id = $1 AND workspace_id = $2`,
  suppression: `SELECT coalesce(c.name, 'ends ' || right(regexp_replace(coalesce(s.e164, c.e164), '\\D', '', 'g'), 4)) AS l
                FROM suppression s LEFT JOIN contact c ON c.id = s.contact_id WHERE s.id = $1 AND s.workspace_id = $2`,
  fact: `SELECT replace(key, '_', ' ') AS l FROM memory_fact WHERE id = $1 AND workspace_id = $2`,
  experiment: `SELECT 'the experiment on ' || a.name AS l FROM experiment e JOIN agent a ON a.id = e.agent_id WHERE e.id = $1 AND e.workspace_id = $2`,
  proposal: `SELECT 'the ' || replace(p.kind, '_', ' ') || ' change to ' || a.name AS l FROM proposal p JOIN agent a ON a.id = p.agent_id WHERE p.id = $1 AND p.workspace_id = $2`,
  attempt: `SELECT 'the attempt to call ' || coalesce(c.name, 'a contact') AS l FROM attempt t LEFT JOIN contact c ON c.id = t.contact_id WHERE t.id = $1 AND t.workspace_id = $2`,
  number: `SELECT coalesce(nullif(display_name, ''), 'ends ' || right(regexp_replace(e164, '\\D', '', 'g'), 4)) AS l FROM phone_number WHERE id = $1 AND workspace_id = $2`,
  call: `SELECT 'the call with ' || coalesce(c.name, 'a contact') AS l FROM conversation v LEFT JOIN contact c ON c.id = v.contact_id WHERE v.id = $1 AND v.workspace_id = $2`,
};

/** How a person would name this object on an approval card. Never returns the id. */
export async function label(ctx: Pick<ToolCtx, 'q' | 'workspaceId'>, kind: Kind, id: string | null | undefined): Promise<string> {
  // Checked before querying: a failed query inside the proposal's transaction would abort it.
  if (!id || !UUID.test(id)) return FALLBACK[kind];
  const row = await one<{ l: string | null }>(ctx.q, SQL[kind], [id, ctx.workspaceId]);
  const l = row?.l?.trim();
  if (!l) return FALLBACK[kind];
  if (kind === 'webhook') { try { return `the webhook to ${new URL(l).host}`; } catch { return FALLBACK.webhook; } }
  if (kind === 'contact' || kind === 'suppression' || kind === 'number') return l.startsWith('ends ') ? `the ${kind === 'number' ? 'line' : 'contact'} whose number ${l}` : l;
  if (kind === 'fact') return `the remembered ${l}`;
  return l;
}
