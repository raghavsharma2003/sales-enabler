// The duty roster (workspace): weekly hours in the roster's timezone, overrides that put someone on or off duty, and email
// alerts with no listed addresses going to whoever is on shift, else to the role rule. Real Postgres; synthetic people.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createTcp, type Server as TcpServer, type AddressInfo } from 'node:net';
import { addMember, boot, signup, skip, type Booted } from './workspace-helpers.ts';
import { onDuty, onDutyEmails } from '../server/modules/workspace/duty.ts';

let b: Booted, smtp: TcpServer, smtpPort = 0;
const mails: string[][] = [];
before(async () => {
  if (skip) return;
  b = await boot();
  smtp = createTcp(s => {
    const rcpt: string[] = []; let buf = '', data = false;
    s.write('220 test\r\n');
    s.on('data', d => {
      buf += d.toString();
      if (data) { const e = buf.indexOf('\r\n.\r\n'); if (e < 0) return; buf = buf.slice(e + 5); data = false; mails.push(rcpt); s.write('250 ok\r\n'); }
      let i: number;
      while (!data && (i = buf.indexOf('\r\n')) >= 0) {
        const l = buf.slice(0, i); buf = buf.slice(i + 2);
        if (/^EHLO/i.test(l)) s.write('250 test\r\n'); else if (/^RCPT TO:<(.+)>/i.test(l)) { rcpt.push(/<(.+)>/.exec(l)![1]); s.write('250 ok\r\n'); }
        else if (/^DATA/i.test(l)) { data = true; s.write('354 go\r\n'); } else if (/^QUIT/i.test(l)) { s.write('221 bye\r\n'); s.end(); } else s.write('250 ok\r\n');
      }
    });
  });
  await new Promise<void>(r => smtp.listen(0, '127.0.0.1', r));
  smtpPort = (smtp.address() as AddressInfo).port;
});
after(async () => { smtp?.close(); await b?.close(); });

// Monday 26 October 2026, 10:00 IST is 04:30 UTC. Saturday 31 October 10:00 IST is 04:30 UTC.
const MON_10 = new Date('2026-10-26T04:30:00Z'), MON_20 = new Date('2026-10-26T14:30:00Z'), SAT_10 = new Date('2026-10-31T04:30:00Z');

test('on duty: weekly hours in the roster timezone, an off-duty override, an on-duty override, and the role fallback', { skip }, async () => {
  const owner = await signup(b, 'Duty A');
  const op = await addMember(b, owner, 'operator', 'Ravi Operator'), viewer = await addMember(b, owner, 'viewer', 'Vik Viewer');
  const ws = owner.workspaceId!;
  const set = await owner.tool('duty.roster.set', { shifts: [{ memberId: op.memberId, days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }] });
  assert.equal(set.status, 'needs_approval', 'changing who is on duty is a policy change');
  assert.match(set.summary, /1 shift for Ravi Operator/);
  assert.equal((await owner.fetch('POST', `/v1/actions/${set.actionId}/decide`, { approve: true })).body.status, 'confirmed');

  assert.deepEqual((await onDuty(b.pool, ws, MON_10)).map(m => m.id), [op.memberId], 'Monday 10:00 IST: on shift');
  assert.deepEqual(await onDuty(b.pool, ws, MON_20), [], 'Monday 20:00 IST: after hours');
  const fallback = await onDutyEmails(b.pool, ws, SAT_10);
  assert.equal(fallback.via, 'roles'); assert.deepEqual(fallback.emails.sort(), [owner.email, op.email].sort(), 'nobody on shift: the role rule, never the viewer');
  assert.deepEqual(await onDutyEmails(b.pool, ws, MON_10), { emails: [op.email], via: 'roster' });

  // Leave on Monday morning takes Ravi off; the owner covers Saturday.
  assert.equal((await owner.run('duty.override.add', { memberId: op.memberId, from: '2026-10-26T03:30:00Z', to: '2026-10-26T06:30:00Z', onDuty: false, note: 'leave' })).status, 'confirmed');
  const cover = await owner.run('duty.override.add', { memberId: owner.memberId, from: '2026-10-31T02:30:00Z', to: '2026-10-31T12:30:00Z', onDuty: true });
  assert.equal(cover.status, 'confirmed');
  assert.deepEqual(await onDuty(b.pool, ws, MON_10), [], 'on leave');
  assert.deepEqual((await onDuty(b.pool, ws, SAT_10)).map(m => m.id), [owner.memberId], 'covering on Saturday');

  // Refusals: a viewer cannot be on duty; a shift must end after it starts; a time zone must exist.
  assert.match((await owner.run('duty.roster.set', { shifts: [{ memberId: viewer.memberId, days: [1], start: '09:00', end: '10:00' }] })).reason, /only active owners, builders, operators and compliance/);
  assert.match((await owner.run('duty.roster.set', { shifts: [{ memberId: op.memberId, days: [1], start: '22:00', end: '02:00' }] })).reason, /split a shift past midnight/);
  assert.match((await owner.run('duty.roster.set', { shifts: [], timezone: 'Mars/Olympus' })).reason, /not a time zone/);
  assert.equal((await viewer.tool('duty.roster.set', { shifts: [] })).status, 'not_executed', 'a viewer cannot change the roster');
  const other = await signup(b, 'Duty other');
  assert.match((await other.run('duty.roster.set', { shifts: [{ memberId: op.memberId, days: [1], start: '09:00', end: '10:00' }] })).reason, /only active owners/, 'another workspace cannot put our people on duty');

  // A timezone change moves the hours: in Asia/Dubai (UTC+4), 04:30 UTC is 08:30, before a 09:00 start.
  assert.equal((await owner.run('duty.roster.set', { shifts: [{ memberId: op.memberId, days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }], timezone: 'Asia/Dubai' })).status, 'confirmed');
  await b.pool.query('DELETE FROM duty_override WHERE workspace_id = $1', [ws]);
  assert.deepEqual(await onDuty(b.pool, ws, MON_10), []);
  assert.deepEqual((await onDuty(b.pool, ws, new Date('2026-10-26T06:00:00Z'))).map(m => m.id), [op.memberId]);
  const got = (await owner.tool('duty.roster.get')).result;
  assert.equal(got.timezone, 'Asia/Dubai'); assert.deepEqual(got.shifts.map((s: any) => [s.name, s.days, s.start, s.end]), [['Ravi Operator', [1, 2, 3, 4, 5], '09:00', '18:00']]);
});

test('an email alert with no listed addresses goes to whoever is on shift now, else to the role rule', { skip }, async () => {
  const owner = await signup(b, 'Duty mail');
  const op = await addMember(b, owner, 'operator', 'Meena Operator');
  const dest = await owner.run('notification.destination.create', { kind: 'email', name: 'On duty', events: ['crisis'] });
  assert.equal(dest.status, 'confirmed', JSON.stringify(dest));
  Object.assign(process.env, { VP_SMTP_HOST: '127.0.0.1', VP_SMTP_PORT: String(smtpPort), VP_SMTP_FROM: 'alerts@vyakti.example' });
  try {
    assert.equal((await owner.tool('notification.test', { id: dest.result.id, event: 'crisis' })).result.status, 'sent');
    assert.deepEqual(mails.at(-1)!.sort(), [owner.email, op.email].sort(), 'no roster: the role rule');
    assert.equal((await owner.run('duty.roster.set', { shifts: [{ memberId: op.memberId, days: [1, 2, 3, 4, 5, 6, 7], start: '00:00', end: '24:00' }] })).status, 'confirmed');
    assert.equal((await owner.tool('notification.test', { id: dest.result.id, event: 'crisis' })).result.status, 'sent');
    assert.deepEqual(mails.at(-1), [op.email], 'on shift: only the person on duty');
    assert.deepEqual((await owner.tool('duty.roster.get')).result.onDutyNow.map((m: any) => m.name), ['Meena Operator']);
  } finally { for (const k of ['VP_SMTP_HOST', 'VP_SMTP_PORT', 'VP_SMTP_FROM']) delete process.env[k]; }
});
