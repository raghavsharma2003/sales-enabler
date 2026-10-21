// DEV-ONLY stand-in tools so the web app can be run and seen before the real modules land. Same tool ids, SYNTHETIC data,
// phones +91 90000 000xx. It skips any tool a real module has already registered, and server/main.ts must never import it.
// Every result is stamped `_sample: true` so the UI shows its "Sample data" ribbon.
import type { Module } from '../../server/app.ts';
import type { Registry, ToolCtx } from '../../server/tools.ts';
import { tool } from '../../server/tools.ts';
import { any } from '../../shared/validate.ts';
import type { RiskClass } from '../../shared/approval.ts';
import { normaliseIndianPhone } from '../../shared/phone.ts';
import { formatInr } from '../../shared/money.ts';
import * as D from './mock-data.ts';
import type { AgentConfigDraft, AgentDoc, CallDoc, CampaignDoc, ContactDoc, ImportPreview, SimResult } from '../src/types.ts';

interface State {
  agents: AgentDoc[]; contacts: ContactDoc[]; audiences: ReturnType<typeof D.audiences>; campaigns: CampaignDoc[]; calls: CallDoc[];
  numbers: ReturnType<typeof D.numbers>; members: ReturnType<typeof D.members>; keys: ReturnType<typeof D.apiKeys>; knowledge: ReturnType<typeof D.knowledge>;
  brand: { name: string; spokenName: string; domains: string[]; logoText: string }; wallet: { balanceMilli: number; spentTodayMilli: number; capTodayMilli: number | null };
  activity: ReturnType<typeof D.activity>; n: number;
}
const states = new Map<string, State>();
function st(ws: string): State {
  let s = states.get(ws);
  if (!s) {
    s = { agents: D.agents(), contacts: D.contacts(), audiences: D.audiences(), campaigns: D.campaigns(), calls: D.calls(), numbers: D.numbers(), members: D.members(), keys: D.apiKeys(), knowledge: D.knowledge(),
      brand: { name: 'Saanjh Services', spokenName: 'Saanjh', domains: ['saanjh.example'], logoText: 'S' }, wallet: { balanceMilli: 4_216_000, spentTodayMilli: 1_686_000, capTodayMilli: 6_000_000 }, activity: D.activity(), n: 100 };
    states.set(ws, s);
  }
  return s;
}
const mark = <T,>(v: T): T => (v && typeof v === 'object' && !Array.isArray(v) ? ({ ...(v as object), _sample: true } as T) : v);
const clone = <T,>(v: T): T => structuredClone(v);
const hashOf = (v: unknown) => { const s = JSON.stringify(v); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); };
const inr = (m: number) => formatInr(m, { paise: false });

type Fn = (s: State, i: any, ctx: ToolCtx) => unknown | Promise<unknown>;
function def(reg: Registry, name: string, risk: RiskClass, summary: string, run: Fn, x: { describe?: (i: any, s: State) => string; version?: (s: State, i: any) => string; roles?: any } = {}) {
  if (reg.get(name)) return;   // a real module owns it
  reg.register(tool(any(), {
    name, risk, summary, roles: x.roles,
    describe: x.describe ? (i: unknown) => x.describe!(i ?? {}, st('describe-only')) : undefined,
    version: x.version ? async (ctx: ToolCtx, i: unknown) => x.version!(st(ctx.workspaceId), i ?? {}) : undefined,
    run: async (ctx: ToolCtx, i: unknown) => mark(await run(st(ctx.workspaceId), (i ?? {}) as any, ctx)),
  }));
}
// describe() has no ctx, so descriptions use the args plus the seed names; keep them argument-driven.

const need = <T,>(v: T | undefined | null, what: string): T => { if (v == null) throw new Error(`${what} was not found`); return v; };
function merge(a: any, b: any): any {
  if (Array.isArray(b) || b === null || typeof b !== 'object') return b;
  const out = { ...(a ?? {}) };
  for (const k of Object.keys(b)) out[k] = merge(out[k], b[k]);
  return out;
}

export const mockModule: Module = {
  name: 'web-dev-mock',
  register(reg: Registry) {
    // ---- agents
    def(reg, 'agent.list', 'read', 'List the workspace\'s agents', s => ({ rows: s.agents.map(D.agentRow) }));
    def(reg, 'agent.get', 'read', 'One agent with its draft config and version history', (s, i) => clone(need(s.agents.find(a => a.id === i.id), 'that agent')));
    def(reg, 'agent.create', 'draft', 'Create a draft agent for a job', (s, i) => {
      const id = 'a_' + (++s.n); const base = clone(s.agents[0]);
      const doc: AgentDoc = { ...base, id, name: String(i.name ?? 'New agent'), version: 1, publishedVersion: null, updatedAt: new Date().toISOString(), versions: [{ version: 1, at: new Date().toISOString(), by: 'You', state: 'draft' }] };
      doc.config = { ...doc.config, job: String(i.job ?? 'custom'), voice: { stackId: null, speed: 1 }, persona: { ...doc.config.persona, name: String(i.persona ?? 'Asha') } };
      s.agents.unshift(doc); return { id };
    });
    def(reg, 'agent.update', 'draft', 'Save changes to an agent\'s draft', (s, i) => {
      const a = need(s.agents.find(x => x.id === i.id), 'that agent');
      a.config = merge(a.config, i.patch ?? {}) as AgentConfigDraft;
      if (a.publishedVersion === a.version) { a.version += 1; a.versions.unshift({ version: a.version, at: new Date().toISOString(), by: 'You', state: 'draft' }); }
      a.updatedAt = new Date().toISOString(); return clone(a);
    });
    def(reg, 'version.publish', 'external', 'Make an agent version live', (s, i) => {
      const a = need(s.agents.find(x => x.id === i.agentId), 'that agent');
      if (!a.config.voice.stackId) throw new Error('Choose a voice stack first. There is no default.');
      a.publishedVersion = a.version; a.versions.forEach(v => { v.state = v.version === a.version ? 'live' : 'old'; }); return { agentId: a.id, version: a.version };
    }, { describe: i => `Make ${i.name ?? 'this agent'} version ${i.version ?? ''} live. New campaigns use it; calls in progress finish on the old version.`.replace('  ', ' '), version: (s, i) => { const a = s.agents.find(x => x.id === i.agentId); return a ? `${a.version}:${hashOf(a.config)}` : 'none'; } });
    def(reg, 'test.simulate', 'test', 'Run practice callers against a draft agent', (s, i) => {
      const a = need(s.agents.find(x => x.id === i.agentId), 'that agent');
      const names = ['Hurried driver', 'Suspicious of the call', 'Hard of hearing', 'Asks for a person', 'Says price is high', 'Says stop calling'];
      const noStack = !a.config.voice.stackId;
      const results: SimResult[] = names.map((n, k) => ({
        id: `sim_${k}`, scenario: n, verdict: noStack ? 'invalid' : (k === 2 ? 'fail' : 'pass'), reason: noStack ? 'No voice stack chosen, so nothing ran. A test never falls back to another stack.' : k === 2 ? 'Repeated the date twice before the caller answered; she should have asked to speak slower once.' : undefined,
        ran: noStack ? undefined : D.STACK_PRICE[a.config.voice.stackId!] ? a.config.voice.stackId! : undefined,
        turns: noStack ? [] : [{ who: 'agent', text: `Namaste, main ${a.config.persona.name}, ${a.config.brand.spokenName} ki AI assistant. Aapki ${a.config.job.replace('_', ' ')} ke baare mein ek chhoti baat thi.`, gapMs: 0 }, { who: 'caller', text: k === 5 ? 'Mujhe dobara phone mat karna.' : k === 3 ? 'Kisi insaan se baat karao.' : 'Haan boliye, jaldi.' }, { who: 'agent', text: k === 5 ? 'Theek hai, maine aapka number hata diya. Dhanyavaad.' : k === 3 ? 'Zaroor, main aapko team se jod rahi hoon.' : 'Bas do minute, main link bhej deti hoon.', gapMs: 900 + k * 130 }],
        costMilli: noStack ? 0 : 2000,
        checks: noStack ? [] : [{ label: 'AI disclosure spoken once', ok: true }, { label: 'No number or OTP asked', ok: true }, { label: k === 5 ? 'Opt-out honoured in one turn' : 'Stayed inside the agenda', ok: true }, { label: 'Hang-up was clean', ok: k !== 2 }],
      }));
      return { results, passed: results.filter(r => r.verdict === 'pass').length, total: results.length };
    });
    def(reg, 'test.browser_call', 'test', 'Start a browser call with your agent', () => ({ available: false, reason: 'The voice runtime is not connected to this dev server, so no browser call can start. Practice callers still work.' }));
    def(reg, 'money.estimate', 'read', 'Estimate cost for a stack', (_s, i) => {
      const p = D.STACK_PRICE[String(i.stackId)] ?? { perMinuteMilli: null, basis: 'Unknown stack' };
      const minutes = Number(i.minutes ?? 1);
      return { perMinuteInrMilli: p.perMinuteMilli, totalInrMilli: p.perMinuteMilli == null ? null : p.perMinuteMilli * minutes, basis: p.basis, grade: p.perMinuteMilli == null ? 'not_measured' : 'estimate' };
    });
    def(reg, 'knowledge.list', 'read', 'Knowledge sources', s => ({ rows: s.knowledge }));
    def(reg, 'knowledge.add', 'draft', 'Add a knowledge source', (s, i) => { const k = { id: 'kn_' + (++s.n), title: String(i.title ?? 'Untitled'), kind: (i.kind ?? 'text') as 'text', status: 'pending' as const, facts: 0, addedAt: new Date().toISOString(), purpose: String(i.purpose ?? 'service') }; s.knowledge.unshift(k); return k; });

    // ---- contacts
    def(reg, 'contact.list', 'read', 'Search contacts', (s, i) => {
      const q = String(i.q ?? '').toLowerCase();
      let r = s.contacts.filter(c => (!q || c.name.toLowerCase().includes(q) || c.phone.includes(q)) && (!i.audienceId || c.audiences.includes(s.audiences.find(a => a.id === i.audienceId)?.name ?? '')) && (!i.consent || c.consent === i.consent));
      return { rows: r.slice(0, 60).map(D.toRow), total: r.length };
    });
    def(reg, 'contact.get', 'read', 'One contact with consent, attempts and memory', (s, i) => clone(need(s.contacts.find(c => c.id === i.id), 'that contact')));
    def(reg, 'contact.import_preview', 'draft', 'Read a CSV, map its columns and give a verdict for every row', (s, i) => importPreview(s, i));
    def(reg, 'contact.import_commit', 'draft', 'Import the checked rows as contacts and an audience', (s, i) => {
      const p = importPreview(s, i); const good = p.rows.filter(r => r.verdict === 'ok' || r.verdict === 'fixed');
      const aud = { id: 'aud_' + (++s.n), name: String(i.audienceName ?? 'Imported list'), count: p.rows.length, callable: good.length, description: `Imported ${new Date().toLocaleDateString('en-IN')} with ${i.consentBasis ?? 'consent basis not stated'}` };
      s.audiences.unshift(aud);
      good.forEach(r => { const doc = clone(s.contacts[0]); doc.id = 'ct_' + (++s.n); doc.name = r.raw[p.columns.find(c => c.field === 'name')?.name ?? ''] ?? 'Unnamed'; doc.phone = r.shown ?? doc.phone; doc.audiences = [aud.name]; doc.attempts = 0; doc.lastOutcome = null; doc.attemptHistory = []; doc.memory.facts = []; s.contacts.unshift(doc); });
      return { importId: 'imp_' + s.n, audienceId: aud.id, counts: p.counts };
    });
    def(reg, 'audience.list', 'read', 'Audiences', s => ({ rows: s.audiences }));
    def(reg, 'audience.create', 'draft', 'Create an audience from a filter', (s, i) => { const a = { id: 'aud_' + (++s.n), name: String(i.name ?? 'New audience'), count: 0, callable: 0, description: String(i.filter ?? '') }; s.audiences.unshift(a); return a; });

    // ---- campaigns
    def(reg, 'campaign.list', 'read', 'List campaigns', s => ({ rows: s.campaigns.map(({ window, pace, retries, live, checks, funnel, versionPill, ...row }) => row) }));
    def(reg, 'campaign.get', 'read', 'One campaign with policy, live meters, checks and funnel', (s, i) => clone(need(s.campaigns.find(c => c.id === i.id), 'that campaign')));
    def(reg, 'campaign.draft', 'draft', 'Save a campaign draft', (s, i) => {
      const agent = s.agents.find(a => a.id === i.agentId); const aud = s.audiences.find(a => a.id === i.audienceId);
      const id = i.id ?? 'cmp_' + (++s.n);
      const base = clone(s.campaigns[1]); base.id = id; base.name = String(i.name ?? 'New campaign'); base.agentId = String(i.agentId ?? ''); base.agentName = agent?.config.persona.name ?? ''; base.audience = aud?.name ?? '';
      base.contacts = aud?.callable ?? 0; base.status = 'draft'; base.category = String(i.category ?? 'service'); base.capMilli = i.capMilli ?? null;
      if (i.window) base.window = i.window; if (i.pace) base.pace = { ...base.pace, ...i.pace }; if (i.retries) base.retries = i.retries;
      base.versionPill = `${base.agentName} v${agent?.version ?? 1} · Draft · saved`;
      base.checks = base.checks.map(c => c.id === 'limits' ? { ...c, state: base.capMilli ? 'ok' : 'warn', detail: base.capMilli ? `Cap ${inr(base.capMilli)}` : 'No spend cap yet' } : c);
      const at = s.campaigns.findIndex(c => c.id === id); if (at >= 0) s.campaigns[at] = base; else s.campaigns.unshift(base);
      return { id };
    });
    def(reg, 'campaign.estimate', 'read', 'Estimate who, how long and what it costs', (s, i) => estimate(s, i));
    def(reg, 'campaign.test_row', 'read', 'What the agent would say to one row', (s, i) => {
      const c = s.contacts[Math.max(0, Number(i.row ?? 12) - 1) % s.contacts.length]; const a = s.agents.find(x => x.id === i.agentId) ?? s.agents[0];
      return { row: Number(i.row ?? 12), language: c.language, text: `Namaste ${c.name.split(' ')[0]} ji, main ${a.config.persona.name} bol rahi hoon, ${a.config.brand.spokenName} ki taraf se ek AI assistant. ${a.config.opening.usefulFirst}. Do minute hain aapke paas?` };
    });
    def(reg, 'campaign.launch', 'external', 'Launch a campaign: start dialling real people', (s, i) => {
      const c = need(s.campaigns.find(x => x.id === i.id), 'that campaign'); c.status = 'running'; c.startAt = new Date().toISOString(); c.live = { ...c.live, live: 4, ringing: 2, queued: c.contacts }; return { id: c.id, status: c.status };
    }, { describe: i => `Launch ${i.name ?? i.id === 'cmp_appt' ? 'Appointment reminders Nov' : i.id}: call 298 people between 10:00 and 19:00 IST. Estimated ₹1,100 to ₹1,650 including GST, capped at ₹2,000.`, version: (s, i) => { const c = s.campaigns.find(x => x.id === i.id); return c ? `${c.status}:${c.contacts}:${hashOf(c.window)}` : 'none'; } });
    for (const [verb, to] of [['pause', 'paused'], ['resume', 'running'], ['stop', 'done']] as const) {
      def(reg, `campaign.${verb}`, 'external', `${verb[0].toUpperCase() + verb.slice(1)} a campaign`, (s, i) => { const c = need(s.campaigns.find(x => x.id === i.id), 'that campaign'); c.status = to; if (to !== 'running') c.live = { ...c.live, live: 0, ringing: 0 }; return { id: c.id, status: c.status, placed: c.dialled }; },
        { describe: i => `${verb[0].toUpperCase() + verb.slice(1)} this campaign. Calls already placed stay as they are.`, version: (s, i) => s.campaigns.find(x => x.id === i.id)?.status ?? 'none' });
    }
    def(reg, 'policy.window.set', 'policy', 'Change a campaign\'s calling window', (s, i) => { const c = need(s.campaigns.find(x => x.id === i.id), 'that campaign'); c.window = i.window; return { id: c.id, window: c.window }; },
      { describe: i => `Set the calling window to ${i.window?.start ?? '?'} to ${i.window?.end ?? '?'} IST on ${(i.window?.days ?? []).join(', ')}.`, version: (s, i) => hashOf(s.campaigns.find(x => x.id === i.id)?.window) });

    // ---- calls
    def(reg, 'call.search', 'read', 'Search calls', (s, i) => {
      const q = String(i.q ?? '').toLowerCase();
      const r = s.calls.filter(c => (!q || c.contactName.toLowerCase().includes(q) || c.phone.includes(q) || c.outcome.includes(q)) && (!i.outcome || (i.outcome === 'failed' ? ['carrier_failed', 'no_answer'].includes(c.outcome) : c.outcome === i.outcome)) && (!i.campaign || c.campaign === i.campaign));
      return { rows: r.slice(0, 50).map(D.callRow), total: r.length };
    });
    def(reg, 'call.get', 'read', 'One call with transcript, moments, quotes and compliance trace', (s, i) => clone(need(s.calls.find(c => c.id === i.id), 'that call')));
    def(reg, 'call.explain', 'read', 'Explain why a call ended the way it did, with quotes', (s, i) => {
      const c = need(s.calls.find(x => x.id === i.id), 'that call');
      return { text: `${c.summary} ${c.outcomeDetail.reason}.`, evidence: c.quotes.map(q => ({ atSec: q.atSec, quote: q.text })) };
    });

    // ---- insights
    def(reg, 'insight.funnel', 'read', 'Funnel with the reason at every drop', (s, i) => ({ stages: clone(s.campaigns.find(c => c.id === (i.campaignId ?? 'cmp_renew'))!.funnel), asOf: new Date().toISOString(), campaign: i.campaignId ?? 'cmp_renew' }));
    def(reg, 'insight.issues', 'read', 'Open issues', () => ({ rows: D.issues() }));
    def(reg, 'learning.proposals', 'read', 'Learning proposals and the learning level', () => ({ rows: D.proposals(), level: { id: 'L1', label: 'Listening', note: 'VP watches calls and proposes changes. Nothing changes without your tap.' } }));
    def(reg, 'learning.decide', 'external', 'Start testing a proposed change on real calls', () => ({ started: true }), { describe: i => `Test "${i.title ?? 'this change'}" on the next 160 calls (half old, half new). Callers hear either version.` });
    def(reg, 'experiment.list', 'read', 'Experiments', () => ({ rows: [{ id: 'ex_1', name: 'Link before due date', state: 'testing', armA: 'Link after the call', armB: 'Link before the due date', callsSoFar: 112, callsToProve: 300, effect: null, note: 'Under-powered: 112 of 300 calls so far. No winner can be shown yet.' }] }));

    // ---- numbers
    def(reg, 'number.list', 'read', 'Numbers', s => ({ rows: s.numbers }));
    def(reg, 'number.quote', 'read', 'Price and timeline for a number before you buy', (_s, i) => ({ kind: i.kind ?? 'rent', priceMilli: null, setupDays: i.kind === 'byo' ? '3 to 7 working days' : '1 to 2 working days', note: 'No rate has been set for rented numbers yet, so no price is shown. Nothing is charged until you approve.' }));
    def(reg, 'number.rent', 'spend', 'Rent a number in your name', (s, i) => { s.numbers.push({ id: 'nm_' + (++s.n), e164: '+919000000099', provider: 'Rented (VP)', kind: 'rented', series: '140 (service)', status: 'kyc_pending', category: String(i.category ?? 'service'), note: 'KYC needed before production calls.', monthlyMilli: null }); return { ok: true }; }, { describe: () => 'Rent one 140-series number in your business name. Price: not set yet, so ₹0 is charged now.' });
    def(reg, 'number.verify_start', 'test', 'Verify your own phone by a missed call', () => ({ state: 'awaiting_missed_call', dialTo: '+91 80000 00099', expiresInS: 300 }));

    // ---- settings
    def(reg, 'member.list', 'read', 'Team', s => ({ rows: s.members }));
    def(reg, 'member.invite', 'policy', 'Invite a teammate', (s, i) => { s.members.push({ id: 'mb_' + (++s.n), name: String(i.email).split('@')[0], email: String(i.email), role: String(i.role ?? 'viewer'), status: 'invited', lastSeen: null }); return { ok: true }; }, { describe: i => `Invite ${i.email ?? 'a teammate'} as ${i.role ?? 'viewer'}. They can see and do what that role allows.` });
    def(reg, 'member.role.set', 'policy', 'Change a teammate\'s role', (s, i) => { need(s.members.find(m => m.id === i.id), 'that member').role = i.role; return { ok: true }; }, { describe: i => `Change this teammate's role to ${i.role}.` });
    def(reg, 'apikey.list', 'read', 'API keys', s => ({ rows: s.keys }));
    def(reg, 'apikey.create', 'policy', 'Create an API key (shown once)', (s, i) => { const k = { id: 'key_' + (++s.n), label: String(i.label ?? 'Key'), prefix: 'vp_91c4e0aa_…', createdAt: new Date().toISOString(), lastUsed: null, scope: String(i.scope ?? 'builder') }; s.keys.push(k); return { key: k, secret: 'vp_91c4e0aa_SAMPLE-ONLY-NOT-A-REAL-KEY' }; }, { describe: i => `Create an API key "${i.label ?? ''}" with ${i.scope ?? 'builder'} access. It is shown once.` });
    def(reg, 'apikey.revoke', 'policy', 'Revoke an API key', (s, i) => { s.keys = s.keys.filter(k => k.id !== i.id); return { ok: true }; }, { describe: () => 'Revoke this API key. Anything using it stops working at once.' });
    def(reg, 'brand.get', 'read', 'Brand and spoken name', s => ({ ...s.brand }));
    def(reg, 'brand.set', 'draft', 'Save brand', (s, i) => { s.brand = { ...s.brand, ...i }; return s.brand; });
    def(reg, 'wallet.get', 'read', 'Wallet', s => ({ ...s.wallet, runwayDays: Math.round((s.wallet.balanceMilli / Math.max(1, s.wallet.spentTodayMilli)) * 10) / 10 }));
    def(reg, 'wallet.topup', 'spend', 'Add money to the wallet', (s, i) => { s.wallet.balanceMilli += Number(i.amountMilli ?? 0); return { balanceMilli: s.wallet.balanceMilli }; }, { describe: i => `Add ${inr(Number(i.amountMilli ?? 0))} to your wallet. Spend is not reversible in the product.` });
    def(reg, 'billing.summary', 'read', 'What you have spent, by component, and your price', () => ({
      periodLabel: 'This month so far', pricePerMinute: null,
      lines: [{ label: 'Telephony', qty: '1,226 connected minutes', costMilli: 6_743_000, grade: 'estimate' }, { label: 'Voice', qty: '1,226 minutes', costMilli: 7_356_000, grade: 'estimate' }, { label: 'Brain', qty: '2,452 replies', costMilli: 1_960_000, grade: 'estimate' }, { label: 'Ears', qty: '1,226 minutes', costMilli: 1_471_000, grade: 'estimate' }, { label: 'Practice callers', qty: '24 runs', costMilli: 288_000, grade: 'estimate' }],
      gstNote: 'GST is added on your invoice. Figures here are before GST.', basis: 'Stand-in split. The real meter is read from each call\'s cost lines.' }));
    def(reg, 'compliance.get', 'read', 'Compliance posture', () => ({
      windows: 'Calls only between 10:00 and 19:00 IST in the contact\'s local time', disclosure: { locked: true, text: 'Said once, lightly, after something useful. Cannot be removed.' },
      checks: [{ label: 'DND checked before every attempt', state: 'on' }, { label: 'Opt-outs honoured within one turn', state: 'on' }, { label: 'No OTP, PIN or card number is ever asked', state: 'on' }, { label: 'Crisis lines (Tele-MANAS 14416, 112) stay in every brief', state: 'on' }],
      categories: [{ id: 'service', label: 'Service', series: '140', note: 'Existing customers, about their own account' }, { id: 'transactional', label: 'Transactional', series: '160', note: 'Orders, appointments, payments' }, { id: 'promotional', label: 'Promotional', series: '140 + consent', note: 'Needs a recorded consent per person' }] }));
    def(reg, 'privacy.get', 'read', 'Privacy posture', () => ({ region: 'India', retention: [{ what: 'Call recordings', days: 90 }, { what: 'Transcripts', days: 180 }], recording: { enabled: true, announce: true }, memory: { status: 'off by default for new workspaces' }, note: 'Recordings and transcripts stay in India. Practice calls never write memory.' }));
    def(reg, 'dpdp.request.list', 'read', 'People\'s data requests', () => ({ rows: [{ id: 'dp_1', kind: 'forget', who: 'Mohan Das', state: 'done', at: new Date(Date.now() - 86400000 * 3).toISOString() }] }));
    def(reg, 'activity.list', 'read', 'What VP did', s => ({ rows: s.activity, summary: { drafts: 9, tests: 3, guards: 2 } }));
  },
};

function importPreview(s: State, i: any): ImportPreview {
  const text = String(i.csv ?? '');
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const head = (lines[0] ?? '').split(',').map(h => h.trim());
  const rows = lines.slice(1).map(l => l.split(',').map(c => c.trim()));
  const guess = (h: string) => { const x = h.toLowerCase(); return /name|naam/.test(x) ? 'name' : /phone|mobile|number|contact|no\b/.test(x) ? 'phone' : /lang/.test(x) ? 'language' : /city|town/.test(x) ? 'city' : /due|date/.test(x) ? 'due_date' : /premium|amount|emi/.test(x) ? 'premium' : null; };
  const mapping: Record<string, string | null> = i.mapping ?? Object.fromEntries(head.map(h => [h, guess(h)]));
  const columns = head.map((h, c) => ({ name: h, sample: rows.slice(0, 3).map(r => r[c] ?? ''), field: mapping[h] ?? null, confidence: guess(h) ? 0.9 : 0.2 }));
  const phoneCol = head.findIndex(h => mapping[h] === 'phone');
  const suppressed = new Set(s.contacts.filter(c => c.suppressed).map(c => c.phone));
  const seen = new Set<string>();
  const out = rows.map((r, n) => {
    const raw = Object.fromEntries(head.map((h, c) => [h, r[c] ?? '']));
    if (phoneCol < 0) return { n: n + 1, raw, verdict: 'review' as const, reason: 'No column is mapped to the phone number yet' };
    const p = normaliseIndianPhone(r[phoneCol]);
    if (!p.ok) return { n: n + 1, raw, verdict: 'skipped' as const, reason: ({ EMPTY: 'The phone cell is empty', SCI_NOTATION: 'Excel turned the number into 9.1E+11; the digits are lost. Re-export the column as text', NON_INDIAN: 'A +country code other than +91; kept but not dialled', TOO_SHORT: 'Too few digits', TOO_LONG: 'Too many digits', INVALID_PREFIX: 'An Indian mobile number cannot start with that digit', NOT_A_NUMBER: 'Not a phone number', LANDLINE_TRUNCATED: 'A landline with missing digits' } as Record<string, string>)[p.reason] ?? p.reason };
    if (suppressed.has(p.e164)) return { n: n + 1, raw, verdict: 'suppressed' as const, reason: 'This person asked not to be called', shown: p.e164 };
    if (seen.has(p.e164)) return { n: n + 1, raw, verdict: 'skipped' as const, reason: 'Duplicate of an earlier row', shown: p.e164 };
    seen.add(p.e164);
    const fixed = p.e164.replace('+91', '') !== (r[phoneCol] ?? '').replace(/\D/g, '');
    return { n: n + 1, raw, verdict: fixed ? 'fixed' as const : 'ok' as const, reason: fixed ? 'Written as ' + (r[phoneCol] || '') + '; saved as ' + p.e164 : undefined, shown: p.e164 };
  });
  const count = (v: string) => out.filter(r => r.verdict === v).length;
  const dateCol = head.findIndex(h => mapping[h] === 'due_date');
  const ambiguous = dateCol >= 0 && rows.some(r => /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(r[dateCol] ?? '') && Number((r[dateCol] ?? '').split(/[/-]/)[0]) <= 12 && Number((r[dateCol] ?? '').split(/[/-]/)[1]) <= 12);
  return {
    columns, fields: [{ key: 'name', label: 'Name', required: true }, { key: 'phone', label: 'Phone', required: true }, { key: 'language', label: 'Language' }, { key: 'city', label: 'City' }, { key: 'due_date', label: 'Due date' }, { key: 'premium', label: 'Amount' }],
    rows: out, counts: { in: out.length, callable: count('ok') + count('fixed'), fixed: count('fixed'), skipped: count('skipped'), suppressed: count('suppressed'), review: count('review') },
    question: ambiguous ? { text: 'Dates like 03/11/2025 could be 3 November or 11 March. Which order do you use?', defaultAnswer: 'DD/MM' } : null,
  };
}

function estimate(s: State, i: any) {
  const aud = s.audiences.find(a => a.id === i.audienceId) ?? s.audiences[0];
  const agent = s.agents.find(a => a.id === i.agentId);
  const stack = agent?.config.voice.stackId ?? null;
  const per = stack ? D.STACK_PRICE[stack]?.perMinuteMilli ?? null : null;
  const callable = aud.callable; const minutes: [number, number] = [Math.round(callable * 1.1), Math.round(callable * 2.1)];
  const gst = 1.18;
  return {
    contacts: aud.count, callable, minutesRange: minutes,
    costRangeMilli: per == null ? null : [Math.round(minutes[0] * per * gst), Math.round(minutes[1] * per * gst)] as [number, number],
    perMinuteMilli: per == null ? null : Math.round(per * gst),
    gstNote: 'Including 18% GST', outcomeRange: [Math.round(callable * 0.12), Math.round(callable * 0.21)] as [number, number],
    basis: per == null ? (stack ? 'This stack has no price reading yet, so no total is shown.' : 'Choose a voice stack for the agent first; the price depends on it.') : 'Stand-in estimate from list prices, not a meter reading',
    finishBy: new Date(Date.now() + 86400000 * 2).toISOString(),
    sampleOpening: null,
    checks: s.campaigns[1].checks,
  };
}
