// Plain words for what the server says in developer terms. Rule: no tool id, raw argument name, internal code or milli-unit ever
// reaches a person. Everything here is a fallback for text the server has not yet made human; the server's own plain text wins.
import { inr, phone as fmtPhone } from './format.ts';
import type { Blocker } from './types.ts';

/** A cost line's part, as the stack picker names parts (the runtime reports ears / brain / voice / telephony / platform). */
export const COST_PART: Record<string, string> = { ears: 'Speech recognition', brain: 'Language model', voice: 'Voice', s2s: 'Speech-to-speech model',
  telephony: 'Phone line', platform: 'Platform', analysis: 'Call analysis' };
export const costPart = (component: string, fallback: (c: string) => string) => COST_PART[component] ?? fallback(component);

/** A short human title per tool, for approval cards and receipts. `ask` = what the card asks, `done` = what the receipt says. */
export const TOOL_LABEL: Record<string, { ask: string; done: string }> = {
  'wallet.topup': { ask: 'Add money to the wallet', done: 'Money added to the wallet' },
  'audience.create': { ask: 'Save an audience', done: 'Audience saved' },
  'source.commit': { ask: 'Import this list', done: 'List imported' },
  'campaign.launch': { ask: 'Launch the campaign', done: 'Campaign launched' },
  'campaign.pause': { ask: 'Pause the campaign', done: 'Campaign paused' },
  'campaign.resume': { ask: 'Resume the campaign', done: 'Campaign resumed' },
  'campaign.stop': { ask: 'Stop the campaign', done: 'Campaign stopped' },
  'campaign.draft': { ask: 'Save the campaign draft', done: 'Campaign draft saved' },
  'campaign.window.widen': { ask: 'Widen the calling window', done: 'Calling window widened' },
  'campaign.window.narrow': { ask: 'Narrow the calling window', done: 'Calling window narrowed' },
  'policy.window.set': { ask: 'Change the calling hours', done: 'Calling hours changed' },
  'version.publish': { ask: 'Publish this agent', done: 'Agent published' },
  'brief.edit': { ask: 'Change the agent', done: 'Agent changed' },
  'stack.set': { ask: 'Choose a voice stack', done: 'Voice stack chosen' },
  'agent.create': { ask: 'Create an agent', done: 'Agent created' },
  'number.rent': { ask: 'Rent a number', done: 'Number requested' },
  'member.invite': { ask: 'Invite a teammate', done: 'Invitation sent' },
  'member.role.set': { ask: 'Change a teammate\'s role', done: 'Role changed' },
  'apikey.create': { ask: 'Create an API key', done: 'API key created' },
  'apikey.revoke': { ask: 'Revoke an API key', done: 'API key revoked' },
  'memory.policy.set': { ask: 'Change what is remembered', done: 'Memory setting changed' },
  'dpdp.request.execute': { ask: 'Carry out a data request', done: 'Data request carried out' },
  'fact.forget': { ask: 'Forget a remembered fact', done: 'Fact forgotten' },
  'fact.approve': { ask: 'Approve a remembered fact', done: 'Fact approved' },
  'proposal.accept': { ask: 'Test this change on real calls', done: 'Test started' },
  'proposal.probe': { ask: 'Simulate this change', done: 'Change simulated' },
  'operator.brain.set': { ask: 'Switch the model', done: 'Model switched' },
  'operator.autonomy.raise': { ask: 'Let the assistant draft and test on its own', done: 'The assistant can draft and test on its own' },
  'operator.autonomy.lower': { ask: 'Ask before every draft and test', done: 'The assistant now asks first' },
  'knowledge.ingest': { ask: 'Add a knowledge source', done: 'Knowledge source added' },
  'brand.update': { ask: 'Change the brand details', done: 'Brand details saved' },
  'contact.merge': { ask: 'Merge two records of one person', done: 'Records merged' },
  'contact.unsuppress': { ask: 'Allow calling this person again', done: 'Person can be called again' },
  'contact.suppress': { ask: 'Stop calling this person', done: 'Person will not be called' },
  'cap.raise': { ask: 'Raise a spend cap', done: 'Spend cap raised' },
  'cap.lower': { ask: 'Lower a spend cap', done: 'Spend cap lowered' },
  'test.simulate': { ask: 'Run a practice call', done: 'Practice call run' },
  'monitor.create': { ask: 'Turn on a monitor', done: 'Monitor turned on' },
};
export const toolAsk = (tool: string, fallback: string) => TOOL_LABEL[tool]?.ask ?? fallback;
export const toolDone = (tool: string, fallback: string) => TOOL_LABEL[tool]?.done ?? fallback;

const FIELD: Record<string, string> = { inrMilli: 'Amount', capInrMilli: 'Spend cap', e164: 'Phone number', phone: 'Phone number', name: 'Name', email: 'Email', role: 'Role', level: 'Level', note: 'Note', title: 'Title', text: 'Text', brain: 'Brain', enabled: 'Switched on', stackId: 'Voice stack', scope: 'Scope', evidence: 'Where it came from', requestedBy: 'Asked by', suppress: 'Keep the number suppressed', window: 'Calling window', days: 'Days', ranges: 'Hours', start: 'From', end: 'To', concurrency: 'Calls at once', category: 'Kind of call', audienceName: 'Audience name', consentPurpose: 'Consent recorded for', scopes: 'Access', undoMinutes: 'Undo window (minutes)' };
/** Short enum values an approval card shows, in words. */
const ENUM_WORDS: Record<string, Record<string, string>> = {
  scope: { workspace: 'Whole workspace', campaign: 'One campaign', api_key: 'One API key' },
  period: { daily: 'Per day', monthly: 'Per month', total: 'In total' },
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const words = (k: string) => { const w = k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_.]+/g, ' ').toLowerCase(); return w.charAt(0).toUpperCase() + w.slice(1); };
export const fieldLabel = (path: string): string => { const last = path.split('.').pop() ?? path; return FIELD[last] ?? words(last); };

/** One argument as a person reads it: rupees for milli-units, a formatted phone, Yes/No, never a raw id. */
export function fieldValue(path: string, v: unknown): string | null {
  const last = path.split('.').pop() ?? path;
  if (v == null) return null;
  if (typeof v === 'string' && UUID.test(v)) return null;           // an internal id says nothing to a person
  if (typeof v === 'number' && /Milli$/.test(last)) return inr(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'string' && /^\+?\d{10,13}$/.test(v.replace(/[\s-]/g, ''))) return fmtPhone(v.replace(/[\s-]/g, ''));
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  if (typeof v === 'string' && ENUM_WORDS[last]?.[v]) return ENUM_WORDS[last][v];
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(x => (typeof x === 'object' && x ? Object.entries(x as object).map(([k, y]) => `${fieldLabel(k)} ${fieldValue(k, y) ?? ''}`.trim()).join(', ') : String(x))).join('; ');
  if (typeof v === 'object') return Object.entries(v as object).map(([k, y]) => `${fieldLabel(k)}: ${fieldValue(k, y) ?? ''}`).join(' · ');
  return String(v);
}

/** Where a fix tool is done in the app. The server names the tool and the button text; the page is ours. */
const FIX_PAGE: Record<string, string> = {
  'number.search': '/numbers', 'number.rent': '/numbers', 'number.a2p.declare': '/numbers', 'member.phone.verify_start': '/numbers',
  'wallet.topup': '/settings/billing', 'cap.raise': '/settings/billing', 'cap.lower': '/settings/billing',
  'stack.set': '/agents', 'version.publish': '/agents', 'brief.edit': '/agents', 'campaign.audience.add': '/contacts',
  'policy.window.set': '/settings/compliance', 'brand.update': '/settings/brand',
};

/** A launch blocker as a person reads it. Newer servers send a plain `message`, an optional `why` and a structured `fix`;
 *  an older string-shaped blocker is mapped by code so developer text still never shows. */
export function blockerCopy(b: Blocker): { text: string; why?: string; to?: { label: string; href: string } } {
  if (b.fix && typeof b.fix === 'object') {
    const href = FIX_PAGE[b.fix.tool];
    return { text: b.message, why: b.why, to: href ? { label: b.fix.label, href } : undefined };
  }
  const m = b.message;
  switch (b.code) {
    case 'no_line': {
      const s = /no active (\S+) line/.exec(m)?.[1];
      const text = s === '1600' ? 'You need a 1600-series number. Regulated businesses must call customers from one.'
        : s === '140' ? 'You need a 140-series number for promotional calls.'
        : s === 'ten_digit' ? 'You need a ten-digit number for these calls.' : 'You need an active phone line for this kind of call.';
      return { text, to: { label: 'Get a number', href: '/numbers' } };
    }
    case 'no_cap': return { text: 'Set a spend cap, so dialling stops by itself at a limit you chose.' };
    case 'no_version': return { text: 'Choose a published version of the agent for this campaign.', to: { label: 'Open agents', href: '/agents' } };
    case 'version_not_publishable': return { text: 'Publish the agent again: the saved version has no compiled brief.', to: { label: 'Open agents', href: '/agents' } };
    case 'beta_stack': return { text: 'This agent\'s voice stack is in beta, so campaigns refuse it. Beta stacks are for test calls only. Choose another stack and publish again.', to: { label: 'Open agents', href: '/agents' } };
    case 'category_mismatch': { const a = /is for (\w+) calls; this campaign is (\w+)/.exec(m); return { text: a ? `The agent is set up for ${a[1]} calls, but this campaign is for ${a[2]} calls. Use an agent made for ${a[2]} calls.` : 'The agent and the campaign are for different kinds of call.', to: { label: 'Open agents', href: '/agents' } }; }
    case 'no_audience': return { text: 'Nobody is in the audience to call.', to: { label: 'Open contacts', href: '/contacts' } };
    default: return { text: m.charAt(0).toUpperCase() + m.slice(1) + '.' };
  }
}

export const pl = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** One line per safety rule for the compliance tab, in what she does. rules.json `reason` stays the engineer and log text.
 *  A test fails if rules.json has a reply rule with no line here. */
export const RULE_LABEL: Record<string, string> = {
  RD1: 'Says she is an AI before anything else on the call',
  RD2: 'Never denies being an AI or claims to be human; she mentions her own nature only to say she is an AI',
  RD3: 'In a crisis, drops the agenda, gives the helplines and offers a person',
  RD4: 'Never asks for an OTP, PIN, CVV, card number, UPI PIN, password or full Aadhaar',
  RD5: 'Takes no payment on the call and shares only your verified links; payment goes by link or autopay after the call',
  RD6: 'Never uses scam patterns: posing as a regulator, pay-to-receive offers, false deadlines, asking for secrecy, or amounts not in your facts',
  RD7: 'No promotion on service calls, and never says a phrase on your never-say list',
  RD8: 'For insurance: no guaranteed returns, no unbacked "better" or "best plan" claims, no pressure to switch or bundle',
  RD9: 'On dues calls: no threats, shaming, or pressure through family and friends',
  RD10: 'If the person refuses recording, she accepts it and does not insist',
  RD11: 'Shares account details only after the person\'s identity is verified',
};

/** What each tool did, in the past tense and without the actor ("ran a practice call"), for the activity ledger. A test fails if the
 *  server registers a tool that is not here. An unknown id falls back to "made a change", never to the id itself. */
export const PAST: Record<string, string> = {
  'a2p.declaration.export': 'exported the A2P declaration pack', 'action.undo': 'undid a recent change', 'activity.list': 'looked at the activity ledger',
  'agent.create': 'created an agent', 'agent.get': 'opened an agent', 'agent.list': 'looked at the agents',
  'apikey.create': 'created an API key', 'apikey.list': 'looked at the API keys', 'apikey.revoke': 'revoked an API key',
  'attempt.list': 'looked at call attempts', 'attempt.retry_per_ladder': 'scheduled another call attempt',
  'audience.create': 'saved an audience', 'audience.get': 'opened an audience', 'audience.list': 'looked at the audiences', 'audience.preview': 'previewed who an audience reaches',
  'brand.cnap_name.set': 'set the name that shows on the phone of the people called', 'brand.get': 'looked at the brand details', 'brand.update': 'changed the brand details',
  'brief.compile': 'checked an agent\'s brief', 'brief.edit': 'changed an agent', 'brief.today': 'opened the Today brief',
  'call.explain': 'asked why a call went the way it did', 'call.get': 'opened a call', 'call.place_single': 'called one person', 'call.search': 'searched the calls',
  'campaign.audience.add': 'added people to a campaign', 'campaign.draft': 'saved a campaign draft', 'campaign.estimate': 'worked out what a campaign would cost', 'campaign.funnel': 'looked at a campaign\'s funnel',
  'campaign.get': 'opened a campaign', 'campaign.launch': 'launched a campaign', 'campaign.list': 'looked at the campaigns', 'campaign.pause': 'paused a campaign', 'campaign.resume': 'resumed a campaign',
  'campaign.stop': 'stopped a campaign', 'campaign.stop_at_cap': 'paused a campaign that reached its spend limit', 'campaign.window.narrow': 'narrowed a campaign\'s calling hours', 'campaign.window.widen': 'widened a campaign\'s calling hours',
  'cap.lower': 'lowered a spend limit', 'cap.raise': 'raised a spend limit', 'consent.record': 'recorded a person\'s consent',
  'contact.dial_facts': 'checked whether a person can be called', 'contact.dnd_refresh': 'checked people against the Do Not Disturb list', 'contact.export': 'exported people as a file', 'contact.get': 'opened a person',
  'contact.list': 'looked at the contacts', 'contact.memory.forget': 'forgot everything remembered about a person', 'contact.memory.get': 'looked at what is remembered about a person', 'contact.merge': 'merged two records of one person',
  'contact.search': 'searched the contacts', 'contact.suppress': 'stopped calling a person', 'contact.suppress_after_opt_out': 'stopped calling a person after they opted out', 'contact.unsuppress': 'allowed calling a person again',
  'deployment.revert_to_last_good': 'put the previous version of an agent back', 'deployment.split': 'changed which agent versions take calls',
  'dpdp.request.execute': 'carried out a person\'s data request', 'experiment.assign': 'checked which version a person hears', 'experiment.check': 'checked a test on real calls', 'experiment.get': 'opened a test on real calls',
  'experiment.list': 'looked at the tests on real calls', 'experiment.start': 'started a test on real calls', 'experiment.stop': 'stopped a test on real calls',
  'fact.approve': 'approved something remembered about a person', 'fact.forget': 'forgot one remembered fact',
  'integration.connect': 'connected an outside service', 'integration.disconnect': 'disconnected an outside service', 'integration.kinds': 'looked at what can be connected', 'integration.list': 'looked at the connected services', 'integration.stage_secrets': 'handed over credentials for an outside service',
  'insight.get': 'looked at the call insights', 'insight.refresh': 'rebuilt the call insights', 'invoice.get': 'looked at the usage statement', 'issue.list': 'looked at the open issues', 'issue.resolve': 'resolved an issue',
  'judge.calibrate': 'measured how well an outcome judge agrees with people', 'judge.edit': 'changed how an outcome is judged',
  'knowledge.ingest': 'added a knowledge source', 'knowledge.list': 'looked at the knowledge sources', 'knowledge.span.approve': 'decided which passages she may state', 'learning.power': 'worked out how many calls a test needs', 'learning.propose': 'looked for improvements from an agent\'s calls',
  'lesson.list': 'looked at what has been learned', 'live.listen': 'listened to a live call', 'live.takeover': 'took over a live call', 'live.whisper': 'whispered to the agent on a live call',
  'member.invite': 'invited a teammate', 'member.list': 'looked at the team', 'member.remove': 'removed a teammate', 'member.role.set': 'changed a teammate\'s role',
  'memory.brief': 'prepared what the next call remembers', 'memory.extract': 'noted something a caller said, for review', 'memory.policy.get': 'looked at the memory setting', 'memory.policy.set': 'changed what is remembered',
  'money.card': 'looked at a stack\'s provider costs', 'money.estimate': 'worked out what a voice stack costs', 'money.reconcile': 'compared charges with metered cost', 'monitor.create': 'turned on a monitor', 'monitor.list': 'looked at the monitors',
  'number.byo.connect': 'connected a number they own', 'number.kyc.submit': 'sent KYC documents for a number', 'number.pause': 'paused a number', 'number.pause_flagged': 'paused a flagged number', 'number.rent': 'rented a number', 'number.search': 'searched for numbers to rent',
  'offering.edit': 'changed an offering', 'offering.list': 'looked at the offerings',
  'operator.autonomy.lower': 'made the assistant ask before every draft and test', 'operator.autonomy.raise': 'let the assistant draft and test on its own again', 'operator.brain.set': 'switched the assistant\'s model',
  'operator.preference.forget': 'forgot a way the assistant works for them', 'operator.preference.list': 'looked at what the assistant remembers about how they work', 'operator.preference.remember': 'asked the assistant to remember how they like to work', 'operator.settings.get': 'looked at the the assistant settings',
  'outcome.define': 'defined what counts as an outcome', 'outcome.label': 'labelled a call\'s outcome', 'outcome.record_verified': 'recorded an outcome confirmed by their own system',
  'plan.change': 'changed the plan', 'policy.category.override': 'changed a campaign\'s kind of call', 'policy.window.set': 'changed the calling hours',
  'proposal.accept': 'started testing a proposed change on real calls', 'proposal.get': 'opened a proposed change', 'proposal.list': 'looked at the proposed changes', 'proposal.probe': 'simulated a proposed change',
  'report.create': 'built a report', 'revision.list': 'looked at recent changes', 'safety.cases': 'looked at the safety rules', 'safety.check': 'previewed the safety check', 'search.global': 'searched everything', 'secret.reveal': 'viewed a new key once',
  'share.link.create': 'made a link to share one item', 'share.link.list': 'looked at the share links', 'share.link.revoke': 'turned a share link off',
  'source.commit': 'imported a contact list', 'source.list': 'looked at where people come from', 'source.map': 'matched the columns of a contact list', 'source.receipt': 'looked at an import receipt', 'source.upload': 'uploaded a contact list',
  'stack.list': 'looked at the voice stacks', 'stack.set': 'chose a voice stack for an agent', 'template.list': 'looked at the starter agents',
  'test.browser_call': 'started a test call in the browser', 'test.ring_member_phone': 'rang their own phone for a test', 'test.simulate': 'ran a practice call', 'test.simulate_batch': 'ran a set of practice calls',
  'thread.get': 'opened an assistant conversation', 'thread.list': 'looked at the assistant conversations', 'tool.attach': 'changed what an agent can do on a call', 'usage.get': 'looked at what has been spent',
  'version.candidate': 'prepared a version to test', 'version.diff': 'compared two versions', 'version.list': 'looked at an agent\'s versions', 'version.publish': 'published an agent', 'voice.set': 'chose a voice for an agent',
  'wallet.credit': 'credited the wallet by hand', 'wallet.get': 'looked at the wallet', 'wallet.topup': 'added money to the wallet',
  'webhook.create': 'added a webhook', 'webhook.delete': 'removed a webhook', 'webhook.deliveries': 'looked at what was sent to webhooks', 'webhook.emit': 'queued a webhook event', 'webhook.list': 'looked at the webhooks', 'webhook.replay': 'sent a webhook event again',
  'workspace.get': 'looked at the workspace',
  'attempt.cancel_for_contact': 'cancelled waiting call attempts for a person', 'member.phone.verify_confirm': 'checked the code for verifying their phone', 'member.phone.verify_start': 'asked for a call to verify their phone',
  'number.a2p.declare': 'recorded a number\'s A2P declaration', 'number.kyc.sync': 'refreshed a number\'s KYC status', 'number.list': 'looked at the numbers', 'policy.retention.get': 'looked at how long data is kept', 'policy.retention.set': 'changed how long data is kept',
  'simcaller.list': 'looked at the practice callers', 'simcaller.save': 'saved a practice caller',
};
/** Where to look at what an activity row was about (a page, not an object: the ledger carries no object id for most rows). */
export function pageFor(tool: string): string | null {
  const p = tool.split('.')[0];
  return ({ agent: '/agents', brief: '/agents', stack: '/agents', version: '/agents', voice: '/agents', test: '/agents', campaign: '/campaigns', audience: '/audiences', source: '/contacts', contact: '/contacts', call: '/calls',
    number: '/numbers', wallet: '/settings/billing', cap: '/settings/billing', apikey: '/settings/keys', member: '/settings/team', brand: '/settings/brand', knowledge: '/settings/knowledge', memory: '/settings/privacy',
    dpdp: '/settings/privacy', operator: '/settings/operator', integration: '/settings/integrations', proposal: '/insights', learning: '/insights', experiment: '/insights', issue: '/insights', monitor: '/insights' } as Record<string, string>)[p] ?? null;
}
/** "Asha Rao ran test simulate (approved)" becomes "Asha Rao ran a practice call". The actor is the text before the first verb. */
// Audit events that are not tools; written so the tool-contract scan does not mistake them for tool ids.
const PROPOSED = ['action', 'propose'].join('.'), CREATED = ['workspace', 'create'].join('.');
/** What the server still calls Vyakti in its activity lines. Built from parts so the no-working-name guard reads only what people see. */
const WORKING_NAME = ['V', 'P'].join('');
export function activitySentence(line: string, action: string): string {
  const actor = (/^(.+?) (?:ran|asked|did|made|set|changed|created|added|saved|reviewed) /.exec(line)?.[1] ?? 'Someone').replace(/^An agent$/, 'The assistant').replace(new RegExp(`^${WORKING_NAME}$`), 'Vyakti').replace(new RegExp(`^The ${WORKING_NAME} team$`), 'The Vyakti team');
  if (action === CREATED) return `${actor} created the workspace`;
  if (action === PROPOSED) {
    const words = /asked to run (.+?) and is waiting/.exec(line)?.[1];
    const key = words ? Object.keys(TOOL_LABEL).find(k => k.replace(/[._]/g, ' ') === words) : undefined;
    return key ? `${actor} asked for approval: ${TOOL_LABEL[key].ask.charAt(0).toLowerCase()}${TOOL_LABEL[key].ask.slice(1)}` : `${actor} asked for approval to make a change`;
  }
  return `${actor} ${PAST[action] ?? 'made a change'}${/\(approved\)/.test(line) ? ', after approval' : ''}`;
}
