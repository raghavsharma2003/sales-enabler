// Plain words for what the server says in developer terms. Rule: no tool id, raw argument name, internal code or milli-unit ever
// reaches a person. Everything here is a fallback for text the server has not yet made human; the server's own plain text wins.
import { inr, phone as fmtPhone } from './format.ts';
import type { Blocker } from './types.ts';

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
  'operator.brain.set': { ask: 'Switch the brain', done: 'Brain switched' },
  'operator.autonomy.raise': { ask: 'Let Saarthi draft and test on its own', done: 'Saarthi can draft and test on its own' },
  'operator.autonomy.lower': { ask: 'Ask before every draft and test', done: 'Saarthi now asks first' },
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
