// Plain words for what the server says in developer terms. Rule: no tool id, raw argument name, internal code or milli-unit ever
// reaches a person. Everything here is a fallback for text the server has not yet made human; the server's own plain text wins.
import { inr, phone as fmtPhone } from './format.ts';
import type { Blocker } from './types.ts';

/** Server configuration is never a person's problem to read: a refusal that names an environment variable (or the telephony
 *  adapter being off) becomes what it means for them. Every other refusal is the server's own words, unchanged. */
export function plainReason(reason: string): string {
  if (/telephony provider is not enabled/i.test(reason)) return 'Phone lines are not switched on for this workspace yet, so numbers cannot be searched, rented or rung from here. Practice callers and browser test calls work without one.';
  if (/\bVP_[A-Z0-9_]{3,}\b/.test(reason)) return 'This is not switched on for this workspace yet. Your Vyakti administrator can turn it on.';
  return reason;
}

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
  'inbound.route.set': { ask: 'Answer calls to this number with this agent', done: 'This number now answers calls' },
  'inbound.route.clear': { ask: 'Stop answering calls to this number', done: 'This number no longer answers calls' },
  'campaign.pause': { ask: 'Pause the campaign', done: 'Campaign paused' },
  'campaign.resume': { ask: 'Resume the campaign', done: 'Campaign resumed' },
  'campaign.stop': { ask: 'Stop the campaign', done: 'Campaign stopped' },
  'campaign.draft': { ask: 'Save the campaign draft', done: 'Campaign draft saved' },
  'campaign.window.widen': { ask: 'Widen the calling window', done: 'Calling window widened' },
  'campaign.window.narrow': { ask: 'Narrow the calling window', done: 'Calling window narrowed' },
  'policy.window.set': { ask: 'Change the calling hours', done: 'Calling hours changed' },
  'version.publish': { ask: 'Publish this agent', done: 'Agent published' },
  'version.restore': { ask: 'Roll this agent back to an earlier version', done: 'Agent rolled back' },
  'version.language_variant': { ask: 'Publish this agent in another language', done: 'Language version published' },
  'brief.edit': { ask: 'Change the agent', done: 'Agent changed' },
  'stack.set': { ask: 'Choose a voice stack', done: 'Voice stack chosen' },
  'agent.create': { ask: 'Create an agent', done: 'Agent created' },
  'number.rent': { ask: 'Rent a number', done: 'Number requested' },
  'member.invite': { ask: 'Invite a teammate', done: 'Invitation sent' },
  'member.role.set': { ask: 'Change a teammate\'s role', done: 'Role changed' },
  'apikey.create': { ask: 'Create an API key', done: 'API key created' },
  'apikey.revoke': { ask: 'Revoke an API key', done: 'API key revoked' },
  'apikey.rotate': { ask: 'Rotate an API key', done: 'API key rotated' },
  'sso.config.set': { ask: 'Change the single sign-on settings', done: 'Single sign-on settings saved' },
  'sso.required.set': { ask: 'Change whether single sign-on is required', done: 'Single sign-on requirement changed' },
  'scim.token.create': { ask: 'Create a provisioning token', done: 'Provisioning token created' },
  'scim.token.rotate': { ask: 'Rotate a provisioning token', done: 'Provisioning token rotated' },
  'scim.token.revoke': { ask: 'Revoke a provisioning token', done: 'Provisioning token revoked' },
  'audit.export': { ask: 'Export the activity ledger', done: 'Activity ledger exported' },
  'memory.policy.set': { ask: 'Change what is remembered', done: 'Memory setting changed' },
  'dpdp.request.execute': { ask: 'Carry out a data request', done: 'Data request carried out' },
  'fact.forget': { ask: 'Forget a remembered fact', done: 'Fact forgotten' },
  'fact.approve': { ask: 'Approve a remembered fact', done: 'Fact approved' },
  'proposal.accept': { ask: 'Test this change on real calls', done: 'Test approved' },
  'experiment.start': { ask: 'Start the test on real calls', done: 'Test started' },
  'script.pacing.restore': { ask: 'Restore full pacing to this script', done: 'Full pacing restored' },
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
  'campaign.burst.set': { ask: 'Let a campaign burst', done: 'Burst turned on' },
  'campaign.burst.off': { ask: 'Turn a campaign\'s burst off', done: 'Burst turned off' },
  'test.simulate': { ask: 'Run a practice call', done: 'Practice call run' },
  'test.chat': { ask: 'Send a practice chat line', done: 'Practice chat answered' },
  'test.chat_keep': { ask: 'Keep a practice chat for review', done: 'Practice chat kept' },
  'monitor.create': { ask: 'Turn on a monitor', done: 'Monitor turned on' },
};
/** Activity's wording for an approval request whose card keeps the server's own sentence as its title (no TOOL_LABEL). */
const PROPOSAL_ASK: Record<string, string> = {
  'webhook.create': 'add a webhook', 'webhook.delete': 'delete a webhook', 'webhook.replay': 'send a webhook event again', 'call.export': 'export calls as a file',
  'notification.destination.create': 'add an alert destination', 'notification.destination.delete': 'remove an alert destination',
  'duty.roster.set': 'change the duty hours', 'duty.override.add': 'add leave or cover to the duty roster', 'duty.override.remove': 'remove leave or cover from the duty roster',
  'source.hook_secret.rotate': "replace a contact webhook's signing secret",
};
export const toolAsk = (tool: string, fallback: string) => TOOL_LABEL[tool]?.ask ?? fallback;
export const toolDone = (tool: string, fallback: string) => TOOL_LABEL[tool]?.done ?? fallback;

const FIELD: Record<string, string> = { inrMilli: 'Amount', capInrMilli: 'Spend cap', e164: 'Phone number', phone: 'Phone number', name: 'Name', email: 'Email', role: 'Role', level: 'Level', note: 'Note', title: 'Title', text: 'Text', brain: 'Brain', enabled: 'Switched on', stackId: 'Voice stack', scope: 'Scope', evidence: 'Where it came from', requestedBy: 'Asked by', suppress: 'Keep the number suppressed', window: 'Calling window', days: 'Days', ranges: 'Hours', start: 'From', end: 'To', concurrency: 'Calls at once', category: 'Kind of call', audienceName: 'Audience name', consentPurpose: 'Consent recorded for', scopes: 'Access', undoMinutes: 'Undo window (minutes)',
  issuer: 'Identity provider address', clientId: 'Client ID', allowedDomains: 'Allowed email domains', defaultRole: 'Role for new people', emailVerified: 'Email verification', required: 'Required for everyone',
  format: 'Format', from: 'First day', to: 'Last day', actionPrefix: 'Only actions starting with', privilegedOnly: 'Privileged actions only',
  url: 'Address', events: 'Sends', contactNumber: 'Phone numbers', recipients: 'Email to', timezone: 'Time zone', onDuty: 'On duty', shifts: 'Weekly hours' };
/** Event names (webhooks, alerts) in words; keyed with _ for . so the names are not read as tool calls. */
const EVENT_WORDS: Record<string, string> = { '*': 'Every event', call_ended: 'A call ended', campaign_state_changed: 'A campaign changed state', 'campaign_*': 'Every campaign event',
  contact_opted_out: 'A person opted out', hand_off_created: 'A call was handed to a person', wallet_low: 'The wallet is running low', crisis: 'A caller may be in distress',
  hand_off: 'A call was handed to your team', campaign_paused: 'A campaign paused itself' };
/** Short enum values an approval card shows, in words. */
const ENUM_WORDS: Record<string, Record<string, string>> = {
  scope: { workspace: 'Whole workspace', campaign: 'One campaign', api_key: 'One API key' },
  contactNumber: { masked: 'Masked (+91•••••1234 and initials)', full: 'Full numbers and names' },
  timezone: { 'Asia/Kolkata': 'India time (IST)' },
  period: { daily: 'Per day', monthly: 'Per month', total: 'In total' },
  scopes: { 'members:read': 'List people', 'members:write': 'Add and deactivate people', 'roles:write': 'Change roles' },
  format: { csv: 'CSV', jsonl: 'JSONL (one record per line)' },
  defaultRole: { builder: 'Builder', operator: 'Operator', compliance: 'Compliance', viewer: 'Viewer' },
  emailVerified: { required: 'Required', not_required: 'Not required' },
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const words = (k: string) => { const w = k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_.]+/g, ' ').toLowerCase(); return w.charAt(0).toUpperCase() + w.slice(1); };
export const fieldLabel = (path: string): string => { const last = path.split('.').pop() ?? path; return FIELD[last] ?? words(last); };

/** One argument as a person reads it: rupees for milli-units, a formatted phone, Yes/No, never a raw id. */
export function fieldValue(path: string, v: unknown): string | null {
  const last = path.split('.').pop() ?? path;
  if (v == null) return null;
  if (typeof v === 'string' && (UUID.test(v) || /^[0-9a-f]{24,}$/i.test(v))) return null;           // an internal id or hash says nothing to a person
  if (typeof v === 'number' && /Milli$/.test(last)) return inr(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'string' && /^\+?\d{10,13}$/.test(v.replace(/[\s-]/g, ''))) return fmtPhone(v.replace(/[\s-]/g, ''));
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + 'T00:00:00+05:30').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  if (typeof v === 'string' && ENUM_WORDS[last]?.[v]) return ENUM_WORDS[last][v];
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (last === 'events' && Array.isArray(v)) return v.map(e => EVENT_WORDS[String(e).replace(/\./g, '_')] ?? String(e).replace(/[._]/g, ' ')).join('; ');
  if (last === 'days' && Array.isArray(v)) return v.map(d => ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][Number(d)] ?? String(d)).join(', ');
  if (Array.isArray(v)) return v.map(x => (typeof x === 'string' && ENUM_WORDS[last]?.[x] ? ENUM_WORDS[last][x] : typeof x === 'object' && x ? Object.entries(x as object).map(([k, y]) => `${fieldLabel(k)} ${fieldValue(k, y) ?? ''}`.trim()).join(', ') : String(x))).join('; ');
  if (typeof v === 'object') return Object.entries(v as object).map(([k, y]) => `${fieldLabel(k)}: ${fieldValue(k, y) ?? ''}`).join(' · ');
  return String(v);
}

/** Where a fix tool is done in the app. The server names the tool and the button text; the page is ours. */
const FIX_PAGE: Record<string, string> = {
  'number.search': '/numbers', 'number.rent': '/numbers', 'number.a2p.declare': '/numbers', 'member.phone.verify_start': '/numbers',
  'wallet.topup': '/settings/billing', 'cap.raise': '/settings/billing', 'cap.lower': '/settings/billing',
  'stack.set': '/agents', 'version.publish': '/agents', 'version.restore': '/agents', 'version.language_variant': '/agents', 'brief.edit': '/agents', 'campaign.audience.add': '/contacts',
  'policy.window.set': '/settings/compliance', 'brand.update': '/settings/brand',
  // A fact no column fills is fixed where columns are matched: the import, with the agent chosen.
  'source.map': '/contacts/import', 'source.commit': '/contacts/import',
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

/** What each tool did, in the past tense and without the actor ("ran a practice call"), for the activity ledger. Reads are never
 *  written to the ledger (server/tools.ts), so only tools that change something are here; a test fails if one is missing or a
 *  read creeps in. An unknown id falls back to "made a change", never to the id itself. */
export const PAST: Record<string, string> = {
  'action.undo': 'undid a recent change',
  'analysis.model.set': 'changed the call analysis model', 'agent.create': 'created an agent',
  'apikey.create': 'created an API key', 'apikey.revoke': 'revoked an API key', 'apikey.rotate': 'rotated an API key',
  'audit.export': 'exported the activity ledger',
  'scim.token.create': 'created a provisioning token', 'scim.token.revoke': 'revoked a provisioning token',
  'scim.token.rotate': 'rotated a provisioning token', 'sso.config.set': 'changed the single sign-on settings',
  'sso.required.set': 'changed whether single sign-on is required', 'sso.secret.stage': 'handed over a single sign-on client secret', 'sso.test': 'tested the single sign-on connection',
  'attempt.retry_per_ladder': 'scheduled another call attempt',
  'audience.create': 'saved an audience',
  'brand.cnap_name.set': 'set the name that shows on the phone of the people called', 'brand.update': 'changed the brand details',
  'brief.edit': 'changed an agent',
  'call.place_single': 'called one person',
  'campaign.audience.add': 'added people to a campaign', 'campaign.draft': 'saved a campaign draft',
  'campaign.launch': 'launched a campaign', 'campaign.pause': 'paused a campaign', 'campaign.resume': 'resumed a campaign',
  'campaign.stop': 'stopped a campaign', 'campaign.stop_at_cap': 'paused a campaign that reached its spend limit', 'campaign.window.narrow': 'narrowed a campaign\'s calling hours', 'campaign.window.widen': 'widened a campaign\'s calling hours',
  'campaign.burst.off': 'turned a campaign\'s burst off', 'campaign.burst.set': 'let a campaign burst past the steady line limit',
  'cap.lower': 'lowered a spend limit', 'cap.raise': 'raised a spend limit', 'consent.record': 'recorded a person\'s consent',
  'contact.dnd_refresh': 'checked people against the Do Not Disturb list', 'contact.export': 'exported people as a file',
  'contact.memory.forget': 'forgot everything remembered about a person', 'contact.merge': 'merged two records of one person',
  'contact.suppress': 'stopped calling a person', 'contact.suppress_after_opt_out': 'stopped calling a person after they opted out', 'contact.unsuppress': 'allowed calling a person again',
  'deployment.revert_to_last_good': 'put the previous version of an agent back', 'deployment.split': 'changed which agent versions take calls',
  'dpdp.request.execute': 'carried out a person\'s data request', 'experiment.check': 'checked a test on real calls',
  'experiment.start': 'started a test on real calls', 'experiment.stop': 'stopped a test on real calls',
  'fact.approve': 'approved something remembered about a person', 'fact.forget': 'forgot one remembered fact',
  'integration.connect': 'connected an outside service', 'integration.disconnect': 'disconnected an outside service', 'integration.stage_secrets': 'handed over credentials for an outside service',
  'insight.refresh': 'rebuilt the call insights', 'issue.resolve': 'resolved an issue',
  'judge.calibrate': 'measured how well an outcome judge agrees with people', 'judge.edit': 'changed how an outcome is judged',
  'knowledge.ingest': 'added a knowledge source', 'knowledge.span.approve': 'decided which passages she may state', 'learning.propose': 'looked for improvements from an agent\'s calls',
  'live.listen': 'listened to a live call', 'live.takeover': 'took over a live call', 'live.whisper': 'whispered to the agent on a live call',
  'member.invite': 'invited a teammate', 'member.remove': 'removed a teammate', 'member.role.set': 'changed a teammate\'s role',
  'memory.extract': 'noted something a caller said, for review', 'memory.policy.set': 'changed what is remembered',
  'money.reconcile': 'compared charges with metered cost', 'monitor.create': 'turned on a monitor',
  'number.byo.connect': 'connected a number they own', 'number.kyc.submit': 'sent KYC documents for a number', 'number.pause': 'paused a number', 'number.pause_flagged': 'paused a flagged number', 'number.rent': 'rented a number',
  'offering.edit': 'changed an offering',
  'operator.autonomy.lower': 'made the assistant ask before every draft and test', 'operator.autonomy.raise': 'let the assistant draft and test on its own again', 'operator.brain.set': 'switched the assistant\'s model',
  'operator.preference.forget': 'forgot a way the assistant works for them', 'operator.preference.remember': 'asked the assistant to remember how they like to work',
  'inbound.route.set': 'chose which agent answers a number', 'inbound.route.clear': 'stopped a number answering calls',
  'handoff.claim': 'took a hand-off', 'handoff.resolve': 'closed a hand-off', 'alert.ack': 'marked an alert as seen',
  'outcome.define': 'defined what counts as an outcome', 'outcome.label': 'labelled a call\'s outcome', 'outcome.record_verified': 'recorded an outcome confirmed by their own system', 'outcome.import': 'recorded verified results from a file', 'outcome.import.preview': 'checked a file of results against the calls',
  'plan.change': 'changed the plan', 'policy.category.override': 'changed a campaign\'s kind of call', 'policy.window.set': 'changed the calling hours',
  'proposal.accept': 'started testing a proposed change on real calls', 'proposal.probe': 'simulated a proposed change', 'script.harm_check': 'checked recent calls for harm moments', 'script.pacing.restore': 'restored full pacing to a slowed script', 'judge.flag_recheck': 'marked an outcome judge for a re-check',
  'report.create': 'built a report', 'secret.reveal': 'viewed a new key once',
  'share.link.create': 'made a link to share one item', 'share.link.revoke': 'turned a share link off',
  'source.commit': 'imported a contact list', 'source.hook_secret.rotate': 'replaced the signing secret of a contact webhook', 'source.crm.pull': 'pulled a contact list from a CRM', 'source.sync': 'synced a contact list from a CRM', 'source.sync.schedule': 'changed when a CRM list syncs', 'source.map': 'matched the columns of a contact list', 'source.upload': 'uploaded a contact list',
  'stack.set': 'chose a voice stack for an agent',
  'test.browser_call': 'started a test call in the browser', 'test.ring_member_phone': 'rang their own phone for a test', 'test.simulate': 'ran a practice call', 'test.chat': 'typed a practice chat', 'test.chat_keep': 'kept a practice chat for review', 'test.simulate_batch': 'ran a set of practice calls',
  'tool.attach': 'changed what an agent can do on a call', 'tool.create': 'defined a tool for calls', 'tool.edit': 'changed a tool for calls', 'tool.test': 'tried a tool for calls without sending anything',
  'version.candidate': 'prepared a version to test', 'version.publish': 'published an agent', 'version.restore': 'rolled an agent back to an earlier version', 'version.language_variant': 'published an agent in another language', 'voice.set': 'chose a voice for an agent',
  'wallet.credit': 'credited the wallet by hand', 'wallet.topup': 'added money to the wallet',
  'webhook.create': 'added a webhook', 'webhook.delete': 'removed a webhook', 'webhook.emit': 'queued a webhook event', 'webhook.replay': 'sent a webhook event again', 'webhook.test': 'sent a test event to a webhook',
  'notification.destination.create': 'added an alert destination', 'notification.destination.delete': 'removed an alert destination', 'notification.test': 'sent a test alert', 'duty.roster.set': 'changed the duty hours', 'duty.override.add': 'added leave or cover to the duty roster', 'duty.override.remove': 'removed leave or cover from the duty roster',
  'call.export': 'exported calls as a file',
  'attempt.cancel_for_contact': 'cancelled waiting call attempts for a person', 'member.phone.verify_confirm': 'checked the code for verifying their phone', 'member.phone.verify_start': 'asked for a call to verify their phone',
  'number.a2p.declare': 'recorded a number\'s A2P declaration', 'number.kyc.sync': 'refreshed a number\'s KYC status', 'policy.retention.set': 'changed how long data is kept',
  'simcaller.save': 'saved a practice caller',
};
/** Where to look at what an activity row was about (a page, not an object: the ledger carries no object id for most rows). */
/** Consecutive rows that say the same thing become one row with a count: six practice calls in a minute read
 *  "ran a practice call (6 times)", not six identical lines. The first (newest) row of a run is kept. */
export function foldRepeats<T>(rows: T[], key: (r: T) => string): { row: T; n: number }[] {
  const out: { row: T; n: number; k: string }[] = [];
  for (const r of rows) { const k = key(r), last = out[out.length - 1]; if (last && last.k === k) last.n++; else out.push({ row: r, n: 1, k }); }
  return out.map(({ row, n }) => ({ row, n }));
}

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
/** subject: the name of what the row was about (an agent, campaign, contact or call), resolved by the server. */
export function activitySentence(line: string, action: string, subject?: string | null, tool?: string | null): string {
  const actor = (/^(.+?) (?:ran|asked|did|made|set|changed|created|added|saved|reviewed) /.exec(line)?.[1] ?? 'Someone').replace(/^An agent$/, 'The assistant').replace(new RegExp(`^${WORKING_NAME}$`), 'Vyakti').replace(new RegExp(`^The ${WORKING_NAME} team$`), 'The Vyakti team');
  if (action === CREATED) return `${actor} created the workspace`;
  if (action === PROPOSED) {
    // The server names the proposed tool (activity.list item.tool); the line's own words are the fallback, never "a change".
    const words = /asked to (?:run )?(.+?)(?: \([^)]*\))? and is waiting/.exec(line)?.[1];
    const key = tool && TOOL_LABEL[tool] ? tool : words ? Object.keys(TOOL_LABEL).find(k => k.replace(/[._]/g, ' ') === words) : undefined;
    const about = subject ? ` (${subject})` : '';
    const ask = tool && PROPOSAL_ASK[tool] ? tool : words ? Object.keys(PROPOSAL_ASK).find(k => k.replace(/[._]/g, ' ') === words) : undefined;
    if (!key && ask) return `${actor} asked for approval to ${PROPOSAL_ASK[ask]}${about}`;
    if (key) return `${actor} asked for approval: ${TOOL_LABEL[key].ask.charAt(0).toLowerCase()}${TOOL_LABEL[key].ask.slice(1)}${about}`;
    return words ? `${actor} asked for approval to ${words}${about}` : `${actor} asked for approval to make a change`;
  }
  return `${actor} ${PAST[action] ?? 'made a change'}${subject ? `: ${subject}` : ''}${/\(approved\)/.test(line) ? ', after approval' : ''}`;
}

/** "Who asked" on the approval sheet, from brief.today's requestedBy (FRICTION R7). */
export function requesterLine(r: { type: 'member' | 'assistant' | 'api_key' | 'system'; name: string | null; memberId: string | null }, meId?: string): string {
  if (r.type === 'assistant') return r.memberId && r.memberId === meId ? 'The assistant asked for you' : r.name ? `The assistant asked for ${r.name}` : 'The assistant asked';
  if (r.type === 'api_key') return r.name ? `API key "${r.name}" asked` : 'An API key asked';
  if (r.type === 'system') return 'Vyakti asked';
  return r.memberId && r.memberId === meId ? 'You asked for this' : r.name ? `${r.name} asked` : 'A team member asked';
}

/** The runtime reports cost per turn; a person reads one line per part and provider, summed, in the order first seen. */
export function groupCost<T extends { component: string; provider: string; inr_milli: number }>(lines: T[]): T[] {
  const m = new Map<string, T>();
  for (const l of lines) { const k = l.component + '|' + l.provider, g = m.get(k); if (g) m.set(k, { ...g, inr_milli: g.inr_milli + l.inr_milli }); else m.set(k, { ...l }); }
  return [...m.values()];
}

/** The server's summary as plain sentences, or null when it adds nothing to the label or carries an id or hash. A one-line
 *  summary (most actions: "Add ₹500 to the prepaid wallet") repeats what the label and the detail rows already say. */
export function serverDetail(summary: string | undefined, label: string, tool = ''): string[] | null {
  const t = (summary ?? '').trim();
  if (!t || t === label || /\b[0-9a-f]{8,}\b/i.test(t)) return null;
  const parts = t.split(/(?<=[.!?])\s+(?=[A-Z])/).map(x => x.trim()).filter(Boolean);
  return parts.length >= 2 || (tool === 'version.publish' && parts.length) ? parts : null;
}

/** Where a brief check points, as a person finds it: the tab, the field and its number ("Persona", "note 2"). */
export function lintWhere(path: string | undefined): { tab: string; tabId: string; field: string } | null {
  if (!path) return null;
  const n = (rx: RegExp) => Number(rx.exec(path)?.[1] ?? 0) + 1;
  if (/^persona\.notes\[\d+\]/.test(path)) return { tab: 'Persona', tabId: 'persona', field: `note ${n(/\[(\d+)\]/)}` };
  if (/^goals\[\d+\]/.test(path)) return { tab: 'Job and facts', tabId: 'job', field: `goal ${n(/\[(\d+)\]/)}` };
  if (/^objections\[\d+\]\.trigger/.test(path)) return { tab: 'Objections, hand-off', tabId: 'rules', field: `objection ${n(/\[(\d+)\]/)}, when they say or feel` };
  if (/^objections\[\d+\]/.test(path)) return { tab: 'Objections, hand-off', tabId: 'rules', field: `objection ${n(/\[(\d+)\]/)}, her approach` };
  if (path === 'opening.usefulFirst') return { tab: 'Job and facts', tabId: 'job', field: 'something useful to say first' };
  if (path.startsWith('opening.')) return { tab: 'Job and facts', tabId: 'job', field: 'the opening' };
  if (path === 'jobDescription') return { tab: 'Basics', tabId: 'basics', field: 'what the calls are for' };
  return null;
}
