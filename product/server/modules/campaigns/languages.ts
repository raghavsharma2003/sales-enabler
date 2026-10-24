// Language routing for campaigns (integrator task, 2026-10-24): each contact meets the agent version that speaks the
// language they prefer. The choices are the campaign's explicit routes plus the newest language variant of the agent
// per language; a contact no version can serve is called by the main version, with the reason recorded on the attempt.
// The rule itself (who serves whom) is the agents module's pure routeContact, so the launch warning counts the same way.
import { stackOf } from '../../../shared/stacks.ts';
import { many, one, type Queryable } from '../../db.ts';
import { routeContact, type RouteChoice } from '../agents/languages.ts';
import { loadVersion, type CampaignPolicy, type VersionRow } from './gate.ts';

type Agentful = VersionRow & { agent: NonNullable<VersionRow['config']['agent']> };
const withAgent = (v: VersionRow | null): Agentful | null => (v?.config?.agent ? { ...v, agent: v.config.agent } : null);
// A version on a beta stack makes test calls only (the dial gate refuses it for real people), so it serves no one here.
const canDial = (v: Agentful) => stackOf(v.agent.voice)?.status !== 'beta';

/** The versions a campaign may route to besides its main one: explicit routes first, then the agent's newest variant
 *  per primary language. Only versions of this workspace, published or variant. */
export async function languageOptions(q: Queryable, ws: string, main: VersionRow, policy: CampaignPolicy | null | undefined): Promise<Agentful[]> {
  const out: Agentful[] = [];
  for (const r of policy?.languageRoutes ?? []) {
    const v = withAgent(await loadVersion(q, ws, r.agentVersionId));
    if (v && (v.kind ?? 'published') !== 'candidate' && canDial(v)) out.push(v);
  }
  const variants = await many<{ id: string }>(q, `SELECT DISTINCT ON (v.config->'agent'->'languages'->>'primary') v.id FROM agent_version v JOIN agent a ON a.id = v.agent_id
    WHERE v.agent_id = $1 AND a.workspace_id = $2 AND v.kind = 'variant'
    ORDER BY v.config->'agent'->'languages'->>'primary', v.number DESC`, [main.agent_id, ws]);
  for (const r of variants) { const v = withAgent(await loadVersion(q, ws, r.id)); if (v && canDial(v)) out.push(v); }
  return out;
}

export interface LanguageNote { preferred: string | null; servedBy: RouteChoice<unknown>['servedBy']; versionId: string; reason?: string }

/** At claim: which version this campaign attempt meets by the contact's language, starting from the version the
 *  experiment or deployment chose. Null when the attempt is not a campaign call or no version is set. */
export async function routeAttempt(q: Queryable, ws: string, a: { campaign_id: string | null; contact_id: string | null; agent_version_id: string | null; kind: string }): Promise<LanguageNote | null> {
  if (!a.campaign_id || !a.contact_id || !a.agent_version_id || !['campaign', 'retry', 'callback'].includes(a.kind)) return null;
  const main = withAgent(await loadVersion(q, ws, a.agent_version_id));
  if (!main) return null;
  const k = await one<{ policy: CampaignPolicy }>(q, 'SELECT policy FROM campaign WHERE id = $1 AND workspace_id = $2', [a.campaign_id, ws]);
  const contact = await one<{ language: string | null }>(q, 'SELECT language FROM contact WHERE id = $1 AND workspace_id = $2', [a.contact_id, ws]);
  const choice = routeContact(contact?.language, main, await languageOptions(q, ws, main, k?.policy));
  return { preferred: choice.language, servedBy: choice.servedBy, versionId: choice.version.id, ...(choice.reason ? { reason: choice.reason } : {}) };
}
