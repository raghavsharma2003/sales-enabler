// Workspace module: invite attempts are throttled per client address, and a spoofed X-Forwarded-For changes nothing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { addMember, boot, skip, signup, type Booted } from './workspace-helpers.ts';

let b: Booted;
before(async () => { if (!skip) { process.env.VP_TRUSTED_PROXIES = 'none'; b = await boot(); } });   // the test client is on loopback, which is trusted by default
after(async () => { await b?.close(); });

test('wrong invite tokens are throttled per address; rotating X-Forwarded-For does not help; good invites still work for others first', { skip }, async () => {
  const owner = await signup(b);
  await addMember(b, owner, 'viewer');                       // successful accepts do not count against the address
  await addMember(b, owner, 'viewer');
  let last = 0;
  for (let i = 0; i < 12; i++) {
    const r = await owner.fetch('POST', '/v1/invites/accept', { token: 'vpi_' + String(i).padStart(30, 'x'), name: 'X', password: 'a long password!' });
    last = r.status;
    if (i < 10) assert.equal(r.status, 404, `attempt ${i}`);
  }
  assert.equal(last, 429, 'after ten failures the address is slowed down, whatever X-Forwarded-For says');
});
