// A minimal SMTP client for notification emails (no new packages): EHLO, STARTTLS (required unless the server is on
// this machine), AUTH PLAIN, one message, QUIT. Settings come from the environment; with no VP_SMTP_HOST and
// VP_SMTP_FROM, email is "not set up" and the notifications page says so.
//   VP_SMTP_HOST, VP_SMTP_PORT (587; 465 means TLS from the first byte), VP_SMTP_USER, VP_SMTP_PASS, VP_SMTP_FROM
import { connect as netConnect, isIP, type Socket } from 'node:net';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { randomUUID } from 'node:crypto';

export interface SmtpConfig { host: string; port: number; implicitTls: boolean; user: string | null; pass: string | null; from: string }

export function smtpConfig(env: NodeJS.ProcessEnv = process.env): SmtpConfig | null {
  const host = env.VP_SMTP_HOST?.trim(), from = env.VP_SMTP_FROM?.trim();
  if (!host || !from) return null;
  const port = Number(env.VP_SMTP_PORT ?? 587) || 587;
  return { host, port, implicitTls: port === 465, user: env.VP_SMTP_USER?.trim() || null, pass: env.VP_SMTP_PASS ?? null, from };
}

const EMAIL = /^[^\s@<>"(),;:\\]+@[^\s@<>"(),;:\\]+\.[^\s@<>"(),;:\\]+$/;
export const validEmail = (s: string) => EMAIL.test(s) && s.length <= 254;
const loopback = (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '::1' || (isIP(h) === 4 && h.startsWith('127.'));
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').slice(0, 200);

/** Reads SMTP replies (one or more lines; the last is "NNN text") off a socket. */
class Replies {
  private buf = ''; private waiting: ((r: { code: number; text: string }) => void) | null = null; private failed: Error | null = null;
  private queue: { code: number; text: string }[] = []; private lines: string[] = [];
  constructor(private reject: (e: Error) => void) {}
  attach(s: Socket | TLSSocket) {
    s.setEncoding('utf8');
    s.on('data', (d: string) => this.feed(d));
    s.on('error', e => { this.failed = e; this.reject(e); });
  }
  private feed(d: string) {
    this.buf += d;
    let i: number;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).replace(/\r$/, ''); this.buf = this.buf.slice(i + 1);
      this.lines.push(line);
      if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
        const r = { code: Number(line.slice(0, 3)), text: this.lines.join('\n') }; this.lines = [];
        if (this.waiting) { const w = this.waiting; this.waiting = null; w(r); } else this.queue.push(r);
      }
    }
  }
  next(): Promise<{ code: number; text: string }> {
    if (this.failed) return Promise.reject(this.failed);
    const q = this.queue.shift();
    return q ? Promise.resolve(q) : new Promise(res => { this.waiting = res; });
  }
}

export async function sendMail(cfg: SmtpConfig, m: { to: string[]; subject: string; text: string }, timeoutMs = 10_000): Promise<void> {
  const to = m.to.filter(validEmail);
  if (!to.length) throw new Error('no valid recipient address');
  if (!validEmail(cfg.from.replace(/^.*<([^>]+)>\s*$/, '$1'))) throw new Error('VP_SMTP_FROM is not an email address');
  let sock: Socket | TLSSocket;
  let fail!: (e: Error) => void;
  const failed = new Promise<never>((_, rej) => { fail = rej; });
  failed.catch(() => {});
  let replies = new Replies(fail);
  const timer = setTimeout(() => fail(new Error(`the mail server did not answer within ${timeoutMs / 1000} seconds`)), timeoutMs);
  const open = (s: Socket | TLSSocket) => { sock = s; replies = new Replies(fail); replies.attach(s); };
  const expect = async (want: number[], what: string) => {
    const r = await Promise.race([replies.next(), failed]);
    if (!want.includes(r.code)) throw new Error(`the mail server refused ${what}: ${oneLine(r.text)}`);
    return r;
  };
  const cmd = async (line: string, want: number[], what: string) => { sock.write(line + '\r\n'); return expect(want, what); };
  try {
    open(cfg.implicitTls ? tlsConnect({ host: cfg.host, port: cfg.port, servername: cfg.host }) : netConnect({ host: cfg.host, port: cfg.port }));
    await expect([220], 'the connection');
    let ehlo = await cmd('EHLO vyakti', [250], 'EHLO');
    if (!cfg.implicitTls) {
      if (/STARTTLS/i.test(ehlo.text)) {
        await cmd('STARTTLS', [220], 'STARTTLS');
        const plain = sock!;
        plain.removeAllListeners('data');
        open(tlsConnect({ socket: plain, servername: cfg.host }));
        ehlo = await cmd('EHLO vyakti', [250], 'EHLO');
      } else if (!loopback(cfg.host)) throw new Error('the mail server does not offer STARTTLS, so nothing was sent in the clear');
    }
    if (cfg.user) await cmd('AUTH PLAIN ' + Buffer.from(`\0${cfg.user}\0${cfg.pass ?? ''}`).toString('base64'), [235], 'the sign-in');
    const fromAddr = cfg.from.replace(/^.*<([^>]+)>\s*$/, '$1');
    await cmd(`MAIL FROM:<${fromAddr}>`, [250], 'the sender');
    for (const t of to) await cmd(`RCPT TO:<${t}>`, [250, 251], `the recipient ${t}`);
    await cmd('DATA', [354], 'DATA');
    const body = m.text.replace(/\r?\n/g, '\r\n').split('\r\n').map(l => (l.startsWith('.') ? '.' + l : l)).join('\r\n');
    const subject = `=?UTF-8?B?${Buffer.from(oneLine(m.subject)).toString('base64')}?=`;
    const headers = [`From: ${oneLine(cfg.from)}`, `To: ${to.join(', ')}`, `Subject: ${subject}`, `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${randomUUID()}@vyakti>`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', 'Auto-Submitted: auto-generated'];
    await cmd(headers.join('\r\n') + '\r\n\r\n' + body + '\r\n.', [250], 'the message');
    sock!.write('QUIT\r\n');
  } finally {
    clearTimeout(timer);
    sock!?.end();
  }
}
