// Where the member is, for the model. The page used to pick tools only (toolset.ts), so the model asked "which
// campaign?" while the member was looking at one, or when the workspace had only one (open.2026-10-23.operator-page-
// context-not-sent). This builds a short note: the page, the entity the path names (its name, read through the
// registry with the Operator's own actor), and, for a section with no id, the only entity of that kind when there is
// exactly one. Names are tenant data, so the caller wraps the note as untrusted data. Any read that fails is skipped.
import type { Actor, Registry } from '../../tools.ts';
import type pg from 'pg';

interface Section {
  noun: string;                               // what one entity is called
  words: RegExp;                              // the member's words that point at this kind of entity
  get?: { tool: string; arg: string };        // read one by id
  list?: { tool: string; args: Record<string, unknown> };   // list a few, to find "the only one"
}

const SECTIONS: Record<string, Section> = {
  agents: { noun: 'agent', words: /\bagents?\b/i, get: { tool: 'agent.get', arg: 'agentId' }, list: { tool: 'agent.list', args: {} } },
  campaigns: { noun: 'campaign', words: /\bcampaigns?\b/i, get: { tool: 'campaign.get', arg: 'id' }, list: { tool: 'campaign.list', args: { limit: 2 } } },
  audiences: { noun: 'audience', words: /\baudiences?\b/i, get: { tool: 'audience.get', arg: 'id' }, list: { tool: 'audience.list', args: { limit: 2 } } },
  contacts: { noun: 'contact', words: /(?!)/, get: { tool: 'contact.get', arg: 'id' } },
  calls: { noun: 'call', words: /(?!)/, get: { tool: 'call.get', arg: 'conversationId' } },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A display name from a get/list row: the row's own name, or the name of its first nested object. */
function nameOf(v: unknown): string | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.name === 'string') return o.name;
  for (const x of Object.values(o)) if (x && typeof x === 'object' && !Array.isArray(x) && typeof (x as any).name === 'string') return (x as any).name;
  return null;
}

/** The first list in a list result ({ campaigns: [...] } -> [...]). */
function rowsOf(v: unknown): unknown[] | null {
  if (!v || typeof v !== 'object') return null;
  for (const x of Object.values(v as Record<string, unknown>)) if (Array.isArray(x)) return x;
  return null;
}

/** One entity in the note. For an agent, the latest PUBLISHED version id too (null: none yet): a campaign needs that,
 *  never the agent id (bench r3 lost camp-draft-estimate to an agent id sent as agentVersionId). */
export interface Entity { kind: string; id: string; name: string | null; versionId?: string | null }
export interface PageNote { page?: string; section?: string; viewing?: Entity; onlyOne: Entity[] }

/** The latest published version id from an agent.get result (versions are newest first); null when there is none. */
function latestVersion(r: unknown): string | null {
  const v = (r as { versions?: { id?: unknown }[] } | null)?.versions?.[0]?.id;
  return typeof v === 'string' ? v : null;
}

export async function pageNote(o: { pool: pg.Pool; registry: Registry; workspaceId: string; actor: Actor; page?: string; text: string }): Promise<PageNote | null> {
  const read = async (tool: string, args: Record<string, unknown>) => {
    if (!o.registry.get(tool)) return null;
    try {
      const r = await o.registry.execute(o.pool, tool, args, { workspaceId: o.workspaceId, actor: o.actor });
      return r.status === 'confirmed' ? r.result : null;
    } catch { return null; }
  };
  const segs = (o.page ?? '').split('?')[0]!.split('/').filter(Boolean);
  const key = segs[0] && segs[0] in SECTIONS ? segs[0] : undefined;
  const note: PageNote = { ...(o.page ? { page: o.page } : {}), ...(key ? { section: key } : {}), onlyOne: [] };

  if (key && segs[1] && UUID.test(segs[1]) && SECTIONS[key]!.get) {
    const g = SECTIONS[key]!.get!;
    const r = await read(g.tool, { [g.arg]: segs[1] });
    if (r) note.viewing = { kind: SECTIONS[key]!.noun, id: segs[1].toLowerCase(), name: nameOf(r), ...(key === 'agents' ? { versionId: latestVersion(r) } : {}) };
  }
  // "The only one": for the page's own section when no entity is open, and for any kind the member's words name.
  for (const [k, s] of Object.entries(SECTIONS)) {
    if (!s.list) continue;
    if (note.viewing?.kind === s.noun) continue;
    if (k !== key && !s.words.test(o.text)) continue;
    const rows = rowsOf(await read(s.list.tool, s.list.args));
    if (rows?.length === 1) {
      const row = rows[0] as Record<string, unknown>;
      if (typeof row?.id === 'string') note.onlyOne.push({ kind: s.noun, id: row.id, name: nameOf(row),
        ...(k === 'agents' ? { versionId: latestVersion(await read('agent.get', { agentId: row.id })) } : {}) });
    }
  }
  return note.page || note.viewing || note.onlyOne.length ? note : null;
}

/** The note as plain sentences for the model (the caller wraps it as data). */
export function pageText(n: PageNote): string {
  const lines: string[] = [];
  if (n.page) lines.push(`The member is on ${n.page}${n.section ? ` (the ${n.section} page)` : ''}.`);
  if (n.viewing) lines.push(`They are looking at the ${n.viewing.kind} ${label(n.viewing)}. "This ${n.viewing.kind}" or "the ${n.viewing.kind}" means this one unless they name another; do not ask which.${versionLine(n.viewing)}`);
  for (const x of n.onlyOne) lines.push(`This workspace has exactly one ${x.kind}: ${label(x)}. "The ${x.kind}" means this one; do not ask which.${versionLine(x)}`);
  return lines.join('\n');
}

const label = (x: Entity) => `${x.name ? `"${x.name}"` : '(unnamed)'} (${x.kind} id ${x.id})`;
function versionLine(x: Entity): string {
  if (x.versionId === undefined) return '';
  return x.versionId ? ` Its latest published version id is ${x.versionId}: use that as agentVersionId, never the ${x.kind} id.`
    : ` It has no published version yet: publish it with version.publish before a campaign can use it; the ${x.kind} id is not a version id.`;
}
