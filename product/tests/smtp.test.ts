// The notification email client (server/modules/workspace/smtp.ts) against local mail servers: the STARTTLS upgrade with a
// self-signed certificate the test trusts (and refused when it is not trusted), and a server that offers no STARTTLS on an
// address that is not this machine's loopback: nothing is sent, and no password crosses in the clear. No database needed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir, networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server, type Socket, type AddressInfo } from 'node:net';
import { TLSSocket } from 'node:tls';
import { sendMail, type SmtpConfig } from '../server/modules/workspace/smtp.ts';

let dir = '', key: Buffer, cert: Buffer, noOpenssl: string | false = false;
before(() => {
  try {
    dir = mkdtempSync(join(tmpdir(), 'vp-smtp-'));
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '1',
      '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'pipe' });
    key = readFileSync(join(dir, 'k.pem')); cert = readFileSync(join(dir, 'c.pem'));
  } catch { noOpenssl = 'openssl is not installed, so no test certificate can be made'; }
});
after(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

interface Fake { server: Server; port: number; commands: string[]; tlsCommands: string[]; mails: { rcpt: string[]; data: string; secure: boolean }[] }
/** A mail server that speaks just enough SMTP, optionally offering STARTTLS with the test's certificate. */
async function fakeSmtp(o: { starttls: boolean; host?: string }): Promise<Fake> {
  const f: Fake = { server: null as never, port: 0, commands: [], tlsCommands: [], mails: [] };
  const session = (s: Socket | TLSSocket, secure: boolean) => {
    let buf = '', inData = false; const m = { rcpt: [] as string[], data: '', secure };
    const onData = (d: Buffer | string) => {
      buf += d.toString();
      if (inData) { const end = buf.indexOf('\r\n.\r\n'); if (end < 0) return; m.data = buf.slice(0, end); buf = buf.slice(end + 5); inData = false; f.mails.push(m); s.write('250 queued\r\n'); }
      let i: number;
      while (!inData && (i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        (secure ? f.tlsCommands : f.commands).push(line.split(' ')[0].toUpperCase());
        if (/^EHLO/i.test(line)) s.write(`250-test\r\n${o.starttls && !secure ? '250-STARTTLS\r\n' : ''}250 AUTH PLAIN\r\n`);
        else if (/^STARTTLS/i.test(line)) {
          s.write('220 go ahead\r\n');
          s.removeListener('data', onData);
          const t = new TLSSocket(s as Socket, { isServer: true, key, cert });
          session(t, true);
          return;
        }
        else if (/^AUTH/i.test(line)) s.write('235 ok\r\n');
        else if (/^MAIL/i.test(line)) s.write('250 ok\r\n');
        else if (/^RCPT TO:<(.+)>/i.test(line)) { m.rcpt.push(/^RCPT TO:<(.+)>/i.exec(line)![1]); s.write('250 ok\r\n'); }
        else if (/^DATA/i.test(line)) { inData = true; s.write('354 go\r\n'); }
        else if (/^QUIT/i.test(line)) { s.write('221 bye\r\n'); s.end(); }
        else s.write('502 not here\r\n');
      }
    };
    s.on('data', onData);
    s.on('error', () => {});
  };
  f.server = createServer(s => { s.write('220 test ESMTP\r\n'); session(s, false); });
  await new Promise<void>(r => f.server.listen(0, o.host ?? '127.0.0.1', r));
  f.port = (f.server.address() as AddressInfo).port;
  return f;
}
const cfg = (port: number, host: string, extra: Partial<SmtpConfig> = {}): SmtpConfig =>
  ({ host, port, implicitTls: false, user: 'alerts', pass: 'synthetic-pass-not-real', from: 'Vyakti <alerts@vyakti.example>', ...extra });
const mail = { to: ['ops@example.test'], subject: 'Vyakti, Test Co: a caller may be in distress', text: 'A caller may be in distress — open the call in Vyakti.' };

test('STARTTLS: offered, the client upgrades before signing in, and the message travels inside TLS', { skip: noOpenssl || undefined }, async () => {
  if (noOpenssl) return;
  const f = await fakeSmtp({ starttls: true });
  try {
    await sendMail(cfg(f.port, 'localhost', { ca: cert }), mail);
    assert.deepEqual(f.commands, ['EHLO', 'STARTTLS'], 'nothing but EHLO and STARTTLS is said in the clear');
    assert.deepEqual(f.tlsCommands.slice(0, 5), ['EHLO', 'AUTH', 'MAIL', 'RCPT', 'DATA'], 'sign-in and message only after the upgrade (QUIT may still be in flight)');
    assert.equal(f.mails.length, 1); assert.equal(f.mails[0].secure, true);
    assert.deepEqual(f.mails[0].rcpt, ['ops@example.test']);
    assert.match(f.mails[0].data, /A caller may be in distress/);
  } finally { f.server.close(); }
});

test('STARTTLS: a certificate the client does not trust stops the send before any password is sent', { skip: noOpenssl || undefined }, async () => {
  if (noOpenssl) return;
  const f = await fakeSmtp({ starttls: true });
  try {
    await assert.rejects(sendMail(cfg(f.port, 'localhost'), mail), /self[- ]signed|certificate/i);
    assert.deepEqual(f.tlsCommands, [], 'no command, and so no AUTH, went over the untrusted connection');
    assert.ok(!f.commands.includes('AUTH'));
    assert.equal(f.mails.length, 0);
  } finally { f.server.close(); }
});

const external = Object.values(networkInterfaces()).flat().find(a => a && a.family === 'IPv4' && !a.internal)?.address;
test('no STARTTLS on a server that is not this machine: refused, nothing sent, no password in the clear', { skip: external ? undefined : 'no non-loopback IPv4 address on this machine' }, async () => {
  const f = await fakeSmtp({ starttls: false, host: '0.0.0.0' });
  try {
    await assert.rejects(sendMail(cfg(f.port, external!), mail), /does not offer STARTTLS/);
    assert.deepEqual(f.commands, ['EHLO'], 'it stopped after EHLO: no AUTH, MAIL or DATA');
    assert.equal(f.mails.length, 0);
  } finally { f.server.close(); }
});

test('no STARTTLS on this machine (a local relay) is allowed', async () => {
  const f = await fakeSmtp({ starttls: false });
  try {
    await sendMail(cfg(f.port, '127.0.0.1'), mail);
    assert.equal(f.mails.length, 1); assert.equal(f.mails[0].secure, false);
  } finally { f.server.close(); }
});
