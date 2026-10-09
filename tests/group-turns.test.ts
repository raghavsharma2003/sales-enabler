import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticate } from '../lib/server/auth';
import { HttpError } from '../lib/server/http';
import { handleAgentAction } from '../lib/platform/agents';
import { getGroupContext, handleGroupAction, type GroupMemory, type GroupRoom, type GroupWorld } from '../lib/platform/groups';
import { createGroupTurn, listGroupTurns, type GroupTurn } from '../lib/platform/group-turns';
import { listRecords, type PlatformRecord } from '../lib/platform/records';
import { fitsUtf8Budget, utf8ByteLength } from '../lib/server/utf8';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const status = (code: number) => (error: unknown) => error instanceof HttpError && error.status === code;

test('UTF-8 budgets admit exact serialized GroupAI/channel payload boundaries and preserve ASCII limits', () => {
  const seed = 'नमस्ते😀"\\';
  const exact = (limit: number, shape: (value: string) => string) => {
    const remaining = limit - utf8ByteLength(shape(seed));
    assert.ok(remaining > 0);
    const value = seed + 'a'.repeat(remaining);
    const payload = shape(value);
    assert.equal(utf8ByteLength(payload), limit);
    assert.equal(fitsUtf8Budget(payload, limit), true);
    const exceeded = shape(value + 'é');
    assert.equal(utf8ByteLength(exceeded), limit + 2);
    assert.equal(fitsUtf8Budget(exceeded, limit), false);
  };
  exact(11_500, (message) => JSON.stringify({ history: [], current: { participant: 'Student', message } }));
  exact(12_000, (participantMessage) => JSON.stringify({ priorPrivateChat: [], participantMessage }));
  assert.equal(utf8ByteLength('a'.repeat(12_000)), 12_000);
  assert.equal(fitsUtf8Budget('a'.repeat(12_000), 12_000), true);
  assert.equal(fitsUtf8Budget('a'.repeat(12_001), 12_000), false);
});

async function fixture(email: string) {
  const { user } = await authenticate({ mode: 'register', email, password: 'group-turn-password' }, new Request('http://localhost:3000/api/test'));
  const agent = await handleAgentAction(user, 'agent.create', { name: 'Guide', role: 'Advisor', objective: 'Help people with their consultation questions.', disclosure: 'I am an AI advisor.',
    primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Concise and calm', memoryScope: 'none', escalation: 'Ask an operator when facts are missing.', knowledgeIds: [],
    systemPrompt: 'Never disclose PRIVATE AGENT PROMPT secret.' }) as PlatformRecord;
  const world = await handleGroupAction(user, 'group.world.create', { name: 'Family advisory', purpose: 'Consultation', memberName: 'Student', memberRole: 'Customer', attested: true }) as PlatformRecord<GroupWorld>;
  const student = world.data.members[0].id;
  const expandedWorld = await handleGroupAction(user, 'group.world.member', { worldId: world.id, revision: world.revision, name: 'Parent', role: 'Family', attested: true }) as PlatformRecord<GroupWorld>;
  const parent = expandedWorld.data.members[1].id;
  const privateRoom = await handleGroupAction(user, 'group.room.create', { worldId: world.id, name: 'Student private', participantIds: [student] }) as PlatformRecord<GroupRoom>;
  const sharedRoom = await handleGroupAction(user, 'group.room.create', { worldId: world.id, name: 'Family', participantIds: [student, parent] }) as PlatformRecord<GroupRoom>;
  let privateMemory = await handleGroupAction(user, 'group.memory.create', { worldId: world.id, content: 'Student has a private budget concern.', source: 'Student interview', epistemic: 'reported', visibility: 'private', allowedParticipantIds: [student], authoritySource: 'Student authorized private use', attested: true }) as PlatformRecord<GroupMemory>;
  privateMemory = await handleGroupAction(user, 'group.memory.approve', { memoryId: privateMemory.id, revision: privateMemory.revision, attested: true }) as PlatformRecord<GroupMemory>;
  let sharedMemory = await handleGroupAction(user, 'group.memory.create', { worldId: world.id, content: 'Meeting is Tuesday.', source: 'Shared meeting', epistemic: 'observed', visibility: 'shared', allowedParticipantIds: [student, parent], authoritySource: 'Both agreed', attested: true }) as PlatformRecord<GroupMemory>;
  sharedMemory = await handleGroupAction(user, 'group.memory.approve', { memoryId: sharedMemory.id, revision: sharedMemory.revision, attested: true }) as PlatformRecord<GroupMemory>;
  return { user, agent, world: expandedWorld, student, parent, privateRoom, sharedRoom, privateMemory, sharedMemory };
}

test('room turn uses only authorized evidence, binds its agent and request key, and hides prior snapshots', async () => {
  const f = await fixture('group-turn-main@example.test');
  const capsule = await getGroupContext(f.user, f.sharedRoom.id);
  const input = { roomId: f.sharedRoom.id, agentId: f.agent.id, memberId: f.parent, text: 'When is the meeting?', requestId: 'turn-1', snapshotId: capsule.snapshotId };
  let calls = 0;
  const generate = async ({ system, user }: { system: string; user: string }) => {
    calls++;
    assert.match(system, /Meeting is Tuesday/);
    assert.doesNotMatch(system, /private budget|PRIVATE AGENT PROMPT/i);
    assert.match(system, /I am an AI advisor/);
    assert.match(user, /When is the meeting/);
    return 'I am an AI advisor. The meeting is Tuesday.';
  };
  const first = await createGroupTurn(f.user, input, generate);
  assert.equal(first.status, 'replied');
  assert.equal(first.data.actorBinding, 'operator_simulated');
  assert.deepEqual(first.data.evidenceIds, [f.sharedMemory.id]);
  assert.equal((await createGroupTurn(f.user, input, generate)).id, first.id);
  assert.equal(calls, 1);
  await assert.rejects(createGroupTurn(f.user, { ...input, text: 'A different message' }, generate), status(409));
  assert.equal((await listGroupTurns(f.user, f.sharedRoom.id)).length, 1);
  assert.equal((await listGroupTurns(f.user, f.privateRoom.id)).length, 0);
  await assert.rejects(createGroupTurn(f.user, { ...input, memberId: 'outsider', requestId: 'turn-2' }, generate), status(403));
  const other = await fixture('group-turn-other@example.test');
  await assert.rejects(createGroupTurn(other.user, { ...input, requestId: 'turn-3' }, generate), status(404));
  const corrected = await handleGroupAction(f.user, 'group.memory.correct', { memoryId: f.sharedMemory.id, revision: f.sharedMemory.revision, content: 'Meeting is Wednesday.', source: 'Correction' }) as PlatformRecord<GroupMemory>;
  assert.equal(corrected.status, 'proposed');
  assert.equal((await listGroupTurns(f.user, f.sharedRoom.id)).length, 0);
  await assert.rejects(createGroupTurn(f.user, { ...input, requestId: 'turn-4' }, generate), status(409));
});

test('silent room makes no model call and stale evidence invalidates a generated reply', async () => {
  const f = await fixture('group-turn-policy@example.test');
  const silentRoom = await handleGroupAction(f.user, 'group.room.audience', { roomId: f.sharedRoom.id, revision: f.sharedRoom.revision, participantIds: [f.student, f.parent], mode: 'silent' }) as PlatformRecord<GroupRoom>;
  const silentCapsule = await getGroupContext(f.user, silentRoom.id);
  const silent = await createGroupTurn(f.user, { roomId: silentRoom.id, agentId: f.agent.id, memberId: f.student, text: 'Hello', requestId: 'silent', snapshotId: silentCapsule.snapshotId }, async () => { throw new Error('Model must not run'); });
  assert.equal(silent.status, 'silent');
  const replyRoom = await handleGroupAction(f.user, 'group.room.audience', { roomId: silentRoom.id, revision: silentRoom.revision, participantIds: [f.student, f.parent], mode: 'reply' }) as PlatformRecord<GroupRoom>;
  const capsule = await getGroupContext(f.user, replyRoom.id);
  await assert.rejects(createGroupTurn(f.user, { roomId: replyRoom.id, agentId: f.agent.id, memberId: f.student, text: 'Meeting?', requestId: 'stale', snapshotId: capsule.snapshotId }, async () => {
    await handleGroupAction(f.user, 'group.memory.revoke', { memoryId: f.sharedMemory.id, revision: f.sharedMemory.revision });
    return 'I am an AI advisor. Tuesday.';
  }), status(409));
  assert.equal((await listGroupTurns(f.user, replyRoom.id)).length, 0);
  const raw = await listRecords<GroupTurn>(f.user.organizationId, 'group_turn');
  assert.equal(raw.find((turn) => turn.data.requestId === 'stale')?.status, 'invalidated');
});

test('one request key never makes a second model call while processing or after provider failure', async () => {
  const f = await fixture('group-turn-idempotency@example.test');
  const capsule = await getGroupContext(f.user, f.privateRoom.id);
  const input = { roomId: f.privateRoom.id, agentId: f.agent.id, memberId: f.student, text: 'Can you help?', requestId: 'single-flight', snapshotId: capsule.snapshotId };
  let release!: (value: string) => void;
  let calls = 0;
  const pending = createGroupTurn(f.user, input, async () => { calls++; return await new Promise<string>((resolve) => { release = resolve; }); });
  while (!release) await new Promise((resolve) => setTimeout(resolve, 1));
  await assert.rejects(createGroupTurn(f.user, input, async () => { calls++; return 'Duplicate'; }), status(409));
  assert.equal(calls, 1);
  release('I am an AI advisor. How can I help?');
  assert.equal((await pending).status, 'replied');
  const failedInput = { ...input, requestId: 'provider-failure' };
  await assert.rejects(createGroupTurn(f.user, failedInput, async () => { calls++; throw new Error('private provider detail'); }), status(503));
  await assert.rejects(createGroupTurn(f.user, failedInput, async () => { calls++; return 'Unexpected retry'; }), status(409));
  assert.equal(calls, 2);
  const raw = await listRecords<GroupTurn>(f.user.organizationId, 'group_turn');
  assert.equal(raw.find((turn) => turn.data.requestId === 'provider-failure')?.status, 'failed');
});

test('participant audience change during a pending generation blocks reply commit', async () => {
  const f = await fixture('group-turn-audience@example.test');
  const capsule = await getGroupContext(f.user, f.sharedRoom.id);
  let release!: (value: string) => void;
  const pending = createGroupTurn(f.user, { roomId: f.sharedRoom.id, agentId: f.agent.id, memberId: f.student,
    text: 'What is the date?', requestId: 'audience-race', snapshotId: capsule.snapshotId },
  async () => await new Promise<string>((resolve) => { release = resolve; }));
  while (!release) await new Promise((resolve) => setTimeout(resolve, 1));
  await handleGroupAction(f.user, 'group.room.audience', { roomId: f.sharedRoom.id, revision: f.sharedRoom.revision, participantIds: [f.student], mode: 'reply' });
  release('I am an AI advisor. The meeting is Tuesday.');
  await assert.rejects(pending, status(409));
  const raw = await listRecords<GroupTurn>(f.user.organizationId, 'group_turn');
  assert.equal(raw.find((turn) => turn.data.requestId === 'audience-race')?.status, 'invalidated');
  assert.equal((await listGroupTurns(f.user, f.sharedRoom.id)).length, 0);
});

test('follow-up model input includes only complete turns from this room and current snapshot', async () => {
  const f = await fixture('group-turn-history@example.test');
  const privateCapsule = await getGroupContext(f.user, f.privateRoom.id);
  await createGroupTurn(f.user, { roomId: f.privateRoom.id, agentId: f.agent.id, memberId: f.student,
    text: 'PRIVATE QUESTION about budget', requestId: 'private-history', snapshotId: privateCapsule.snapshotId },
  async () => 'PRIVATE AI REPLY about budget');
  const sharedCapsule = await getGroupContext(f.user, f.sharedRoom.id);
  await createGroupTurn(f.user, { roomId: f.sharedRoom.id, agentId: f.agent.id, memberId: f.parent,
    text: 'PUBLIC QUESTION about Tuesday', requestId: 'shared-history', snapshotId: sharedCapsule.snapshotId },
  async () => 'I am an AI advisor. PUBLIC AI REPLY: Tuesday.');
  await createGroupTurn(f.user, { roomId: f.sharedRoom.id, agentId: f.agent.id, memberId: f.student,
    text: 'What did the parent ask?', requestId: 'follow-up', snapshotId: sharedCapsule.snapshotId },
  async ({ user, system }) => {
    const input = JSON.parse(user);
    assert.equal(input.history.length, 1);
    assert.equal(input.history[0].participant, 'Parent');
    assert.equal(input.history[0].message, 'PUBLIC QUESTION about Tuesday');
    assert.equal(input.history[0].aiReply, 'I am an AI advisor. PUBLIC AI REPLY: Tuesday.');
    assert.deepEqual(input.history[0].evidenceIds, [f.sharedMemory.id]);
    assert.equal(input.current.participant, 'Student');
    assert.doesNotMatch(user + system, /PRIVATE QUESTION|PRIVATE AI REPLY|private budget/i);
    return 'I am an AI advisor. The parent asked about Tuesday.';
  });
});

test('GroupAI refuses multibyte provider context before inference and rejects oversized multibyte output without leaking it', async () => {
  const contextFixture = await fixture('group-turn-utf8-context@example.test');
  const privateMarker = 'MULTIBYTE_CONTEXT_MUST_NOT_APPEAR';
  for (let index = 0; index < 2; index++) {
    let memory = await handleGroupAction(contextFixture.user, 'group.memory.create', {
      worldId: contextFixture.world.id,
      content: `${privateMarker}-${index}:${'न'.repeat(1_800)}`,
      source: `Bounded multilingual source ${index}`,
      epistemic: 'reported', visibility: 'shared',
      allowedParticipantIds: [contextFixture.student, contextFixture.parent],
      authoritySource: 'Both participants authorized this test evidence', attested: true,
    }) as PlatformRecord<GroupMemory>;
    memory = await handleGroupAction(contextFixture.user, 'group.memory.approve', {
      memoryId: memory.id, revision: memory.revision, attested: true,
    }) as PlatformRecord<GroupMemory>;
    assert.equal(memory.status, 'approved');
  }
  const capsule = await getGroupContext(contextFixture.user, contextFixture.sharedRoom.id);
  let calls = 0;
  await assert.rejects(
    createGroupTurn(contextFixture.user, {
      roomId: contextFixture.sharedRoom.id, agentId: contextFixture.agent.id,
      memberId: contextFixture.student, text: 'नमस्ते', requestId: 'utf8-context', snapshotId: capsule.snapshotId,
    }, async () => { calls++; return 'must not run'; }),
    (error: unknown) => error instanceof HttpError && error.status === 400 && !error.message.includes(privateMarker),
  );
  assert.equal(calls, 0);
  assert.equal((await listRecords<GroupTurn>(contextFixture.user.organizationId, 'group_turn'))
    .some((turn) => turn.data.requestId === 'utf8-context'), false);

  const outputFixture = await fixture('group-turn-utf8-output@example.test');
  const outputCapsule = await getGroupContext(outputFixture.user, outputFixture.privateRoom.id);
  const oversizedReply = '😀'.repeat(1_000);
  assert.ok(oversizedReply.length < 3_000);
  assert.ok(utf8ByteLength(oversizedReply) > 3_000);
  await assert.rejects(
    createGroupTurn(outputFixture.user, {
      roomId: outputFixture.privateRoom.id, agentId: outputFixture.agent.id,
      memberId: outputFixture.student, text: 'Hello', requestId: 'utf8-output', snapshotId: outputCapsule.snapshotId,
    }, async () => oversizedReply),
    (error: unknown) => error instanceof HttpError && error.status === 503 && !error.message.includes(oversizedReply.slice(0, 8)),
  );
  const failed = (await listRecords<GroupTurn>(outputFixture.user.organizationId, 'group_turn'))
    .find((turn) => turn.data.requestId === 'utf8-output');
  assert.equal(failed?.status, 'failed');
  assert.doesNotMatch(failed?.data.reason || '', /😀/u);
});
