// Which tools one Operator model call is offered. Offering every tool a role may use put ~165 schemas (~74k chars,
// ~21k tokens) on every request, so 2-3 model calls exhausted the turn's token cap, and some OpenAI-style endpoints
// refuse more than 128 tools. A call now carries at most MAX_OFFERED: the loop constructs, the page's tools, tools the
// member's words point at, tools already used in this thread, a core read set, and anything operator_find_tools
// found earlier in the same turn. Offering is not permission: the role filter and SCREEN_ONLY decide what may run,
// in loop.ts, exactly as before.

export const MAX_OFFERED = 40;
/** Room kept for operator_plan and operator_find_tools. */
const LOOP_TOOLS = 2;

/** Always offered (when registered and the role may use them): enough to orient on any page. */
export const CORE_READS = ['brief.today', 'search.global', 'agent.list', 'campaign.list', 'call.search', 'issue.list', 'stack.list', 'template.list', 'workspace.get', 'wallet.get'];

/** Page (first path segment of the web app) -> tool-name prefixes, in priority order. */
const PAGES: Record<string, string[]> = {
  agents: ['agent.', 'brief.edit', 'brief.compile', 'stack.', 'voice.', 'tool.attach', 'test.', 'version.', 'deployment.', 'simcaller.', 'template.', 'offering.', 'knowledge.'],
  campaigns: ['campaign.', 'audience.', 'money.estimate', 'number.search', 'policy.', 'cap.', 'attempt.', 'deployment.split'],
  contacts: ['contact.', 'audience.', 'source.', 'consent.', 'fact.', 'memory.', 'dpdp.'],
  calls: ['call.', 'outcome.', 'judge.', 'live.', 'monitor.', 'issue.'],
  insights: ['proposal.', 'experiment.', 'lesson.', 'learning.', 'issue.', 'monitor.', 'report.', 'outcome.'],
  numbers: ['number.', 'brand.', 'a2p.', 'test.ring_member_phone'],
  settings: ['workspace.', 'member.', 'operator.', 'apikey.', 'integration.', 'webhook.', 'wallet.', 'invoice.', 'usage.', 'plan.', 'brand.', 'share.', 'activity.'],
  today: ['brief.today', 'issue.', 'activity.', 'usage.get', 'wallet.get'],
};
const PAGE_CAP = 18, WORDS_CAP = 8, HISTORY_CAP = 6;

export interface Offerable { name: string; summary: string }

/** The page key for a web path ('/agents/123' -> 'agents', '/' -> 'today'). Unknown paths give none. */
export function pageKey(path: string | undefined): string | undefined {
  if (path === undefined) return undefined;
  const first = path.split('?')[0]!.split('/').filter(Boolean)[0];
  if (!first) return 'today';
  return first in PAGES ? first : undefined;
}

const STOP = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'what', 'who', 'how', 'why', 'can', 'you', 'please', 'make', 'new', 'all', 'our', 'my', 'me', 'from', 'into', 'about', 'want', 'need', 'set', 'get', 'show', 'give', 'let', 'use', 'one', 'are', 'is', 'to', 'a', 'an', 'of', 'on', 'in', 'it', 'do', 'be', 'we', 'i']);
const SYNONYMS: Record<string, string[]> = {
  voice: ['stack', 'voice'], stack: ['stack'], number: ['number'], numbers: ['number'], phone: ['number', 'call'],
  list: ['audience', 'contact'], people: ['contact', 'audience'], customers: ['contact', 'audience'], contacts: ['contact'],
  money: ['wallet', 'money', 'usage'], spend: ['usage', 'money', 'cap', 'wallet'], cost: ['money', 'usage'], budget: ['cap', 'money'],
  approve: ['action'], undo: ['action'], test: ['test'], publish: ['version'], learn: ['learning', 'proposal', 'experiment'],
  improve: ['learning', 'proposal'], experiment: ['experiment'], script: ['brief'], prompt: ['brief'], agent: ['agent'],
  campaign: ['campaign'], audience: ['audience'], window: ['campaign', 'policy'], csv: ['source'], import: ['source'], upload: ['source'],
};

function words(text: string): string[] {
  return [...new Set(text.toLowerCase().normalize('NFKD').split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w)))];
}

/** Rank tools against free text: name parts weigh most, then synonyms, then summary words. Score 0 is no match. */
export function findTools(query: string, tools: readonly Offerable[], limit = 12): Offerable[] {
  const ws = words(query);
  if (!ws.length) return [];
  const scored = tools.map(t => {
    const nameParts = t.name.toLowerCase().split(/[._]/);
    const summary = ` ${t.summary.toLowerCase()} `;
    let score = 0;
    for (const w of ws) {
      const stem = w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w;
      if (nameParts.some(p => p === w || p === stem || (stem.length >= 4 && p.startsWith(stem)))) score += 5;
      if ((SYNONYMS[w] ?? []).some(s => nameParts[0] === s)) score += 3;
      if (summary.includes(' ' + stem)) score += 1;
    }
    return { t, score };
  }).filter(x => x.score > 0);
  scored.sort((a, b) => b.score - a.score || a.t.name.localeCompare(b.t.name));
  return scored.slice(0, limit).map(x => x.t);
}

export interface SelectInput {
  allowed: readonly Offerable[];   // what this member's role may use (already filtered by role and SCREEN_ONLY)
  page?: string;                   // web path the member is on, if the client sent it
  text: string;                    // the member's message
  history: readonly string[];      // tool names used earlier in this thread, newest first
  found: readonly string[];        // tool names operator_find_tools returned this turn, newest first
}

/** The tool names to offer on one model call, at most MAX_OFFERED - 2 (the two loop tools are added by the caller). */
export function selectTools(i: SelectInput): string[] {
  const allowed = new Set(i.allowed.map(t => t.name));
  const out: string[] = [];
  const room = MAX_OFFERED - LOOP_TOOLS;
  if (i.allowed.length <= room) return i.allowed.map(t => t.name);     // everything fits: nothing to choose
  const add = (names: Iterable<string>, cap = Infinity) => {
    let n = 0;
    for (const name of names) {
      if (out.length >= room || n >= cap) return;
      if (allowed.has(name) && !out.includes(name)) { out.push(name); n++; }
    }
  };
  add(i.found);
  const key = pageKey(i.page);
  if (key) add(PAGES[key]!.flatMap(p => i.allowed.filter(t => (p.endsWith('.') ? t.name.startsWith(p) : t.name === p)).map(t => t.name)), PAGE_CAP);
  add(findTools(i.text, i.allowed, WORDS_CAP).map(t => t.name), WORDS_CAP);
  add(i.history, HISTORY_CAP);
  add(CORE_READS);
  return out;
}
