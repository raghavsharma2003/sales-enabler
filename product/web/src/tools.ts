// Every tool id the UI calls, grouped by the page that owns it. One page action = exactly one tool (workspace.md §2.2).
// STATUS.json's tools_used is generated from this list by tests/web.test.ts, so it cannot drift from the code.
export const TOOLS = {
  today: ['brief.today', 'campaign.list', 'campaign.pause', 'wallet.get'],
  agents: ['agent.list', 'agent.get', 'agent.create', 'template.list', 'brief.edit', 'stack.set', 'version.publish', 'test.simulate', 'test.browser_call', 'money.estimate'],
  contacts: ['contact.list', 'contact.search', 'contact.get', 'contact.memory.get', 'attempt.list', 'audience.list', 'audience.get', 'audience.create', 'source.upload', 'source.map', 'source.commit', 'fact.approve', 'fact.forget'],
  campaigns: ['campaign.get', 'campaign.draft', 'campaign.estimate', 'campaign.funnel', 'campaign.launch', 'campaign.resume', 'campaign.stop', 'campaign.window.narrow', 'campaign.window.widen'],
  calls: ['call.search', 'call.get', 'call.explain'],
  insights: ['issue.list', 'monitor.list', 'monitor.create', 'proposal.list', 'proposal.probe', 'proposal.accept', 'learning.propose', 'experiment.list'],
  numbers: ['number.search', 'number.rent', 'test.ring_member_phone'],
  settings: ['member.list', 'member.invite', 'member.role.set', 'apikey.list', 'apikey.create', 'apikey.revoke', 'secret.reveal', 'brand.get', 'brand.update', 'knowledge.list', 'knowledge.ingest', 'knowledge.span.approve',
    'invoice.get', 'wallet.topup', 'safety.cases', 'policy.window.set', 'memory.policy.get', 'memory.policy.set', 'dpdp.request.execute', 'operator.settings.get', 'operator.brain.set', 'operator.autonomy.lower', 'operator.autonomy.raise',
    'integration.list', 'integration.kinds', 'activity.list'],
} as const;
export const ALL_TOOLS: string[] = [...new Set(Object.values(TOOLS).flat())].sort();

/** Mirrors shared/approval.ts APPROVERS (that file imports node:crypto so the browser cannot import it; a test pins the two). */
export const APPROVERS: Record<string, string[]> = {
  read: ['owner', 'builder', 'operator', 'compliance', 'viewer'], draft: ['owner', 'builder', 'operator'], test: ['owner', 'builder', 'operator'],
  external: ['owner', 'builder', 'operator'], spend: ['owner'], destructive: ['owner'], policy: ['owner', 'compliance'],
};

export const RISK_WORDS: Record<string, { label: string; line: string }> = {
  external: { label: 'Reaches people', line: 'This can call or message real people.' },
  spend: { label: 'Spends money', line: 'This spends from your wallet.' },
  destructive: { label: 'Deletes', line: 'This removes something.' },
  policy: { label: 'Changes a policy', line: 'This changes rules that apply to every call.' },
  draft: { label: 'Draft', line: 'Nothing reaches anyone.' }, test: { label: 'Test', line: 'A test. It costs a little and reaches only you.' }, read: { label: 'Read', line: '' },
};

export interface PageInfo { key: string; label: string; chips: string[] }
export function pageInfo(path: string): PageInfo {
  const p = path.split('/').filter(Boolean);
  switch (p[0]) {
    case undefined: return { key: 'today', label: 'Today', chips: ['What needs me today?', 'Kal ka kharcha kitna hua?', 'Naya campaign shuru karo'] };
    case 'agents': return p[1] ? { key: 'agent', label: 'Agent', chips: ['Make her slower', 'Discount mat bolna', 'Test this agent'] } : { key: 'agents', label: 'Agents', chips: ['Naya agent banao', 'Which agent is live?'] };
    case 'contacts': return { key: 'contacts', label: p[1] ? 'Contact' : 'Contacts', chips: ['Ye CSV import karo', 'Who has opted out?', 'Show people with no consent'] };
    case 'campaigns': return { key: 'campaigns', label: p[1] ? 'Campaign' : 'Campaigns', chips: ['Why is pickup low?', 'Move the window to 11 am - 7 pm', 'Pause this campaign'] };
    case 'calls': return { key: 'calls', label: p[1] ? 'Call' : 'Calls', chips: p[1] ? ['Make a test from this call', 'Why did she hang up?'] : ['Show failed calls', 'Calls where they objected'] };
    case 'insights': return { key: 'insights', label: 'Insights', chips: ['Where do we lose people?', 'Summarise this week'] };
    case 'numbers': return { key: 'numbers', label: 'Numbers', chips: ['Ring my phone', 'How long does KYC take?'] };
    case 'settings': return { key: 'settings', label: 'Settings', chips: ['What did VP do this week?', 'Set a daily spend cap'] };
    default: return { key: 'other', label: 'VP', chips: [] };
  }
}
