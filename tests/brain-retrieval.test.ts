import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { AuthUser } from '../lib/server/auth';
import { db } from '../lib/server/db';
import { insertEntity } from '../lib/server/store';
import { createRecord, updateRecord } from '../lib/platform/records';
import { answerCompanyQuestion } from '../lib/brain/answer';
import { chunksFromSources, loadApprovedCompanySources, retrieveChunks } from '../lib/brain/retrieval';

process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), 'brain-recall-')), 'test.sqlite');

async function user(): Promise<AuthUser> {
  const database = await db(), id = randomUUID(), organizationId = randomUUID(), now = new Date().toISOString();
  await database.batch([
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [organizationId, 'Fixture', now] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [id, `${id}@example.test`, 'none', organizationId, now] },
  ]);
  return { id, organizationId, email: `${id}@example.test` };
}

type BrainSource = { title: string; content: string; sourceLabel: string; approvedAt?: string; approvedBy?: string; revokedAt?: string };
async function source(owner: AuthUser, title: string, content: string) {
  return createRecord<BrainSource>(owner, 'brain_source', { title, content, sourceLabel: 'Reviewed handbook', approvedAt: new Date().toISOString(), approvedBy: owner.id }, 'approved');
}

test('lexical RRF finds older relevant evidence but excludes foreign and revoked source rows', async () => {
  const owner = await user(), foreign = await user();
  const relevant = await source(owner, 'Visa application deadlines', 'Applications close on 30 June. Send the completed checklist before that date.');
  await source(owner, 'General welcome', 'Our office welcomes visitors on weekdays.');
  await source(foreign, 'Visa application deadlines', 'Applications close on 1 July.');
  const database = await db();
  const found = retrieveChunks('When do visa applications close?', chunksFromSources(await loadApprovedCompanySources(owner, database)));
  assert.equal(found[0]?.sourceId, relevant.id);
  assert.ok(found.every(item => item.text !== 'Applications close on 1 July.'));
  assert.deepEqual(retrieveChunks('hmm?', chunksFromSources(await loadApprovedCompanySources(owner, database))), []);
  await updateRecord(owner, relevant, { ...relevant.data, revokedAt: new Date().toISOString() }, 'revoked');
  const after = retrieveChunks('When do visa applications close?', chunksFromSources(await loadApprovedCompanySources(owner, database)));
  assert.ok(after.every(item => item.sourceId !== relevant.id));
});

test('answer saves exact source quote, replays once, and refuses replay after revocation', async () => {
  const owner = await user(), database = await db();
  const approved = await source(owner, 'Deadlines', 'Applications close on 30 June.');
  let calls = 0;
  const runner = async (_user: AuthUser, input: { input: string }) => {
    calls++;
    const evidence = JSON.parse(input.input).evidence as Array<{ id: string }>;
    return { model: 'fixture', text: JSON.stringify({ answer: 'The approved deadline is 30 June.', insufficient: false,
      citations: [{ id: evidence[0].id, quote: 'Applications close on 30 June.' }] }) };
  };
  const first = await answerCompanyQuestion(owner, 'When do applications close?', 'deadline-1', { database, runner });
  assert.equal(first.insufficient, false);
  assert.equal(first.citations[0].sourceId, approved.id);
  assert.equal(first.citations[0].quote, 'Applications close on 30 June.');
  assert.equal(first.cached, false);
  const replay = await answerCompanyQuestion(owner, 'When do applications close?', 'deadline-1', { database, runner });
  assert.equal(replay.cached, true);
  assert.equal(calls, 1);
  await updateRecord(owner, approved, { ...approved.data, revokedAt: new Date().toISOString() }, 'revoked');
  await assert.rejects(answerCompanyQuestion(owner, 'When do applications close?', 'deadline-1', { database, runner }), /source changed or was revoked/i);
  assert.equal(calls, 1);
});

test('unsupported citation and source change during generation cannot produce a supported saved answer', async () => {
  const owner = await user(), database = await db();
  const approved = await source(owner, 'Fees', 'The application review fee is listed as 500 rupees.');
  const unsupported = await answerCompanyQuestion(owner, 'What is the review fee?', 'bad-quote', { database,
    runner: async (_user, input) => ({ model: 'fixture', text: JSON.stringify({ answer: 'The fee is free.', insufficient: false,
      citations: [{ id: JSON.parse(input.input).evidence[0].id, quote: 'The fee is free.' }] }) }) });
  assert.equal(unsupported.insufficient, true);
  assert.deepEqual(unsupported.citations, []);
  const id = 'source-change';
  await assert.rejects(answerCompanyQuestion(owner, 'What is the review fee?', id, { database,
    runner: async () => {
      await updateRecord(owner, approved, { ...approved.data, content: 'The old fee is withdrawn.', approvedAt: undefined }, 'draft');
      return { model: 'fixture', text: JSON.stringify({ answer: '500 rupees.', insufficient: false, citations: [] }) };
    } }), /source changed or was revoked/i);
  const rows = await database.all('SELECT id FROM entities WHERE organization_id=? AND kind=?', [owner.organizationId, 'platform:brain_answer']);
  assert.equal(rows.length, 1, 'only the earlier insufficient answer may be saved');
});

test('reviewed ingestion knowledge requires applied candidate and current source quote', async () => {
  const owner = await user(), database = await db();
  const quoted = 'Office hours are 10 to 5 on weekdays.';
  const ingestion = await createRecord(owner, 'ingestion_source', { title: 'Office note', digest: 'fixture-digest', text: quoted, rawText: quoted }, 'ready');
  const candidateId = 'c-fixture';
  const knowledgeId = `ingestion-knowledge:${randomUUID()}`;
  const candidate = { id: candidateId, type: 'company_fact', title: 'Office hours', content: 'Weekday office hours are 10 to 5.',
    quote: quoted, sourceRef: { blockId: 'b0001', start: 0, end: quoted.length }, status: 'applied', appliedKnowledgeId: knowledgeId };
  const proposal = await createRecord(owner, 'ingestion_proposal', { sourceId: ingestion.id, sourceDigest: 'fixture-digest', candidates: [candidate] }, 'completed');
  await insertEntity(owner, 'knowledge', { title: candidate.title, content: candidate.content, sourceArtifactId: ingestion.id,
    sourceDigest: 'fixture-digest', sourceQuote: quoted, proposalId: proposal.id, candidateId }, undefined, knowledgeId);
  const available = await loadApprovedCompanySources(owner, database);
  assert.ok(available.some(item => item.sourceId === knowledgeId));
  const grounded = await answerCompanyQuestion(owner, 'What are the office hours?', 'ingestion-hours', { database,
    runner: async (_user, input) => ({ model: 'fixture', text: JSON.stringify({ answer: 'The office is open 10 to 5 on weekdays.', insufficient: false,
      citations: [{ id: JSON.parse(input.input).evidence[0].id, quote: quoted }] }) }) });
  assert.equal(grounded.insufficient, false);
  assert.equal(grounded.citations[0].sourceId, knowledgeId);
  await updateRecord(owner, ingestion, { ...ingestion.data, digest: 'changed-digest' }, 'ready');
  assert.ok(!(await loadApprovedCompanySources(owner, database)).some(item => item.sourceId === knowledgeId));
  await assert.rejects(answerCompanyQuestion(owner, 'What are the office hours?', 'ingestion-hours', { database }), /source changed or was revoked/i);
});

test('an empty answer is invalidated when a newly approved source changes the searchable catalog', async () => {
  const owner = await user(), database = await db();
  const first = await answerCompanyQuestion(owner, 'What are the office hours?', 'empty-then-source', { database,
    runner: async () => { throw new Error('A model call must not run without evidence.'); } });
  assert.equal(first.insufficient, true);
  assert.equal(first.sourceCount, 0);
  await source(owner, 'Office hours', 'The office opens at 10 on weekdays.');
  await assert.rejects(answerCompanyQuestion(owner, 'What are the office hours?', 'empty-then-source', { database }), /knowledge changed/i);
});
