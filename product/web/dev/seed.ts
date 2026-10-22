// Seeds a throwaway workspace through the REAL tools (sign up, template agents, stack, publish, import a small synthetic CSV, audiences,
// campaign drafts, knowledge) and, because the sandbox has no telephony, four calls as the voice runtime would report them: rows are made
// the way the dial gate makes them and the events go through the signed POST /hooks/runtime. SYNTHETIC people only, phones +91 90000 000xx.
//   eval $(sh product/scripts/pg-test.sh vp_web_real)
//   VP_RUNTIME_SECRET=... node --import tsx product/web/dev/seed.ts [baseUrl]      (the server must run with the same VP_RUNTIME_SECRET)
import pg from 'pg';
import { sign } from '../../server/runtime-client.ts';
import type { RuntimeEvent, RunManifest } from '../../shared/runtime-protocol.ts';

// The SERVER needs VP_SECRET_KEY (a generated dev value, e.g. `openssl rand -hex 32`) and the same VP_RUNTIME_SECRET as this script; see web/README.md.
if (!process.env.VP_RUNTIME_SECRET) console.warn('VP_RUNTIME_SECRET is not set here: the four sample calls will be skipped.');
const base = process.argv[2] ?? 'http://localhost:8788';
const SECRET = process.env.VP_RUNTIME_SECRET ?? '';
const EMAIL = 'asha@saanjh.example', PASSWORD = 'sample-password-1234';
let cookie = '';

async function http(method: string, path: string, body?: unknown) {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  return { status: r.status, json: await r.json().catch(() => ({})) as any };
}
async function tool<T = any>(name: string, args: unknown = {}): Promise<T> {
  const r = await http('POST', '/v1/tools/' + name, { args });
  if (r.json.status === 'needs_approval') {
    const d = await http('POST', `/v1/actions/${r.json.actionId}/decide`, { approve: true });
    if (d.json.status !== 'confirmed') throw new Error(`${name} approval: ${JSON.stringify(d.json)}`);
    return d.json.result;
  }
  if (r.json.status !== 'confirmed') throw new Error(`${name}: ${JSON.stringify(r.json)}`);
  return r.json.result;
}

const CSV = `Name,Mobile,Language,City,Next review,Reference
Sunita Verma,90000 00011,Hindi,Pune,12/01/2027,A-10231
Imran Qureshi,+91 9000000012,Hinglish,Lucknow,14/01/2027,A-10232
Lakshmi Iyer,9000000013,Tamil,Chennai,18/01/2027,A-10233
Gurpreet Singh,90000 00016,Punjabi,Jaipur,20/01/2027,A-10234
Anita Deshmukh,90000 00014,Marathi,Nagpur,25/01/2027,A-10235
Farah Sheikh,90000 00015,Hinglish,Kochi,01/02/2027,A-10237
Vikram Rao,9000000017,Telugu,Patna,03/02/2027,A-10238
Meenal Joshi,9000000018,Hindi,Indore,04/02/2027,A-10239
`;

async function main() {
  let r = await http('POST', '/v1/login', { email: EMAIL, password: PASSWORD });
  if (r.status !== 200) r = await http('POST', '/v1/signup', { workspace: 'Saanjh Services', name: 'Asha Rao', email: EMAIL, password: PASSWORD });
  if (r.status >= 300) throw new Error('sign-in failed: ' + JSON.stringify(r.json));

  const existing = (await tool('agent.list')).agents as any[];
  if (existing.length) { console.log('already seeded; nothing to do'); return; }

  const riya = (await tool('agent.create', { name: 'Renewals, Pune', templateId: 'insurance-renewal' })).agentId;
  const meera = (await tool('agent.create', { name: 'Clinic appointments', templateId: 'clinic-appointment-confirm' })).agentId;
  await tool('agent.create', { name: 'EMI pre-due reminder', templateId: 'lending-emi-reminder' });
  for (const a of [riya, meera]) {
    await tool('stack.set', { agentId: a, stackId: 'v2-flashlite' });
    const g = await tool('agent.get', { agentId: a });
    await tool('version.publish', { agentId: a, draftHash: g.draftHash, note: 'First published version' });
  }
  const up = await tool('source.upload', { kind: 'csv', name: 'renewals.csv', text: CSV, filename: 'renewals.csv' });
  const commit = await tool('source.commit', { uploadId: up.uploadId, consentPurpose: 'service', audienceName: 'Renewals Oct' });
  await tool('audience.create', { name: 'Pune and Lucknow', filter: { any: [{ key: 'city', op: 'eq', value: 'Pune' }, { key: 'city', op: 'eq', value: 'Lucknow' }] } });
  const vRiya = (await tool('agent.get', { agentId: riya })).versions[0].id as string;
  const vMeera = (await tool('agent.get', { agentId: meera })).versions[0].id as string;
  const window = { days: [1, 2, 3, 4, 5, 6], ranges: [{ start: '10:00', end: '19:00' }] };
  const camp = await tool('campaign.draft', { name: 'Renewals Oct', category: 'service', agentVersionId: vRiya, audienceId: commit.audienceId, preset: 'renewal', window, concurrency: 4, capInrMilli: 2_000_000 });
  await tool('campaign.draft', { name: 'Appointment reminders Nov', category: 'service', agentVersionId: vMeera, audienceId: commit.audienceId, window, concurrency: 2 });
  const k = await tool('knowledge.ingest', { title: 'renewal-faq.txt', text: 'Premium can be paid online until the due date. The grace period is 30 days after the due date. A no-claim bonus raises cover by 10 percent.' });
  const spans = (await tool('knowledge.list', { sourceId: k.sourceId })).spans as any[];
  await tool('knowledge.span.approve', { spanIds: spans.map(s => s.id), decision: 'approved' });
  await tool('knowledge.ingest', { title: 'clinic-hours.txt', text: 'The clinic is open from 9 am to 7 pm, Monday to Saturday. Please bring your previous reports.' });
  // left waiting for a tap, so Today's Needs-you queue has a real approval in it
  await http('POST', '/v1/tools/wallet.topup', { args: { inrMilli: 500_000 } });

  // ---- calls, as the voice runtime reports them
  if (SECRET) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const ws = (await pool.query("SELECT id FROM workspace WHERE name = 'Saanjh Services' ORDER BY created_at DESC LIMIT 1")).rows[0].id as string;
    const people = (await pool.query('SELECT id FROM contact WHERE workspace_id = $1 ORDER BY e164 LIMIT 6', [ws])).rows.map(x => x.id as string);
    const manifest: RunManifest = { combinationId: 'v2|gemini+gemini-3.5-flash-lite+gemini-lite', stackId: 'v2-flashlite', agentVersionHash: 'seed', components: { stt: 'gemini', llm: 'gemini-3.5-flash-lite', tts: 'gemini-lite' }, fallbacksUsed: [], memory: 'none', runtimeVersion: 'seed' };
    const T = (speaker: 'agent' | 'caller', text: string, startMs: number, endMs: number, latencyMs?: number, interrupted?: boolean) => ({ speaker, text, startMs, endMs, latencyMs, interrupted });
    const calls: { who: number; end: any; secs: number; turns: ReturnType<typeof T>[]; moments: { kind: any; atMs: number; note: string }[]; cost: number }[] = [
      { who: 0, end: 'agent_ended', secs: 41, cost: 4200, moments: [{ kind: 'commitment', atMs: 28000, note: 'will look at the WhatsApp link this evening' }], turns: [
        T('agent', 'नमस्ते सुनीता जी, मैं रिया बोल रही हूँ, सुरक्षा हेल्थ की तरफ़ से एक AI असिस्टेंट। आपकी policy की renewal के बारे में एक छोटी बात थी, दो मिनट हैं?', 0, 9500),
        T('caller', 'हाँ बोलिए, पर जल्दी, मैं गाड़ी चला रहा हूँ।', 10800, 14200),
        T('agent', 'ठीक है, सिर्फ़ तीस सेकंड। आपकी renewal 28 तारीख़ को है, और online करने पर no-claim bonus मिलेगा। मैं link WhatsApp पर भेज दूँ?', 15300, 25400, 1100),
        T('caller', 'अच्छा... हाँ भेज दो, मैं शाम को देख लूँगा।', 26200, 31500, undefined, true),
        T('agent', 'बिल्कुल, भेज रही हूँ। गाड़ी ध्यान से चलाइएगा, नमस्ते!', 32900, 38600, 1400)] },
      { who: 1, end: 'opt_out', secs: 25, cost: 2600, moments: [{ kind: 'opt_out', atMs: 10400, note: 'asked not to be called again' }], turns: [
        T('agent', 'नमस्ते इमरान जी, मैं रिया बोल रही हूँ, सुरक्षा हेल्थ की AI असिस्टेंट। आपकी renewal के बारे में एक छोटी बात थी।', 0, 9200),
        T('caller', 'मुझे बार-बार फ़ोन मत करो, बंद करो ये सब।', 10400, 15100),
        T('agent', 'जी, माफ़ कीजिए। मैंने आपका नंबर अभी हटा दिया है, आगे से हमारी तरफ़ से कोई कॉल नहीं आएगी। धन्यवाद।', 15900, 25000, 800)] },
      { who: 2, end: 'agent_ended', secs: 39, cost: 3900, moments: [{ kind: 'objection', atMs: 14000, note: 'premium feels high' }, { kind: 'callback_request', atMs: 31000, note: 'asked for a call after 6 pm' }], turns: [
        T('agent', 'नमस्ते लक्ष्मी जी, मैं रिया बोल रही हूँ, सुरक्षा हेल्थ की AI असिस्टेंट। आपकी renewal इस महीने की 28 को है, दो मिनट बात कर सकते हैं?', 0, 9600),
        T('caller', 'अभी तो मैं बाहर हूँ। और premium भी इस बार काफ़ी ज़्यादा लग रहा है।', 11000, 17800),
        T('agent', 'समझ सकती हूँ। चलिए आज शाम छह बजे के बाद बात करते हैं, तब मैं पिछले साल से तुलना भी साथ रख लूँगी। ठीक रहेगा?', 19200, 30400, 1400),
        T('caller', 'हाँ, ठीक है, छह बजे।', 31000, 33500),
        T('agent', 'धन्यवाद, छह बजे बात करते हैं। नमस्ते!', 34300, 39000, 800)] },
      { who: 3, end: 'no_answer', secs: 0, cost: 220, moments: [], turns: [] },
    ];
    let phone = 0;
    const convs: string[] = [];
    for (const c of calls) {
      const contact = people[c.who];
      const attempt = (await pool.query("INSERT INTO attempt (workspace_id, campaign_id, contact_id, status) VALUES ($1,$2,$3,'dialing') RETURNING id", [ws, camp.id, contact])).rows[0].id;
      const conv = (await pool.query("INSERT INTO conversation (workspace_id, attempt_id, contact_id, agent_version_id, channel) VALUES ($1,$2,$3,$4,'phone') RETURNING id", [ws, attempt, contact, vRiya])).rows[0].id as string;
      const now = () => new Date(Date.now() - (50 - phone++ * 12) * 60_000).toISOString();
      let s = 1; const ev: RuntimeEvent[] = [{ seq: s++, type: 'call.started', at: now(), manifest }];
      for (const t of c.turns) ev.push({ seq: s++, type: 'turn', at: now(), ...t } as RuntimeEvent);
      for (const m of c.moments) ev.push({ seq: s++, type: 'moment', at: now(), kind: m.kind, atMs: m.atMs, note: m.note });
      ev.push({ seq: s++, type: 'cost', at: now(), component: 'telephony', provider: 'exotel', quantity: Math.max(1, c.secs), unit: 'second', inrMilli: c.cost });
      ev.push({ seq: s++, type: 'call.ended', at: now(), endReason: c.end, durationS: c.secs, transcript: c.turns.map(t => ({ speaker: t.speaker, text: t.text, startMs: t.startMs })), manifest } as RuntimeEvent);
      convs.push(conv);
      const body = JSON.stringify({ protocol: 1, conversationId: conv, events: ev });
      const res = await fetch(base + '/hooks/runtime', { method: 'POST', headers: { 'content-type': 'application/json', 'x-vp-signature': sign(SECRET, body) }, body });
      if (!res.ok) throw new Error('runtime hook: ' + res.status + ' ' + (await res.text()));
    }
    // A workspace insight, written the way insight.refresh stores one (its model call needs an analysis model the dev server does not have).
    // Every quote is a real turn of a seeded call.
    const q = (i: number, t: number) => ({ conversationId: convs[i], text: calls[i].turns[t].text, speaker: calls[i].turns[t].speaker, startMs: calls[i].turns[t].startMs });
    const themes = [
      { kind: 'objection', title: 'The price is higher than last time', count: 2, of: 4, quotedCalls: 1, quotes: [q(2, 1)] },
      { kind: 'objection', title: 'Asks to be called at a better time', count: 3, of: 4, quotedCalls: 2, quotes: [q(0, 1), q(2, 3)] },
      { kind: 'drop_off', title: 'Asks not to be called again', count: 1, of: 4, quotedCalls: 1, quotes: [q(1, 1)] },
      { kind: 'success_driver', title: 'Agrees once the next step is a message they can read later', count: 2, of: 4, quotedCalls: 1, quotes: [q(0, 3)] },
    ];
    await pool.query("INSERT INTO call_insight (workspace_id, scope_type, status, themes, calls_sampled, calls_in_scope, newest_call_at, detail) VALUES ($1,'workspace','done',$2,4,4, now(), $3)", [ws, JSON.stringify(themes), { reason: null, model: 'seed' }]);
    await pool.end();
  } else console.log('VP_RUNTIME_SECRET not set: skipped the four sample calls');
  console.log('seeded');
}
main().catch(e => { console.error(e); process.exit(1); });
