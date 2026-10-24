// Transcript retention and erasure (memory/transcript-purge.ts), and recording deletes that the runtime has not confirmed
// (calls/recording-purge.ts) shown as pending. The words go, the metrics stay, and the call page says why. A fake runtime;
// the real runtime's purge route is covered by product/voice/tests/test_recordings.py. Synthetic data only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, many, one } from '../server/db.ts';
import { FakeRuntime, setRuntime } from '../server/runtime-client.ts';
import type { Actor, Registry } from '../server/tools.ts';
import { modules } from '../server/modules/index.ts';
import { purgeTranscripts, redactAnalysis } from '../server/modules/memory/index.ts';
import { purgeRecordings } from '../server/modules/calls/recording-purge.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry, rt: FakeRuntime;
before(() => { if (skip) return; pool = createPool(process.env.DATABASE_URL); registry = buildApp(pool, modules).registry; rt = new FakeRuntime(); setRuntime(rt); });
after(async () => { setRuntime(null); await pool?.end(); });

let phone = 9300000000;
async function workspace(transcriptsDays?: number) {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('retention test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  if (transcriptsDays) await pool.query("INSERT INTO intake_retention_policy (workspace_id, version, policy, reason) VALUES ($1,1,$2,'test')", [ws, JSON.stringify({ transcripts_days: transcriptsDays })]);
  const actor: Actor = { type: 'member', id: owner, role: 'owner' };
  const call = async (name: string, args: unknown): Promise<any> => {
    const r = await registry.execute<any>(pool, name, args, { workspaceId: ws, actor });
    if (r.status === 'needs_approval') return registry.approve<any>(pool, r.actionId, { workspaceId: ws, memberId: owner });
    return r;
  };
  return { ws, owner, call };
}

const ANALYSIS = {
  status: 'done', summary: 'Synthetic Asha agreed to pay by Friday', reasonCode: 'CONV_GOAL_DONE', quotesProposed: 2, quotesDropped: 0,
  quotes: [{ text: 'haan Friday tak kar dunga', startMs: 2000, speaker: 'caller' }],
  points: [{ claim: 'agreed to pay', quote: 'haan Friday tak kar dunga', startMs: 2000, speaker: 'caller' }],
  outcomeGuess: { value: 'agreed', quote: 'haan Friday tak kar dunga' }, outcomeConfidence: 0.9,
  judge: { judgeVersionId: null, value: 'agreed', quote: 'haan Friday tak kar dunga', calibration: 'uncalibrated' },
  judge_shadow: [{ index: 1, kind: 'none', confidence: 0.1 }],
};

/** A finished call with words in every place they live, plus a cost line. */
async function spokenCall(ws: string, endedDaysAgo: number, o: { recording?: boolean } = {}) {
  const contact = (await one<{ id: string }>(pool, 'INSERT INTO contact (workspace_id, e164, name) VALUES ($1,$2,$3) RETURNING id', [ws, `+91${phone++}`, 'Synthetic Asha']))!.id;
  const id = (await one<{ id: string }>(pool, `INSERT INTO conversation (workspace_id, contact_id, channel, status, started_at, ended_at, outcome, transcript, analysis, recording_uri)
    VALUES ($1,$2,'phone','done', now() - make_interval(days => $3) - interval '3 minutes', now() - make_interval(days => $3), 'agreed', $4, $5, $6) RETURNING id`,
    [ws, contact, endedDaysAgo, JSON.stringify([{ speaker: 'agent', text: 'Namaste, payment reminder', startMs: 0 }, { speaker: 'caller', text: 'haan Friday tak kar dunga', startMs: 2000 }]),
      JSON.stringify(ANALYSIS), o.recording ? 'file:///recordings/x.wav' : null]))!.id;
  await pool.query(`INSERT INTO turn (conversation_id, idx, speaker, text, heard_text, latency, started_ms, ended_ms) VALUES
    ($1,0,'agent','Namaste, payment reminder',NULL,NULL,0,1500), ($1,1,'caller','haan Friday tak kar dunga','haan friday tak kar dunga','{"latencyMs":640}',2000,3500)`, [id]);
  await pool.query("INSERT INTO call_moment (workspace_id, conversation_id, source, kind, at_ms, note, quote) VALUES ($1,$2,'analysis','promise',2000,'promised Friday','haan Friday tak kar dunga')", [ws, id]);
  await pool.query(`INSERT INTO outcome (workspace_id, conversation_id, value, grade, source, evidence) VALUES ($1,$2,'agreed','ai_guess','judge','{"quote":"haan Friday tak kar dunga","by":"judge"}')`, [ws, id]);
  await pool.query(`INSERT INTO hand_off (workspace_id, conversation_id, mode, destination, status, brief) VALUES ($1,$2,'warm','queue','queued','{"reason":"asks_for_human","summary":"Asha wants Friday","seq":3}')`, [ws, id]);
  await pool.query("INSERT INTO cost_line (workspace_id, conversation_id, component, quantity, unit, inr_milli) VALUES ($1,$2,'telephony',180,'second',2400)", [ws, id]);
  return { id, contact };
}

test('analysis redaction keeps codes, counts and verdicts and drops every free-text field', () => {
  const r = redactAnalysis(ANALYSIS) as any;
  assert.deepEqual(Object.keys(r).sort(), ['judge', 'judge_shadow', 'outcomeConfidence', 'outcomeGuess', 'quotesDropped', 'quotesProposed', 'reasonCode', 'status']);
  assert.deepEqual(r.judge, { judgeVersionId: null, value: 'agreed', calibration: 'uncalibrated' });
  assert.deepEqual(r.outcomeGuess, { value: 'agreed' });
  assert.doesNotMatch(JSON.stringify(r), /Friday|Asha/);
});

test('past transcripts_days the words are removed, the metrics stay, and the call page says why', { skip }, async () => {
  const a = await workspace(30), other = await workspace(30);
  const old = await spokenCall(a.ws, 31), recent = await spokenCall(a.ws, 5), otherOld = await spokenCall(other.ws, 31);
  await pool.query(`INSERT INTO call_insight (workspace_id, scope_type, status, themes) VALUES ($1,'workspace','done',$2)`, [a.ws, JSON.stringify([
    { kind: 'objection', title: 'Timing', count: 2, quotedCalls: 2, of: 2, quotes: [
      { conversationId: old.id, text: 'haan Friday tak kar dunga', speaker: 'caller', startMs: 2000 },
      { conversationId: recent.id, text: 'haan Friday tak kar dunga', speaker: 'caller', startMs: 2000 }] }])]);

  const scoped = await purgeTranscripts(pool, { workspaceId: a.ws });
  assert.deepEqual(scoped, { purged: 1, erased: 0, retention: 1 }, 'a run scoped to one workspace touches only its calls');

  const conv = (await one<any>(pool, 'SELECT transcript, analysis, outcome, transcript_purged_at, transcript_purge_reason FROM conversation WHERE id = $1', [old.id]))!;
  assert.deepEqual(conv.transcript, []);
  assert.equal(conv.outcome, 'agreed');
  assert.equal(conv.transcript_purge_reason, 'retention');
  assert.equal(conv.analysis.reasonCode, 'CONV_GOAL_DONE');
  const turns = await many<any>(pool, 'SELECT speaker, text, heard_text, latency, started_ms FROM turn WHERE conversation_id = $1 ORDER BY idx', [old.id]);
  assert.equal(turns.length, 2, 'turn rows stay for timing');
  assert.ok(turns.every(t => t.text === '' && t.heard_text === null));
  assert.equal(turns[1].latency.latencyMs, 640);
  assert.equal(turns[1].started_ms, 2000);
  const moment = (await one<any>(pool, 'SELECT kind, note, quote FROM call_moment WHERE conversation_id = $1', [old.id]))!;
  assert.deepEqual(moment, { kind: 'promise', note: null, quote: null });
  assert.deepEqual((await one<any>(pool, 'SELECT evidence FROM outcome WHERE conversation_id = $1', [old.id]))!.evidence, { by: 'judge' });
  assert.deepEqual((await one<any>(pool, 'SELECT brief FROM hand_off WHERE conversation_id = $1', [old.id]))!.brief, { reason: 'asks_for_human', seq: 3 });
  assert.equal((await one<any>(pool, 'SELECT inr_milli FROM cost_line WHERE conversation_id = $1', [old.id]))!.inr_milli, '2400', 'billing keeps its line');
  const theme = (await one<any>(pool, 'SELECT themes FROM call_insight WHERE workspace_id = $1', [a.ws]))!.themes[0];
  assert.deepEqual(theme.quotes.map((q: any) => q.conversationId), [recent.id], 'only the purged call\'s quote leaves the theme');
  assert.equal(theme.count, 2);

  // Nothing quoted from the person is left anywhere on the call.
  const page = await a.call('call.get', { conversationId: old.id });
  assert.equal(page.status, 'confirmed');
  assert.equal(page.result.transcriptRemoved, 'Transcript removed: this workspace keeps transcripts for 30 days. Timing, outcome and cost are kept.');
  assert.doesNotMatch(JSON.stringify(page.result), /Friday|promised/);

  const fresh = await a.call('call.get', { conversationId: recent.id });
  assert.equal(fresh.result.transcriptRemoved, null);
  assert.match(JSON.stringify(fresh.result.turns), /Friday/, 'a call inside the window keeps its words');
  assert.ok((await one<any>(pool, 'SELECT transcript_purged_at FROM conversation WHERE id = $1', [otherOld.id]))!.transcript_purged_at === null);

  await purgeTranscripts(pool);
  assert.ok((await one<any>(pool, 'SELECT transcript_purged_at FROM conversation WHERE id = $1', [otherOld.id]))!.transcript_purged_at, 'an unscoped run reaches every workspace');
  assert.equal((await purgeTranscripts(pool, { workspaceId: a.ws })).purged, 0, 'a second run finds nothing: idempotent');
});

test("an erasure through intake removes the person's words and audio whatever their age, and the page says why", { skip }, async () => {
  const w = await workspace();                                   // default retention: 180 days, so age is not the cause
  const c = await spokenCall(w.ws, 1, { recording: true });
  const keep = await spokenCall(w.ws, 1, { recording: true });
  const er = await w.call('dpdp.request.execute', { contactId: c.contact, scope: 'erase_me', requestedBy: 'person', evidence: 'verified request on a synthetic call' });
  assert.equal(er.status, 'confirmed', JSON.stringify(er));
  const fr = (await one<any>(pool, 'SELECT scope FROM forget_request WHERE workspace_id = $1 AND contact_id = $2', [w.ws, c.contact]))!;
  assert.equal(fr.scope, 'erase_me', 'intake stores the scope the purges act on');

  const before = await w.call('call.get', { conversationId: c.id });
  assert.equal(before.result.recording.url, null, 'the link is refused at once, before the purge runs');

  assert.deepEqual(await purgeTranscripts(pool, { workspaceId: w.ws }), { purged: 1, erased: 1, retention: 0 });
  rt.purged = []; rt.purgeFails = false;
  assert.deepEqual(await purgeRecordings(pool, { workspaceId: w.ws }), { purged: 1, failed: 0 });
  assert.deepEqual(rt.purged.map(p => [p.id, p.reason]), [[c.id, 'erased']]);

  const page = await w.call('call.get', { conversationId: c.id });
  assert.equal(page.result.transcriptRemoved, "Transcript removed on the person's erasure request. Timing, outcome and cost are kept.");
  assert.equal(page.result.recording.why, 'The recording was deleted because the person asked to be erased.');
  assert.doesNotMatch(JSON.stringify(page.result), /Friday|Asha wants/);
  const kept = await w.call('call.get', { conversationId: keep.id });
  assert.equal(kept.result.transcriptRemoved, null, "someone else's call is untouched");
  assert.ok((await one<any>(pool, 'SELECT recording_uri FROM conversation WHERE id = $1', [keep.id]))!.recording_uri);
});

test('a recording delete the runtime does not confirm is a visible pending erasure, retried until it succeeds', { skip }, async () => {
  const w = await workspace();
  const c = await spokenCall(w.ws, 1, { recording: true });
  await pool.query("INSERT INTO forget_request (workspace_id, contact_id, scope) VALUES ($1,$2,'erase_me')", [w.ws, c.contact]);
  rt.purgeFails = true;
  assert.deepEqual(await purgeRecordings(pool, { workspaceId: w.ws }), { purged: 0, failed: 1 });
  assert.deepEqual(await purgeRecordings(pool, { workspaceId: w.ws }), { purged: 0, failed: 1 });

  const pending = await w.call('erasure.pending', {});
  assert.equal(pending.status, 'confirmed');
  assert.deepEqual(pending.result.recordings.map((r: any) => [r.conversationId, r.tries, r.lastError]), [[c.id, 2, 'runtime unreachable']]);
  assert.deepEqual(pending.result.erasedWithData.map((r: any) => [r.conversationId, r.recordingLeft, r.transcriptLeft]), [[c.id, true, true]]);
  const page = await w.call('call.get', { conversationId: c.id });
  assert.match(page.result.recording.why, /Deleting it is pending: the voice runtime has not confirmed after 2 tries; it is retried every 10 minutes\./);

  rt.purgeFails = false;
  await purgeTranscripts(pool, { workspaceId: w.ws });
  assert.deepEqual(await purgeRecordings(pool, { workspaceId: w.ws }), { purged: 1, failed: 0 });
  const done = await w.call('erasure.pending', {});
  assert.deepEqual(done.result, { recordings: [], erasedWithData: [] });
  const other = await workspace();
  assert.deepEqual((await other.call('erasure.pending', {})).result, { recordings: [], erasedWithData: [] }, 'another workspace sees none of it');
});
