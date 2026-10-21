// SYNTHETIC data for the stand-in tools. Every person is fictional, every phone is +91 90000 000xx, every figure is made up.
// Nothing here is a measurement; mock-module.ts stamps `_sample: true` on every result so the UI shows the sample ribbon.
import type { AgentConfigDraft, AgentDoc, AgentRow, AudienceRow, CallDoc, CallRow, CallTurn, CampaignDoc, CampaignRow, Check, ContactDoc, ContactRow, FunnelStage, Issue, KnowledgeItem, Member, NumberRow, Proposal, ActivityRow, ApiKey } from '../src/types.ts';

let seed = 7;
export const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();

const NAMES = ['Sunita Verma', 'Imran Qureshi', 'Lakshmi Iyer', 'Gurpreet Singh', 'Anita Deshmukh', 'Rohan Mehta', 'Farah Sheikh', 'Vikram Rao', 'Meenal Joshi', 'Arjun Nair', 'Pooja Bhatt', 'Kiran Patel',
  'Deepak Sinha', 'Shreya Kulkarni', 'Mohan Das', 'Nasreen Ali', 'Harish Reddy', 'Tanvi Shah', 'Suresh Pillai', 'Kavita Menon', 'Rajiv Malhotra', 'Isha Banerjee', 'Dhruv Agarwal', 'Zoya Khan'];
const CITIES = ['Pune', 'Jaipur', 'Lucknow', 'Chennai', 'Indore', 'Kochi', 'Nagpur', 'Patna'];
const LANGS = ['hinglish', 'hi-IN', 'en-IN', 'hinglish', 'ta-IN', 'hinglish'];
export const e164 = (i: number) => `+9190000000${String(i).padStart(2, '0')}`;

export function contacts(): ContactDoc[] {
  return NAMES.map((name, i) => {
    const consent = i === 5 ? 'revoked' : i % 9 === 4 ? 'unknown' : 'granted';
    const dnd = i % 11 === 3 ? 'listed' : i % 13 === 6 ? 'unknown' : 'clear';
    const outcomes = [null, 'renewal_confirmed', 'callback_requested', 'no_answer', 'not_interested', 'renewal_confirmed'];
    const last = outcomes[i % outcomes.length];
    return {
      id: `ct_${String(i + 1).padStart(3, '0')}`, name, phone: e164(i + 1), language: LANGS[i % LANGS.length], city: CITIES[i % CITIES.length], consent, dnd,
      attempts: last ? 1 + (i % 3) : 0, lastOutcome: last, suppressed: consent === 'revoked' ? 'Opted out on a call, 14 Oct' : dnd === 'listed' ? 'On the DND list' : null,
      audiences: i % 2 ? ['Renewals Oct'] : ['Renewals Oct', 'Appointments Nov'],
      attributes: { policy_no: `P-${48000 + i * 37}`, due_date: `${(10 + i) % 28 + 1} Nov`, premium: `₹${(9 + (i % 7) * 2) * 1000 + 450}`, plan: pick(['Health Plus', 'Term Secure', 'Motor Comprehensive']) },
      consentDetail: { basis: consent === 'granted' ? 'Existing customer (service calls)' : consent === 'revoked' ? 'Revoked by the person' : 'Not recorded', source: 'renewals.csv import, 12 Oct', at: iso(60 * 24 * 8), state: consent },
      dndDetail: { state: dnd, checkedAt: dnd === 'unknown' ? null : iso(60 * 5), registry: 'NDNC (checked before every attempt)' },
      attemptHistory: last ? Array.from({ length: 1 + (i % 3) }, (_, k) => ({ at: iso(60 * (20 + k * 30)), outcome: k === 0 ? last : 'no_answer', callId: `k_${String(i * 2 + k + 1).padStart(3, '0')}`, campaign: 'Renewals Oct' })) : [],
      memory: {
        status: 'on',
        facts: i % 3 === 0 ? [
          { id: `mf_${i}_1`, text: 'Prefers calls after 6 pm', quote: 'शाम को ही फ़ोन करना, दिन में मीटिंग रहती है।', callId: 'k_001', atSec: 24.5, status: 'approved' },
          { id: `mf_${i}_2`, text: 'Asked for the renewal link on WhatsApp', quote: 'भेज दो, मैं शाम को देख लूँगा।', callId: 'k_001', atSec: 31.2, status: 'proposed' },
        ] : [],
      },
    };
  });
}
export const toRow = (c: ContactDoc): ContactRow => ({ id: c.id, name: c.name, phone: c.phone, language: c.language, city: c.city, consent: c.consent, dnd: c.dnd, attempts: c.attempts, lastOutcome: c.lastOutcome, suppressed: c.suppressed, audiences: c.audiences });

export const audiences = (): AudienceRow[] => [
  { id: 'aud_renew', name: 'Renewals Oct', count: 1240, callable: 1191, description: 'Renewal due in the next 30 days; consent on file' },
  { id: 'aud_appt', name: 'Appointments Nov', count: 312, callable: 298, description: 'Booked slots in the next 7 days' },
  { id: 'aud_cod', name: 'COD orders today', count: 96, callable: 96, description: 'Cash-on-delivery orders placed since 9 am' },
];

function config(job: string, name: string, brand: string, category: AgentConfigDraft['category'], stack: string | null, opts: Partial<AgentConfigDraft> = {}): AgentConfigDraft {
  const jobs: Record<string, { goals: AgentConfigDraft['goals']; facts: AgentConfigDraft['facts']; objections: AgentConfigDraft['objections']; useful: string }> = {
    renewal_reminder: {
      goals: [{ id: 'confirm_intent', description: 'The person says whether they will renew, and by when', outcome: 'renewal_intent', required: true }, { id: 'send_link', description: 'They received the renewal link on WhatsApp', outcome: 'link_sent', required: false }],
      facts: [{ key: 'due_date', value: 'per contact', purpose: 'service', source: 'contact.attribute', perContact: true }, { key: 'premium', value: 'per contact', purpose: 'service', source: 'contact.attribute', perContact: true }, { key: 'online_discount', value: 'The online-renewal discount stays if paid before the due date', purpose: 'offer', source: 'kb:renewal-faq.pdf#p2' }],
      objections: [{ trigger: 'Premium feels high', approach: 'Acknowledge it; ask what changed; offer to send the comparison, never argue' }, { trigger: 'Already renewed elsewhere', approach: 'Thank them, ask if they want the old policy noted as closed' }],
      useful: 'Mention that paying online before the due date keeps the loyalty discount',
    },
    payment_reminder: {
      goals: [{ id: 'confirm_pay_date', description: 'The person gives a date they will pay by', outcome: 'promise_to_pay', required: true }],
      facts: [{ key: 'emi_amount', value: 'per contact', purpose: 'service', source: 'contact.attribute', perContact: true }, { key: 'due_date', value: 'per contact', purpose: 'service', source: 'contact.attribute', perContact: true }],
      objections: [{ trigger: 'Cannot pay this month', approach: 'Stay kind; offer a call from a human; never threaten or press' }],
      useful: 'Tell them how to pay in one tap from the app, before asking anything',
    },
    appointment_confirmation: {
      goals: [{ id: 'confirm_slot', description: 'The person confirms, moves or cancels the slot', outcome: 'slot_status', required: true }],
      facts: [{ key: 'slot', value: 'per contact', purpose: 'logistics', source: 'contact.attribute', perContact: true }, { key: 'clinic_address', value: '12 Station Road, Pune', purpose: 'logistics', source: 'agent.form' }],
      objections: [{ trigger: 'Wants a different time', approach: 'Offer the next two free slots, then book one' }],
      useful: 'Tell them which doctor and where to park',
    },
    order_verification: {
      goals: [{ id: 'verify_order', description: 'The person confirms the order and the address', outcome: 'order_verified', required: true }],
      facts: [{ key: 'order_items', value: 'per contact', purpose: 'logistics', source: 'contact.attribute', perContact: true }],
      objections: [{ trigger: 'Did not place this order', approach: 'Thank them, mark for cancel, never push the sale' }],
      useful: 'Say when it will reach them before asking to confirm',
    },
  };
  const j = jobs[job] ?? jobs.renewal_reminder;
  return {
    brand: { name: brand, spokenName: brand.replace(/ (Services|Pvt Ltd)$/, '') },
    job, category, sectorPacks: ['base'],
    languages: { primary: 'hinglish', allowed: ['hinglish', 'hi-IN', 'en-IN'], mirrorCaller: true },
    persona: { name, gender: 'female', register: 'warm_peer', energy: 3, humour: 1, honorific: 'aap', notes: ['Explain like to someone driving or busy', 'Never rush the number or date'] },
    goals: j.goals, facts: j.facts, neverSay: ['competitor names', 'guaranteed returns'],
    opening: { disclosureClause: 'says once, lightly, that she is an AI assistant, after something useful', usefulFirst: j.useful },
    objections: j.objections,
    tools: [{ name: 'end_call', risk: 'external' }, { name: 'send_whatsapp_link', risk: 'external' }, { name: 'mark_callback', risk: 'draft' }],
    handOff: { when: ['asks_for_human', 'complaint', 'crisis', 'legal_threat'], target: { kind: 'queue', value: 'support' }, warmSummary: true },
    limits: { maxDurationS: 360, maxSilenceS: 8, maxTurns: 40 },
    voice: { stackId: stack, speed: 1 },
    recording: { enabled: true, announce: true },
    ...opts,
  };
}

export function agents(): AgentDoc[] {
  const mk = (id: string, name: string, version: number, pub: number | null, cfg: AgentConfigDraft, ago: number): AgentDoc => ({
    id, name, version, publishedVersion: pub, config: cfg, updatedAt: iso(ago),
    versions: Array.from({ length: version }, (_, i) => ({ version: version - i, at: iso(ago + i * 60 * 30), by: i === 0 ? 'Asha Rao' : 'Saarthi', state: (version - i) === pub ? 'live' as const : i === 0 && version !== pub ? 'draft' as const : 'old' as const, note: i === 0 ? 'Slower pace for the elderly list' : i === 1 ? 'Added the online-renewal fact' : undefined })),
  });
  return [
    mk('a_renew', 'Renewal reminder', 4, 4, config('renewal_reminder', 'Riya', 'Saanjh Services', 'service', 'v2-flashlite'), 95),
    mk('a_emi', 'Pre-due payment reminder', 2, null, config('payment_reminder', 'Arjun', 'Saanjh Finserv', 'service', null, { persona: { name: 'Arjun', gender: 'male', register: 'polite_professional', energy: 2, humour: 0, honorific: 'aap', notes: ['Calm, never pressing'] } }), 60 * 6),
    mk('a_appt', 'Appointment confirmer', 1, null, config('appointment_confirmation', 'Meera', 'Saanjh Care Clinic', 'transactional', null), 60 * 26),
    mk('a_cod', 'COD order verifier', 3, 3, config('order_verification', 'Kabir', 'Saanjh Retail', 'transactional', 'v2-mai', { persona: { name: 'Kabir', gender: 'male', register: 'crisp_efficient', energy: 4, humour: 0, honorific: 'aap', notes: [] } }), 60 * 50),
  ];
}
export const agentRow = (a: AgentDoc): AgentRow => ({ id: a.id, name: a.name, job: a.config.job, category: a.config.category, status: a.publishedVersion ? 'live' : a.id === 'a_emi' ? 'testing' : 'draft', version: a.version, publishedVersion: a.publishedVersion, stackId: a.config.voice.stackId, languages: a.config.languages.allowed, updatedAt: a.updatedAt, calls7d: a.publishedVersion ? (a.id === 'a_renew' ? 412 : 96) : null });

export function campaigns(): CampaignDoc[] {
  const base = (id: string, name: string, agentId: string, agentName: string, status: CampaignRow['status'], contacts: number, dialled: number, connected: number, done: number, spend: number, cap: number | null, cat: string, audience: string, startMin: number | null): CampaignDoc => ({
    id, name, agentId, agentName, category: cat, status, audience, contacts, dialled, connected, done, spendMilli: spend, capMilli: cap, startAt: startMin == null ? null : iso(startMin),
    window: { start: '10:00', end: '19:00', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] }, pace: { concurrency: 8, maxConcurrency: 10 }, retries: { max: 2, gapMin: 180 },
    live: { live: status === 'running' ? 6 : 0, ringing: status === 'running' ? 2 : 0, queued: status === 'running' ? contacts - dialled : contacts, updatedAt: iso(0.03) },
    checks: [], funnel: funnel(contacts, dialled, connected, done), versionPill: `${agentName} v4 · Live 100%`,
  });
  const a = base('cmp_renew', 'Renewals Oct', 'a_renew', 'Riya', 'running', 1191, 704, 412, 301, 1284_000, 5600_000, 'service', 'Renewals Oct', -60 * 20);
  a.checks = checks(true);
  const b = base('cmp_appt', 'Appointment reminders Nov', 'a_appt', 'Meera', 'draft', 298, 0, 0, 0, 0, 2000_000, 'transactional', 'Appointments Nov', null);
  b.checks = checks(false); b.versionPill = 'Meera v1 · Draft · unsaved';
  const c = base('cmp_cod', 'COD verification, 20 Oct', 'a_cod', 'Kabir', 'done', 96, 96, 71, 64, 402_000, 800_000, 'transactional', 'COD orders today', 60 * 30);
  c.checks = checks(true); c.versionPill = 'Kabir v3 · Live 100%';
  return [a, b, c];
}
function checks(ok: boolean): Check[] {
  return [
    { id: 'number', label: 'Calling number in your name', state: 'ok', detail: '+91 90000 00001, 140-series for service calls' },
    { id: 'category', label: 'Call category set once for this campaign', state: 'ok', detail: 'Service' },
    { id: 'window', label: 'Calling window inside the legal hours', state: 'ok', detail: '10:00 to 19:00 IST, per-contact local time' },
    { id: 'disclosure', label: 'AI disclosure always on', state: 'ok', detail: 'Said once, lightly. It cannot be switched off.' },
    { id: 'dnd', label: 'DND and opt-outs checked before every attempt', state: 'ok', detail: '9 suppressed in this list' },
    { id: 'limits', label: 'Call and spend limits set', state: ok ? 'ok' : 'warn', detail: ok ? 'Cap ₹5,600, 8 calls at once' : 'No spend cap yet. Set one before launch.', fix: ok ? undefined : { label: 'Set a cap', href: '/campaigns/cmp_appt' } },
    { id: 'sims', label: 'Six practice callers passed', state: ok ? 'ok' : 'fail', detail: ok ? '6 of 6 passed on Oct 19' : 'Not run yet', fix: ok ? undefined : { label: 'Run the practice callers', href: '/agents/a_appt' } },
    { id: 'outcome', label: 'Outcome wired to your system', state: ok ? 'ok' : 'warn', detail: ok ? 'Renewal webhook received 63 confirmations' : 'Outcomes will be read from the call only', fix: ok ? undefined : { label: 'Connect', href: '/settings/keys' } },
  ];
}
function funnel(rows: number, dialled: number, connected: number, done: number): FunnelStage[] {
  const callable = Math.round(rows * 0.985);
  return [
    { key: 'rows', label: 'Rows in', n: Math.round(rows * 1.04), drops: [{ code: 'BAD_PHONE', label: 'Number could not be fixed', n: 21 }, { code: 'DUPLICATE', label: 'Duplicate of another row', n: 14 }] },
    { key: 'valid', label: 'Valid', n: rows, drops: [{ code: 'DND', label: 'On the DND list', n: 9 }, { code: 'OPTED_OUT', label: 'Opted out earlier', n: 6 }] },
    { key: 'callable', label: 'Callable now', n: callable, drops: [{ code: 'OUTSIDE_WINDOW', label: 'Outside calling window today', n: Math.max(0, callable - dialled - 5) }] },
    { key: 'dialled', label: 'Dialled', n: dialled, drops: [{ code: 'NO_ANSWER', label: 'No answer after 2 tries', n: Math.round(dialled * 0.24) }, { code: 'BUSY', label: 'Busy or switched off', n: Math.round(dialled * 0.11) }, { code: 'CARRIER', label: 'Carrier refused the call', n: Math.round(dialled * 0.01) }] },
    { key: 'connected', label: 'Connected', n: connected, drops: [{ code: 'HUNG_UP_EARLY', label: 'Hung up in under 15 s', n: Math.round(connected * 0.14) }] },
    { key: 'agenda', label: 'Agenda done', n: Math.round(connected * 0.78), drops: [{ code: 'CALLBACK', label: 'Asked for a callback', n: Math.round(connected * 0.1) }] },
    { key: 'outcome', label: 'Outcome confirmed by your system', n: done },
  ];
}

const OUTCOMES: Record<string, string> = { renewal_confirmed: 'Renewal intent confirmed', callback_requested: 'Callback requested', not_interested: 'Not interested', no_answer: 'No answer', opted_out: 'Asked not to be called', handed_off: 'Handed to a person', carrier_failed: 'Carrier failed' };
export const outcomeLabel = (k: string) => OUTCOMES[k] ?? k;

export function calls(): CallDoc[] {
  const outs = ['renewal_confirmed', 'callback_requested', 'no_answer', 'not_interested', 'renewal_confirmed', 'no_answer', 'opted_out', 'renewal_confirmed', 'handed_off', 'carrier_failed', 'renewal_confirmed', 'callback_requested'];
  const docs: CallDoc[] = [];
  const cs = contacts();
  for (let i = 0; i < 36; i++) {
    const c = cs[i % cs.length];
    const o = i === 0 ? 'renewal_confirmed' : i === 1 ? 'opted_out' : i === 2 ? 'callback_requested' : i === 3 ? 'carrier_failed' : outs[i % outs.length];
    const connected = !['no_answer', 'carrier_failed'].includes(o);
    const turns = connected ? turnsFor(i, o, c.name.split(' ')[0]) : [];
    const total = connected ? Math.round((turns[turns.length - 1]?.t1 ?? 40) + 2) : 0;
    const gaps = turns.filter(t => t.who === 'agent' && t.gapMs).map(t => t.gapMs!);
    docs.push({
      id: `k_${String(i + 1).padStart(3, '0')}`, contactName: c.name, phone: c.phone, campaign: i % 5 === 4 ? 'COD verification, 20 Oct' : 'Renewals Oct', agent: i % 5 === 4 ? 'Kabir' : 'Riya', version: i % 5 === 4 ? 'v3' : 'v4',
      startedAt: iso(12 + i * 23), durationS: total, outcome: o, outcomeReason: o === 'carrier_failed' ? 'Carrier code 480: temporarily unavailable' : o === 'no_answer' ? 'Rang 28 s, no pickup' : undefined,
      costMilli: connected ? 1800 + Math.round(total * 14) : 220, gapMs: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null, ran: i % 5 === 4 ? 'v2-mai' : 'v2-flashlite',
      summary: summaryFor(o, c.name), outcomeDetail: { key: o, label: outcomeLabel(o), reason: reasonFor(o), carrierCode: o === 'carrier_failed' ? '480' : undefined },
      turns, moments: momentsFor(o, turns), quotes: quotesFor(turns, o), peaks: peaksFor(turns, total), totalSec: total,
      trace: traceFor(o, turns), memoryUsed: i % 4 === 0 ? [{ text: 'Prefers calls after 6 pm', atSec: 3 }] : [], audioUrl: null,
      mood: connected ? [{ atSec: 2, label: 'hurried' }, { atSec: Math.max(8, total * 0.5), label: 'calm' }] : undefined,
      cost: connected ? { telephonyMilli: Math.round(total * 5.5), voiceMilli: Math.round(total * 6), brainMilli: Math.round(total * 1.6), earsMilli: Math.round(total * 1.2), basis: 'Stand-in split, not a meter reading' } : null,
    });
  }
  return docs;
}
export const callRow = (d: CallDoc): CallRow => ({ id: d.id, contactName: d.contactName, phone: d.phone, campaign: d.campaign, agent: d.agent, version: d.version, startedAt: d.startedAt, durationS: d.durationS, outcome: d.outcome, outcomeReason: d.outcomeReason, costMilli: d.costMilli, gapMs: d.gapMs, ran: d.ran });

const T = (i: number, who: 'caller' | 'agent', t0: number, t1: number, text: string, roman: string, en: string, gapMs?: number, cutIn?: boolean): CallTurn => ({ i, who, t0, t1, text, roman, en, gapMs, cutIn });
function turnsFor(i: number, o: string, first: string): CallTurn[] {
  if (o === 'opted_out') return [
    T(1, 'agent', 0, 9.2, `नमस्ते ${first} जी, मैं Riya बोल रही हूँ, Saanjh Services की तरफ़ से एक AI असिस्टेंट। आपकी policy की renewal के बारे में एक छोटी बात थी।`, `Namaste ${first} ji, main Riya bol rahi hoon, Saanjh Services ki taraf se ek AI assistant. Aapki policy ki renewal ke baare mein ek chhoti baat thi.`, `Hello ${first}, this is Riya, an AI assistant calling for Saanjh Services. There was a small thing about your policy renewal.`),
    T(2, 'caller', 10.4, 15.1, 'मुझे बार-बार फ़ोन मत करो, बंद करो ये सब।', 'Mujhe baar-baar phone mat karo, band karo ye sab.', 'Do not call me again and again. Stop all this.'),
    T(3, 'agent', 15.9, 25.0, 'जी, माफ़ कीजिए। मैंने आपका नंबर अभी हटा दिया है, आगे से हमारी तरफ़ से कोई कॉल नहीं आएगी। धन्यवाद।', 'Ji, maaf kijiye. Maine aapka number abhi hata diya hai, aage se hamari taraf se koi call nahi aayegi. Dhanyavaad.', 'I am sorry. I have removed your number just now. You will not get any more calls from us. Thank you.', 800),
  ];
  if (o === 'callback_requested') return [
    T(1, 'agent', 0, 9.6, `नमस्ते ${first} जी, मैं Riya बोल रही हूँ, Saanjh Services की तरफ़ से एक AI असिस्टेंट। आपकी renewal इस महीने की 28 को है, दो मिनट बात कर सकते हैं?`, `Namaste ${first} ji, main Riya bol rahi hoon, Saanjh Services ki taraf se ek AI assistant. Aapki renewal is mahine ki 28 ko hai, do minute baat kar sakte hain?`, `Hello ${first}, this is Riya, an AI assistant for Saanjh Services. Your renewal is on the 28th. Can we talk for two minutes?`),
    T(2, 'caller', 11.0, 17.8, 'अभी तो मैं बाहर हूँ। और premium भी इस बार काफ़ी ज़्यादा लग रहा है।', 'Abhi toh main bahar hoon. Aur premium bhi is baar kaafi zyada lag raha hai.', 'I am out right now. And the premium looks quite high this time.'),
    T(3, 'agent', 19.2, 30.4, 'समझ सकती हूँ। चलिए आज शाम छह बजे के बाद बात करते हैं, तब मैं पिछले साल से तुलना भी साथ रख लूँगी। ठीक रहेगा?', 'Samajh sakti hoon. Chaliye aaj shaam chhah baje ke baad baat karte hain, tab main pichhle saal se tulna bhi saath rakh lungi. Theek rahega?', 'I understand. Let us talk after 6 pm today, and I will keep last year\'s comparison ready. Is that fine?', 1400),
    T(4, 'caller', 31.0, 33.5, 'हाँ, ठीक है, छह बजे।', 'Haan, theek hai, chhah baje.', 'Yes, fine, six o\'clock.'),
    T(5, 'agent', 34.3, 39.0, 'धन्यवाद, छह बजे बात करते हैं। नमस्ते!', 'Dhanyavaad, chhah baje baat karte hain. Namaste!', 'Thank you, we will talk at six. Goodbye.', 800),
  ];
  if (o === 'handed_off') return [
    T(1, 'agent', 0, 8.8, `नमस्ते ${first} जी, मैं Riya, Saanjh Services की AI असिस्टेंट बोल रही हूँ। आपकी policy के बारे में एक छोटी बात थी।`, `Namaste ${first} ji, main Riya, Saanjh Services ki AI assistant bol rahi hoon. Aapki policy ke baare mein ek chhoti baat thi.`, `Hello ${first}, this is Riya, Saanjh Services' AI assistant. There was a small thing about your policy.`),
    T(2, 'caller', 9.9, 16.0, 'मुझे claim के बारे में शिकायत करनी है, किसी इंसान से बात कराओ।', 'Mujhe claim ke baare mein shikayat karni hai, kisi insaan se baat karao.', 'I want to complain about a claim. Connect me to a person.'),
    T(3, 'agent', 17.0, 25.6, 'ज़रूर। मैं आपको अभी हमारी support टीम से जोड़ रही हूँ, उन्हें मैंने आपकी शिकायत बता दी है।', 'Zaroor. Main aapko abhi hamari support team se jod rahi hoon, unhe maine aapki shikayat bata di hai.', 'Of course. I am connecting you to our support team now. I have told them about your complaint.', 1000),
  ];
  // default: the confirmed-link call
  return [
    T(1, 'agent', 0, 9.5, `नमस्ते ${first} जी, मैं Riya बोल रही हूँ, Saanjh Services की तरफ़ से एक AI असिस्टेंट। आपकी policy के बारे में एक छोटी सी बात थी, दो मिनट हैं?`, `Namaste ${first} ji, main Riya bol rahi hoon, Saanjh Services ki taraf se ek AI assistant. Aapki policy ke baare mein ek chhoti si baat thi, do minute hain?`, `Hello ${first}, this is Riya, an AI assistant for Saanjh Services. There was a small thing about your policy. Do you have two minutes?`),
    T(2, 'caller', 10.8, 14.2, 'हाँ बोलिए, पर जल्दी, मैं गाड़ी चला रहा हूँ।', 'Haan boliye, par jaldi, main gaadi chala raha hoon.', 'Yes, go ahead, but quickly, I am driving.'),
    T(3, 'agent', 15.3, 25.4, 'ठीक है, सिर्फ़ तीस सेकंड। आपकी renewal 28 तारीख़ को है, और online करने पर पुराना discount बना रहेगा। मैं link WhatsApp पर भेज दूँ?', 'Theek hai, sirf tees second. Aapki renewal 28 tareekh ko hai, aur online karne par purana discount bana rahega. Main link WhatsApp par bhej doon?', 'Okay, just thirty seconds. Your renewal is on the 28th, and the old discount stays if you renew online. Shall I send the link on WhatsApp?', 1100),
    T(4, 'caller', 26.2, 31.5, 'अच्छा... हाँ भेज दो, मैं शाम को देख लूँगा।', 'Achha... haan bhej do, main shaam ko dekh lunga.', 'Okay... yes send it, I will look in the evening.', undefined, true),
    T(5, 'agent', 32.9, 38.6, 'बिल्कुल, भेज रही हूँ। गाड़ी ध्यान से चलाइएगा, नमस्ते!', 'Bilkul, bhej rahi hoon. Gaadi dhyaan se chalaiyega, namaste!', 'Of course, sending it now. Drive safely, goodbye.', 1400),
  ];
}
function summaryFor(o: string, name: string): string {
  const f = name.split(' ')[0];
  switch (o) {
    case 'renewal_confirmed': return `${f} was driving, so Riya kept it to thirty seconds. They agreed to look at the renewal link on WhatsApp this evening.`;
    case 'callback_requested': return `${f} found the premium high and was out. A callback after 6 pm today was agreed.`;
    case 'opted_out': return `${f} asked not to be called again. The number was suppressed on the call and the opt-out was honoured within one turn.`;
    case 'handed_off': return `${f} wanted to complain about a claim. Riya connected them to the support queue with a one-line summary.`;
    case 'not_interested': return `${f} said they were not interested this year. No further attempts are scheduled.`;
    case 'carrier_failed': return 'The carrier refused the call before it rang. No one was reached.';
    default: return 'No one picked up.';
  }
}
const reasonFor = (o: string) => ({ renewal_confirmed: 'Said they would act on the link; confirmed by the call, awaiting your system', callback_requested: 'Asked for a call after 6 pm', opted_out: 'Said "do not call me again"', handed_off: 'Asked for a person', not_interested: 'Said not interested', carrier_failed: 'Carrier refused: temporarily unavailable', no_answer: 'Rang out' } as Record<string, string>)[o] ?? o;
function momentsFor(o: string, turns: CallTurn[]): CallDoc['moments'] {
  if (!turns.length) return [];
  const m: CallDoc['moments'] = [{ atSec: Math.min(4.2, turns[0].t1 - 1), kind: 'disclosure', label: 'AI disclosure spoken' }];
  if (o === 'opted_out') m.push({ atSec: turns[1].t0, kind: 'optout', label: 'Asked not to be called' });
  if (o === 'callback_requested') m.push({ atSec: turns[1].t0 + 4, kind: 'objection', label: 'Premium feels high' }, { atSec: turns[3].t0, kind: 'commitment', label: 'Agreed to a 6 pm callback' });
  if (o === 'handed_off') m.push({ atSec: turns[2].t0, kind: 'handoff', label: 'Connected to support' });
  if (o === 'renewal_confirmed') { m.push({ atSec: turns[3].t0 + 1, kind: 'commitment', label: 'Will check the link this evening' }); if (turns[3].cutIn) m.push({ atSec: turns[3].t0, kind: 'cutin', label: 'Caller spoke over her' }); }
  return m;
}
function quotesFor(turns: CallTurn[], o: string): CallDoc['quotes'] {
  const c = turns.filter(t => t.who === 'caller');
  if (!c.length) return [];
  const tag = o === 'opted_out' ? 'opt-out' : o === 'callback_requested' ? 'objection' : o === 'handed_off' ? 'complaint' : 'commitment';
  return [{ atSec: c[c.length > 1 ? 0 : 0].t0 + 1, text: c[0].text, tag: c.length > 1 ? 'situation' : tag }, ...(c.length > 1 ? [{ atSec: c[c.length - 1].t0, text: c[c.length - 1].text, tag }] : [])].slice(0, 2);
}
function peaksFor(turns: CallTurn[], total: number): CallDoc['peaks'] {
  const N = 120;
  const mk = (who: 'caller' | 'agent') => Array.from({ length: N }, (_, k) => {
    const t = (k / N) * Math.max(total, 1);
    const on = turns.some(x => x.who === who && t >= x.t0 && t <= x.t1);
    return on ? Math.round((0.25 + rnd() * 0.75) * 100) / 100 : Math.round(rnd() * 4) / 100;
  });
  return { caller: mk('caller'), agent: mk('agent') };
}
function traceFor(o: string, turns: CallTurn[]): CallDoc['trace'] {
  if (!turns.length) return [{ label: 'Attempt was allowed', ok: true, detail: 'Inside the window, not on DND, consent on file' }, { label: 'Carrier connected', ok: false, detail: 'Carrier code 480 before ringing' }];
  return [
    { label: 'Inside the calling window', ok: true, detail: '11:42 IST, window 10:00 to 19:00' },
    { label: 'Not suppressed', ok: true, detail: 'No DND, no opt-out on file' },
    { label: 'Basis to call', ok: true, detail: 'Service call to an existing customer' },
    { label: 'AI disclosure spoken', ok: true, detail: `Spoken at 0:0${Math.round(Math.min(4.2, turns[0].t1 - 1))}, once, after something useful` },
    ...(o === 'opted_out' ? [{ label: 'Opt-out honoured', ok: true, detail: 'Number suppressed within one turn of being asked' }] : []),
  ];
}

export const issues = (): Issue[] => [
  { id: 'is_1', severity: 'high', title: 'Pickup is low in Pune after 6 pm', cause: 'Most Pune numbers are not answered after 6 pm; the window ends at 7 pm', calls: 142, firstSeen: iso(60 * 30), fix: 'Move Pune contacts to 11 am to 2 pm' },
  { id: 'is_2', severity: 'medium', title: 'She is cut off in the first 10 seconds on 17% of connected calls', cause: 'Callers speak over the disclosure line; turn-taking is unsolved on every stack', calls: 70, firstSeen: iso(60 * 50), fix: 'Shorten the opening by one clause' },
  { id: 'is_3', severity: 'low', title: 'Two numbers in the list are written with a country code that is not +91', cause: 'Kept, not auto-dialled', calls: 2, firstSeen: iso(60 * 20) },
];
export const proposals = (): Proposal[] => [
  { id: 'pr_1', title: 'Open with the discount only after asking about timing', hypothesis: 'Callers who are asked "is this a good time" first stay on longer', evidence: 'In 38 hang-ups under 15 s, 31 came before any timing question', state: 'proposed', callsToProve: 160, callsSoFar: 0, before: 'Hello, this is Riya, an AI assistant. About your renewal, and a discount you keep if you renew online.', after: 'Hello, this is Riya, an AI assistant. Is this a good time for two minutes about your renewal?' },
  { id: 'pr_2', title: 'Offer the WhatsApp link before the due date, not after', hypothesis: 'Sending the link earlier lifts renewals confirmed', evidence: 'Not enough yet to say', state: 'testing', callsToProve: 300, callsSoFar: 112 },
  { id: 'pr_3', title: 'Slower pace for callers over 60', hypothesis: 'Slower speech reduces "repeat that" turns', evidence: 'Proved on 214 calls, 11 points fewer repeats', state: 'proved', callsToProve: 200, callsSoFar: 214 },
];

export const numbers = (): NumberRow[] => [
  { id: 'nm_1', e164: '+919000000001', provider: 'Trial line (VP)', kind: 'trial', series: '140 (service)', status: 'active', category: 'service', note: 'Rings only verified team numbers. ₹764 trial credit.', monthlyMilli: null },
  { id: 'nm_2', e164: '+919000000002', provider: 'Exotel', kind: 'byo', series: '160 (transactional)', status: 'kyc_pending', category: 'transactional', note: 'KYC with your documents in progress, about 3 to 7 working days.', monthlyMilli: null },
];
export const members = (): Member[] => [
  { id: 'mb_1', name: 'Asha Rao', email: 'asha@saanjh.example', role: 'owner', status: 'active', lastSeen: iso(3) },
  { id: 'mb_2', name: 'Priya Nambiar', email: 'priya@saanjh.example', role: 'compliance', status: 'active', lastSeen: iso(60 * 7) },
  { id: 'mb_3', name: 'Dev Kulkarni', email: 'dev@saanjh.example', role: 'builder', status: 'invited', lastSeen: null },
];
export const apiKeys = (): ApiKey[] => [{ id: 'key_1', label: 'CRM webhook', prefix: 'vp_3fa9c21b_…', createdAt: iso(60 * 24 * 9), lastUsed: iso(14), scope: 'builder' }];
export const knowledge = (): KnowledgeItem[] => [
  { id: 'kn_1', title: 'renewal-faq.pdf', kind: 'file', status: 'indexed', facts: 14, addedAt: iso(60 * 24 * 9), purpose: 'service' },
  { id: 'kn_2', title: 'https://saanjh.example/offers', kind: 'url', status: 'indexed', facts: 6, addedAt: iso(60 * 24 * 4), purpose: 'offer' },
  { id: 'kn_3', title: 'clinic-hours.txt', kind: 'text', status: 'pending', facts: 0, addedAt: iso(20), purpose: 'logistics' },
];
export const activity = (): ActivityRow[] => [
  { id: 'ac_1', at: iso(6), who: 'Saarthi', tool: 'agent.update', risk: 'draft', mode: 'A1', summary: 'Slower pace for the elderly list, Riya v4', outcome: 'confirmed', costMilli: 0 },
  { id: 'ac_2', at: iso(44), who: 'Test pilot', tool: 'test.simulate', risk: 'test', mode: 'A1', summary: 'Six practice callers on Meera v1', outcome: 'confirmed', costMilli: 12_000 },
  { id: 'ac_3', at: iso(95), who: 'Asha Rao', tool: 'campaign.launch', risk: 'external', mode: 'A2', summary: 'Launched Renewals Oct to 1,191 people', outcome: 'confirmed', costMilli: null, undo: 'Stops new dials. Calls already placed stay.' },
  { id: 'ac_4', at: iso(60 * 5), who: 'Compliance guard', tool: 'contact.suppress_after_opt_out', risk: 'external', mode: 'A3', summary: 'Suppressed Mohan Das after an opt-out on a call', outcome: 'confirmed', costMilli: 0, undo: 'Compliance can release a suppression.' },
  { id: 'ac_5', at: iso(60 * 9), who: 'Asha Rao', tool: 'wallet.topup', risk: 'spend', mode: 'A2', summary: 'Top-up of ₹5,000', outcome: 'unknown', costMilli: 5_000_000, undo: 'Spend is not reversible in the product.' },
];

export const STACK_PRICE: Record<string, { perMinuteMilli: number | null; basis: string }> = {
  'v2-live': { perMinuteMilli: null, basis: 'No meter reading for speech-to-speech yet' },
  'v2-flashlite': { perMinuteMilli: 2900, basis: 'Stand-in estimate from vendor list prices, not a meter reading' },
  'v2-54mini': { perMinuteMilli: 3300, basis: 'Stand-in estimate from vendor list prices, not a meter reading' },
  'v2-38flash': { perMinuteMilli: 3100, basis: 'Stand-in estimate from vendor list prices, not a meter reading' },
  'v2-mai': { perMinuteMilli: null, basis: 'Voice price not yet read from the meter' },
  'v2-flashlite-or': { perMinuteMilli: 3400, basis: 'Stand-in estimate from vendor list prices, not a meter reading' },
  'v2-luna': { perMinuteMilli: 4100, basis: 'Stand-in estimate from vendor list prices, not a meter reading' },
  'sarvam-india': { perMinuteMilli: 3700, basis: 'Stand-in estimate from vendor list prices, not a meter reading' },
};
