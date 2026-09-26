import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticate } from '../lib/server/auth';
import { HttpError } from '../lib/server/http';
import { getGroupContext, handleGroupAction, type GroupMemory, type GroupRoom, type GroupWorld } from '../lib/platform/groups';
import { getRecord, listRecords, type PlatformRecord } from '../lib/platform/records';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const status = (code: number) => (error: unknown) => error instanceof HttpError && error.status === code;

test('GroupAI filters every audience, tenant, correction, revocation and membership epoch', async () => {
  const request = new Request('http://localhost:3000/api/test');
  const { user } = await authenticate({ mode: 'register', email: 'groups@example.test', password: 'group-test-password', organization: 'Groups team' }, request);
  const { user: outsider } = await authenticate({ mode: 'register', email: 'outsider@example.test', password: 'other-test-password', organization: 'Other team' }, request);
  const act = (action: string, body: Record<string, unknown>) => handleGroupAction(user, action, body);
  let world = await act('group.world.create', { name: 'Advisory', purpose: 'Customer and family', memberName: 'Customer', memberRole: 'Customer', attested: true }) as PlatformRecord<GroupWorld>;
  const customer = world.data.members[0].id;
  world = await act('group.world.member', { worldId: world.id, revision: world.revision, name: 'Parent', role: 'Family', attested: true }) as PlatformRecord<GroupWorld>;
  const parent = world.data.members[1].id;
  let room = await act('group.room.create', { worldId: world.id, name: 'Private', participantIds: [customer] }) as PlatformRecord<GroupRoom>;
  let privateMemory = await act('group.memory.create', { worldId: world.id, content: 'Private budget concern', source: 'Customer private interview', epistemic: 'reported', visibility: 'private', allowedParticipantIds: [customer], authoritySource: 'Customer consent for private advice', attested: true }) as PlatformRecord<GroupMemory>;
  assert.equal((await getGroupContext(user, room.id)).evidence.length, 0, 'Proposals must not enter agent context');
  privateMemory = await act('group.memory.approve', { memoryId: privateMemory.id, revision: privateMemory.revision, attested: true }) as PlatformRecord<GroupMemory>;
  let shared = await act('group.memory.create', { worldId: world.id, content: 'Consultation is Tuesday', source: 'Shared meeting', epistemic: 'observed', visibility: 'shared', allowedParticipantIds: [customer, parent], authoritySource: 'Both participants authorized', attested: true }) as PlatformRecord<GroupMemory>;
  shared = await act('group.memory.approve', { memoryId: shared.id, revision: shared.revision, attested: true }) as PlatformRecord<GroupMemory>;
  const privateCapsule = await getGroupContext(user, room.id);
  assert.equal(privateCapsule.evidence.length, 2);
  assert.match(privateCapsule.text, /Private budget/);

  await assert.rejects(getGroupContext(outsider, room.id), status(404));
  await assert.rejects(handleGroupAction(outsider, 'group.memory.approve', { memoryId: privateMemory.id, revision: privateMemory.revision, attested: true }), status(404));
  await assert.rejects(handleGroupAction(outsider, 'group.room.create', { worldId: world.id, name: 'Foreign', participantIds: [customer] }), status(404));
  assert.equal((await listRecords(outsider.organizationId, 'group_memory')).length, 0);
  await assert.rejects(act('group.room.create', { worldId: world.id, name: 'Unknown', participantIds: ['foreign-person'] }), status(400));
  await assert.rejects(act('group.memory.create', { worldId: world.id, content: 'Invalid private', source: 'test', epistemic: 'reported', visibility: 'private', allowedParticipantIds: [customer, parent], authoritySource: 'test', attested: true }), status(400));

  room = await act('group.room.audience', { roomId: room.id, revision: room.revision, participantIds: [customer, parent], mode: 'reply' }) as PlatformRecord<GroupRoom>;
  const expanded = await getGroupContext(user, room.id);
  assert.deepEqual(expanded.evidence.map((m) => m.id), [shared.id]);
  assert.doesNotMatch(JSON.stringify(expanded), /Private budget|private interview/);
  assert.notEqual(expanded.snapshotId, privateCapsule.snapshotId);
  await assert.rejects(act('group.reply', { roomId: room.id, snapshotId: privateCapsule.snapshotId }), status(409));
  await assert.rejects(act('group.room.audience', { roomId: room.id, revision: 1, participantIds: [customer], mode: 'reply' }), status(409));

  shared = await act('group.memory.correct', { memoryId: shared.id, revision: shared.revision, content: 'Consultation is Wednesday', source: 'Customer corrected the date' }) as PlatformRecord<GroupMemory>;
  assert.equal((await getGroupContext(user, room.id)).evidence.length, 0);
  assert.doesNotMatch((await getGroupContext(user, room.id)).text, /Tuesday/);
  shared = await act('group.memory.approve', { memoryId: shared.id, revision: shared.revision, attested: true }) as PlatformRecord<GroupMemory>;
  assert.match((await getGroupContext(user, room.id)).text, /Wednesday/);
  assert.doesNotMatch((await getGroupContext(user, room.id)).text, /Tuesday/);
  shared = await act('group.memory.revoke', { memoryId: shared.id, revision: shared.revision }) as PlatformRecord<GroupMemory>;
  assert.equal((await getGroupContext(user, room.id)).evidence.length, 0);
  await assert.rejects(act('group.memory.approve', { memoryId: shared.id, revision: shared.revision, attested: true }), status(409));
  await assert.rejects(act('group.memory.correct', { memoryId: shared.id, revision: shared.revision, content: 'Revived', source: 'test' }), status(409));

  room = await act('group.room.audience', { roomId: room.id, revision: room.revision, participantIds: [customer], mode: 'silent' }) as PlatformRecord<GroupRoom>;
  assert.equal((await getGroupContext(user, room.id)).mode, 'silent');
  assert.equal((await getGroupContext(user, room.id)).text, '');
  room = await act('group.room.audience', { roomId: room.id, revision: room.revision, participantIds: [customer], mode: 'reply' }) as PlatformRecord<GroupRoom>;
  const beforeRemoval = await getGroupContext(user, room.id);
  world = await act('group.world.member', { worldId: world.id, revision: world.revision, memberId: customer, active: false, attested: true }) as PlatformRecord<GroupWorld>;
  const removed = await getGroupContext(user, room.id);
  assert.equal(removed.mode, 'silent');
  assert.equal(removed.evidence.length, 0);
  assert.notEqual(beforeRemoval.snapshotId, removed.snapshotId);
  assert.notEqual(beforeRemoval.audienceEpoch, removed.audienceEpoch);
  await assert.rejects(act('group.world.member', { worldId: world.id, revision: world.revision, memberId: customer, active: true, attested: true }), status(400));
  assert.equal((await getRecord(user.organizationId, 'group_memory', shared.id)).status, 'revoked');
});
