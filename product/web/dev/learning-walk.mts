// Walk the learning loop on the dev server as the seeded admin (Asha), through the same HTTP tool API the web uses.
// Calls arrive the way the voice runtime reports them (signed /hooks/runtime). Prints each step's result.
import pg from 'pg';
import { sign } from '../../server/runtime-client.ts';

const base = process.env.BASE ?? 'http://localhost:8811';
const SECRET = process.env.VP_RUNTIME_SECRET!;
let cookie = '';
async function http(method: string, path: string, body?: unknown) {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]!;
  return { status: r.status, json: await r.json().catch(() => ({})) as any };
}
const tool = async (name: string, args: unknown = {}) => (await http('POST', '/v1/tools/' + name, { args })).json;
const approve = async (actionId: string) => (await http('POST', `/v1/actions/${actionId}/decide`, { approve: true })).json;
const log = (step: string, v: unknown) => console.log(`\n## ${step}\n${JSON.stringify(v, null, 1).slice(0, 1500)}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await http('POST', '/v1/login', { email: 'asha@saanjh.example', password: 'sample-password-1234' });
const ws = (await pool.query("SELECT id FROM workspace WHERE name = 'Saanjh Services' ORDER BY created_at DESC LIMIT 1")).rows[0].id as string;
const agents = (await tool('agent.list')).result.agents as any[];
const riya = agents.find(a => a.name === 'Renewals, Pune');
const camp = ((await tool('campaign.list')).result.campaigns ?? (await tool('campaign.list')).result).find((c: any) => c.name === 'Renewals Oct');
// The version the campaign runs (the control). Not "the latest version": a test's candidate version is newer.
const vRiya = (await pool.query('SELECT agent_version_id AS v FROM campaign WHERE id = $1', [camp.id])).rows[0].v as string;

// 1. calls finish: 40 synthetic people, 30 calls: 14 early hang-ups (6 s), 16 conversations (40 s)
const step = process.argv[2] ?? 'calls';
if (step === 'calls') {
  const rows = ['Name,Mobile,City', ...Array.from({ length: 40 }, (_, i) => `Walk Person ${i + 1},90000 01${String(i).padStart(3, '0')},Pune`)].join('\n');
  const up = (await tool('source.upload', { kind: 'csv', name: 'walk.csv', text: rows, filename: 'walk.csv' })).result;
  const com = await tool('source.commit', { uploadId: up.uploadId, consentPurpose: 'service', audienceName: 'Walk people' });
  log('import', { status: com.status, imported: com.result?.imported ?? com.result });
  const people = (await pool.query("SELECT id FROM contact WHERE workspace_id = $1 AND name LIKE 'Walk Person%' ORDER BY name", [ws])).rows.map(r => r.id);
  const manifest = { combinationId: 'v2|walk', stackId: 'v2-flashlite', agentVersionHash: 'walk', components: { stt: 'gemini', llm: 'gemini-3.5-flash-lite', tts: 'gemini-lite' }, fallbacksUsed: [], memory: 'none', runtimeVersion: 'walk' };
  for (let i = 0; i < 30; i++) {
    const early = i % 15 < 7;
    const attempt = (await pool.query("INSERT INTO attempt (workspace_id, campaign_id, contact_id, status) VALUES ($1,$2,$3,'dialing') RETURNING id", [ws, camp.id, people[i]])).rows[0].id;
    const conv = (await pool.query("INSERT INTO conversation (workspace_id, attempt_id, contact_id, agent_version_id, channel) VALUES ($1,$2,$3,$4,'phone') RETURNING id", [ws, attempt, people[i], vRiya])).rows[0].id;
    const at = () => new Date().toISOString();
    const turns = early
      ? [{ speaker: 'agent', text: 'नमस्ते, मैं रिया, सुरक्षा हेल्थ की AI असिस्टेंट। आपकी policy renewal...', startMs: 0, endMs: 4000 }, { speaker: 'caller', text: 'अभी नहीं।', startMs: 4500, endMs: 5200 }]
      : [{ speaker: 'agent', text: 'नमस्ते, मैं रिया, सुरक्षा हेल्थ की AI असिस्टेंट। दो मिनट हैं?', startMs: 0, endMs: 5000 }, { speaker: 'caller', text: 'हाँ बोलिए।', startMs: 6000, endMs: 7000 },
         { speaker: 'agent', text: 'आपकी renewal 28 को है, link भेज दूँ?', startMs: 8000, endMs: 14000 }, { speaker: 'caller', text: 'हाँ भेज दो, renew कर दूँगा।', startMs: 15000, endMs: 18000 }];
    let s = 1;
    const ev: any[] = [{ seq: s++, type: 'call.started', at: at(), manifest }, ...turns.map(t => ({ seq: s++, type: 'turn', at: at(), ...t })),
      { seq: s++, type: 'call.ended', at: at(), endReason: early ? 'caller_hung_up' : 'agent_ended', durationS: early ? 6 : 40, transcript: turns.map(t => ({ speaker: t.speaker, text: t.text, startMs: t.startMs })), manifest }];
    const body = JSON.stringify({ protocol: 1, conversationId: conv, events: ev });
    const res = await fetch(base + '/hooks/runtime', { method: 'POST', headers: { 'content-type': 'application/json', 'x-vp-signature': sign(SECRET, body) }, body });
    if (!res.ok) throw new Error('hook ' + res.status + ' ' + await res.text());
  }
  await sleep(4000);
  const conv = await pool.query("SELECT count(*) FILTER (WHERE analysis IS NOT NULL) AS analysed, count(*) AS n, count(*) FILTER (WHERE reason_code = 'END_EARLY_HANGUP') AS early FROM conversation WHERE workspace_id = $1", [ws]);
  log('2. analysis', conv.rows[0]);
  log('3. insight.refresh', await tool('insight.refresh', {}));
  log('4. issues', (await tool('issue.list', { status: 'open' })).result);
  log('4b. monitors', (await tool('monitor.list', {})).result?.monitors?.map((m: any) => m.name));
}
if (step === 'learn') {
  log('5a. learning_issue_run', (await pool.query('SELECT status, detail FROM learning_issue_run WHERE workspace_id = $1', [ws])).rows);
  log('5b. proposal.list', (await tool('proposal.list', {})).result);
}
if (step === 'propose') log('5c. learning.propose', await tool('learning.propose', { agentId: riya.id, max: 1 }));
if (step === 'probe') { const p = (await tool('proposal.list', {})).result[0]; log('6. proposal.probe', await tool('proposal.probe', { proposalId: p.id })); }
if (step === 'accept') {
  const p = (await tool('proposal.list', {})).result[0];
  const r = await tool('proposal.accept', { proposalId: p.id });
  log('7a. proposal.accept', r);
  if (r.actionId) log('7b. approve', await approve(r.actionId));
}
if (step === 'start') {
  const e = (await tool('experiment.list', {})).result[0];
  const r = await tool('experiment.start', { experimentId: e.id });
  log('8a. experiment.start', r);
  if (r.actionId) log('8b. approve', await approve(r.actionId));
}
if (step === 'outcomes') {   // outcome.record_verified is for integrations only; a manager labels here
  // What a CRM integration would do: define the outcome on the campaign, then report verified outcomes per call.
  const d = await tool('outcome.define', { name: 'Renewal', question: 'Did the person renew the policy?', allowedValues: ['renewed', 'not_renewed'], goalValues: ['renewed'], verifiedBy: 'crm_field', campaignId: camp.id });
  log('7c. outcome.define', d);
  const defId = d.result?.outcomeDefinitionId ?? d.result?.id;
  const convs = (await pool.query("SELECT id, reason_code FROM conversation WHERE workspace_id = $1 AND agent_version_id = $2 AND contact_id IN (SELECT id FROM contact WHERE name LIKE 'Walk Person%') ORDER BY started_at", [ws, vRiya])).rows;
  let n = 0;
  for (const [k, c] of convs.entries()) {
    const r = await tool('outcome.label', { conversationId: c.id, definitionId: defId, value: c.reason_code === 'END_EARLY_HANGUP' || k % 3 === 0 ? 'not_renewed' : 'renewed' });
    if (r.status === 'confirmed') n++; else if (k === 0) log('record_verified', r);
  }
  log('7d. verified outcomes recorded', { n, of: convs.length, withOutcome: (await pool.query('SELECT count(*) FROM conversation WHERE workspace_id = $1 AND outcome IS NOT NULL', [ws])).rows[0] });
}
// Helpers for volume: import synthetic people, post a call as the runtime would, label its outcome as a manager would.
async function people(n: number, tag: string): Promise<string[]> {
  const rows = ['Name,Mobile,City', ...Array.from({ length: n }, (_, i) => `${tag} ${i + 1},9${String(Date.now() % 1e4).padStart(4, '0')}${String(i).padStart(5, '0')},Pune`)].join('\n');
  const up = (await tool('source.upload', { kind: 'csv', name: tag + '.csv', text: rows, filename: tag + '.csv' })).result;
  await tool('source.commit', { uploadId: up.uploadId, consentPurpose: 'service' });
  return (await pool.query('SELECT id FROM contact WHERE workspace_id = $1 AND name LIKE $2 ORDER BY name', [ws, tag + ' %'])).rows.map(r => r.id);
}
async function postCall(contact: string, versionId: string, early: boolean): Promise<string> {
  const manifest = { combinationId: 'v2|walk', stackId: 'v2-flashlite', agentVersionHash: 'walk', components: { stt: 'gemini', llm: 'gemini-3.5-flash-lite', tts: 'gemini-lite' }, fallbacksUsed: [], memory: 'none', runtimeVersion: 'walk' };
  const attempt = (await pool.query("INSERT INTO attempt (workspace_id, campaign_id, contact_id, status) VALUES ($1,$2,$3,'dialing') RETURNING id", [ws, camp.id, contact])).rows[0].id;
  const conv = (await pool.query("INSERT INTO conversation (workspace_id, attempt_id, contact_id, agent_version_id, channel) VALUES ($1,$2,$3,$4,'phone') RETURNING id", [ws, attempt, contact, versionId])).rows[0].id;
  const turns = early ? [{ speaker: 'agent', text: 'नमस्ते, मैं रिया, AI असिस्टेंट।', startMs: 0, endMs: 3000 }, { speaker: 'caller', text: 'अभी नहीं।', startMs: 3500, endMs: 4200 }]
    : [{ speaker: 'agent', text: 'नमस्ते, मैं रिया, AI असिस्टेंट। दो मिनट हैं?', startMs: 0, endMs: 4000 }, { speaker: 'caller', text: 'हाँ बोलिए।', startMs: 5000, endMs: 6000 }];
  let q = 1; const at = new Date().toISOString();
  const ev: any[] = [{ seq: q++, type: 'call.started', at, manifest }, ...turns.map(t => ({ seq: q++, type: 'turn', at, ...t })),
    { seq: q++, type: 'call.ended', at, endReason: early ? 'caller_hung_up' : 'agent_ended', durationS: early ? 6 : 40, transcript: turns.map(t => ({ speaker: t.speaker, text: t.text, startMs: t.startMs })), manifest }];
  const body = JSON.stringify({ protocol: 1, conversationId: conv, events: ev });
  const res = await fetch(base + '/hooks/runtime', { method: 'POST', headers: { 'content-type': 'application/json', 'x-vp-signature': sign(SECRET, body) }, body });
  if (!res.ok) throw new Error('hook ' + res.status);
  return conv;
}
const defId = async () => (await pool.query('SELECT outcome_definition_id AS d FROM campaign WHERE id = $1', [camp.id])).rows[0].d as string;
if (step === 'more') {   // 80 more labelled calls on the current version, so the shadow A/A has 100+ contacts
  const ids = await people(80, 'More Person'); const d = await defId();
  for (const [k, c] of ids.entries()) { const cv = await postCall(c, vRiya, k % 3 === 0); await tool('outcome.label', { conversationId: cv, definitionId: d, value: k % 5 < 2 ? 'renewed' : 'not_renewed' }); }
  log('more', { calls: ids.length });
}
if (step === 'split') {  // new calls dialled the way the campaign worker does: experiment.assign picks the version per contact
  const n = Number(process.argv[3] ?? 200); const ids = await people(n, 'Split ' + Date.now()); const d = await defId();
  const arms: Record<string, number> = {};
  for (const [k, c] of ids.entries()) {
    const a = (await tool('experiment.assign', { agentId: riya.id, contactId: c })).result;
    if (!a) { log('assign returned nothing', { k }); break; }
    arms[a.arm] = (arms[a.arm] ?? 0) + 1;
    const cv = await postCall(c, a.versionId, false);
    const win = a.arm === 'treatment' ? k % 100 < 60 : k % 100 < 40;     // treatment converts better
    await tool('outcome.label', { conversationId: cv, definitionId: d, value: win ? 'renewed' : 'not_renewed' });
  }
  log('split arms', arms);
}
if (step === 'check') { const e = (await tool('experiment.list', {})).result[0]; log('experiment.check', await tool('experiment.check', { experimentId: e.id })); }
if (step === 'adopt') {   // the admin approves the rollout card, then the next check sees it
  const acts = (await http('GET', '/v1/actions?status=proposed')).json.actions as any[];
  const card = acts.find(a => a.tool === 'deployment.split');
  log('9a. rollout card', card && { summary: card.summary });
  if (card) log('9b. approve rollout', await approve(card.id));
  const e = (await tool('experiment.list', {})).result[0];
  log('9c. experiment.check', (await tool('experiment.check', { experimentId: e.id })).result);
  log('10. draft opening', (await tool('agent.get', { agentId: riya.id })).result.draft.opening);
}
if (step === 'publish') {   // the next published version is compiled from the draft, which now carries the change
  const g = (await tool('agent.get', { agentId: riya.id })).result;
  const r = await tool('version.publish', { agentId: riya.id, draftHash: g.draftHash, note: 'After the opening test' });
  log('11a. publish card', { summary: r.summary });
  const v = await approve(r.actionId);
  const brief = (await pool.query('SELECT number, config->\'brief\'->>\'text\' AS text FROM agent_version WHERE id = $1', [v.result.versionId])).rows[0];
  log('11b. new version carries the change', { number: brief.number, carries: brief.text.includes('Ask if it is a good time for two minutes') });
}
if (step === 'state') {
  log('experiments', (await tool('experiment.list', {})).result);
  log('lessons', (await tool('lesson.list', {})).result);
}
await pool.end();
