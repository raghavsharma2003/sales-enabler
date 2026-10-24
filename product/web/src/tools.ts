// Every tool id the UI calls, grouped by the page that owns it. One page action = exactly one tool (workspace.md §2.2).
// STATUS.json's tools_used is generated from this list by tests/web.test.ts, so it cannot drift from the code.
export const TOOLS = {
  today: ['brief.today', 'campaign.list', 'campaign.pause', 'wallet.get', 'handoff.list'],
  handoffs: ['handoff.list', 'handoff.claim', 'handoff.resolve'],
  shell: ['alert.list', 'alert.ack'],
  agents: ['agent.list', 'agent.get', 'agent.create', 'template.list', 'brief.edit', 'stack.set', 'version.publish', 'simcaller.list', 'test.simulate', 'test.chat', 'test.chat_keep', 'test.browser_call', 'money.estimate', 'agent.knowledge', 'learning.history', 'learning.power', 'proposal.adopt', 'proposal.revert', 'agent.archive', 'agent.restore', 'agent.duplicate'],
  contacts: ['contact.list', 'contact.search', 'contact.get', 'contact.memory.get', 'attempt.list', 'audience.list', 'audience.get', 'audience.create', 'source.upload', 'source.map', 'source.commit', 'source.sample.list', 'source.sample.load', 'source.payments.list', 'source.payments.setup', 'source.sheet.tabs', 'source.sheet.pull', 'outcome.list', 'fact.review.list', 'fact.review.decide', 'integration.list', 'source.crm.lists', 'source.crm.pull', 'source.crm.sources', 'source.crm.budget', 'source.crm.budget.set', 'source.sync', 'source.sync.schedule', 'fact.approve', 'fact.forget'],
  campaigns: ['campaign.get', 'campaign.draft', 'campaign.estimate', 'campaign.funnel', 'campaign.launch', 'campaign.resume', 'campaign.stop', 'campaign.window.narrow', 'campaign.window.widen'],
  calls: ['call.search', 'call.get', 'call.explain', 'call.why_said'],
  insights: ['issue.list', 'monitor.list', 'monitor.create', 'proposal.list', 'proposal.probe', 'proposal.readiness', 'proposal.accept', 'learning.propose', 'experiment.list', 'experiment.start', 'lesson.list', 'script.pacing.restore'],
  numbers: ['number.list', 'number.search', 'number.rent', 'member.phone.verify_start', 'member.phone.verify_confirm', 'test.ring_member_phone', 'inbound.route.list', 'inbound.route.set', 'inbound.route.clear'],
  settings: ['member.list', 'member.invite', 'member.role.set', 'apikey.list', 'apikey.create', 'apikey.revoke', 'apikey.rotate', 'secret.reveal', 'brand.get', 'brand.update', 'knowledge.list', 'knowledge.ingest', 'knowledge.ingest_site', 'knowledge.fact.list', 'knowledge.fact.decide', 'offering.import', 'offering.list',
    'invoice.get', 'wallet.topup', 'safety.cases', 'policy.window.set', 'memory.policy.get', 'memory.policy.set', 'dpdp.request.execute', 'operator.settings.get', 'operator.brain.set', 'operator.autonomy.lower', 'operator.autonomy.raise',
    'integration.list', 'integration.kinds', 'activity.list', 'outcome.list', 'outcome.define', 'judge.edit', 'judge.calibrate', 'analysis.settings.get'],
  security: ['member.list', 'secret.reveal', 'sso.config.get', 'sso.secret.stage', 'sso.config.set', 'sso.test', 'sso.required.set', 'scim.token.list', 'scim.token.create', 'scim.token.rotate', 'scim.token.revoke',
    'audit.export', 'audit.export.list', 'audit.export.verify'],
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
    case undefined: return { key: 'today', label: 'Today', chips: ['What needs me today?', 'What did we spend yesterday?', 'Start a new campaign'] };
    case 'agents': return p[1] ? { key: 'agent', label: 'Agent', chips: ['Make her slower', 'Do not mention discounts', 'Test this agent'] } : { key: 'agents', label: 'Agents', chips: ['Create a new agent', 'Which agent is live?'] };
    case 'contacts': return { key: 'contacts', label: p[1] === 'import' ? 'Import contacts' : p[1] ? 'Contact' : 'Contacts', chips: ['Import a CSV file', 'Who has opted out?', 'Show people with no consent'] };
    // A path cannot say whether a campaign is a draft or live, so the chips fit both: none assumes calls have happened.
    case 'campaigns': return p[1] === 'new' ? { key: 'campaigns', label: 'New campaign', chips: ['Which list should I call first?', 'What calling hours are allowed?'] }
      : p[1] ? { key: 'campaigns', label: 'Campaign', chips: ['What is left before launch?', 'How is this campaign doing?', 'Move the window to 11 am - 7 pm'] }
      : { key: 'campaigns', label: 'Campaigns', chips: ['Start a new campaign', 'Which campaigns are live?'] };
    case 'audiences': return { key: 'contacts', label: 'Audiences', chips: ['Make an audience of one city', 'Who has opted out?'] };
    case 'calls': return { key: 'calls', label: p[1] ? 'Call' : 'Calls', chips: p[1] ? ['Make a test from this call', 'Why did she hang up?'] : ['Show failed calls', 'Calls where they objected'] };
    case 'handoffs': return { key: 'handoffs', label: 'Hand-offs', chips: ['Who is waiting for a call back?', 'Show crisis hand-offs'] };
    case 'insights': return { key: 'insights', label: 'Insights', chips: ['Where do we lose people?', 'Summarise this week'] };
    case 'numbers': return { key: 'numbers', label: 'Numbers', chips: ['Ring my phone', 'How long does KYC take?'] };
    case 'settings': return { key: 'settings', label: 'Settings', chips: ['What was done this week?', 'Set a daily spend cap'] };
    default: return { key: 'other', label: 'Vyakti', chips: [] };
  }
}
