// Shared by tests/workspace*.test.ts: boots the real app on an ephemeral port against the test database,
// and builds small synthetic PDF and DOCX files in memory (no fixtures, no real documents).
import { createServer, type Server } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { crc32 } from 'node:zlib';
import type pg from 'pg';

process.env.NODE_ENV = 'test';                              // keeps the module's webhook timer off; tests call deliverPending themselves
process.env.VP_SECRET_KEY ??= randomBytes(32).toString('hex');
process.env.VP_WEBHOOK_ALLOW_PRIVATE = '1';                 // receivers in tests are on 127.0.0.1

import { buildApp } from '../server/app.ts';
import { createPool } from '../server/db.ts';
import { module as workspace } from '../server/modules/workspace/index.ts';

export const DATABASE = process.env.DATABASE_URL;
export const skip = !DATABASE ? 'DATABASE_URL not set' : false;

export interface Booted { pool: pg.Pool; base: string; server: Server; close(): Promise<void> }

export async function boot(): Promise<Booted> {
  const pool = createPool(DATABASE);
  const { server } = buildApp(pool, [workspace]);
  await new Promise<void>(res => server.listen(0, '127.0.0.1', res));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { pool, base, server, close: async () => { server.close(); server.closeAllConnections?.(); await pool.end(); } };
}

export interface Receipt { status: string; [k: string]: any }

/** A signed-in caller: a session cookie or an API key. */
export class Client {
  constructor(public base: string, public auth: { cookie?: string; bearer?: string }, public memberId?: string, public workspaceId?: string) {}
  async fetch(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; body: any; headers: Headers }> {
    const headers: Record<string, string> = { 'x-forwarded-for': randomUUID(), ...extra };
    if (this.auth.cookie) headers.cookie = this.auth.cookie;
    if (this.auth.bearer) headers.authorization = `Bearer ${this.auth.bearer}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const r = await fetch(this.base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let parsed: any = text; try { parsed = JSON.parse(text); } catch { /* keep text */ }
    return { status: r.status, body: parsed, headers: r.headers };
  }
  /** Call a tool; returns the kernel receipt as is. */
  async tool(name: string, args: unknown = {}): Promise<Receipt> { return (await this.fetch('POST', `/v1/tools/${name}`, { args })).body; }
  /** Call a tool and, if it needs approval, have `approver` (default: this caller) approve it. Returns the final receipt. */
  async run(name: string, args: unknown = {}, approver: Client = this): Promise<Receipt> {
    const r = await this.tool(name, args);
    if (r.status !== 'needs_approval') return r;
    return (await approver.fetch('POST', `/v1/actions/${r.actionId}/decide`, { approve: true })).body;
  }
}

export async function signup(b: Booted, label = 'Test Co'): Promise<Client & { email: string }> {
  const email = `owner-${randomUUID().slice(0, 8)}@example.test`;
  const res = await fetch(b.base + '/v1/signup', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': randomUUID() },
    body: JSON.stringify({ workspace: `${label} ${randomUUID().slice(0, 4)}`, name: 'Asha Owner', email, password: 'correct horse battery' }),
  });
  const body = await res.json() as { workspaceId: string; memberId: string };
  const cookie = /vp_session=[^;]+/.exec(res.headers.get('set-cookie') ?? '')![0];
  return Object.assign(new Client(b.base, { cookie }, body.memberId, body.workspaceId), { email });
}

/** Invite someone (the owner approves), read the invite once, accept it, and return the new member signed in. */
export async function addMember(b: Booted, owner: Client, role: string, name = 'New Member'): Promise<Client & { email: string }> {
  const email = `m-${randomUUID().slice(0, 8)}@example.test`;
  const inv = await owner.run('member.invite', { email, role });
  if (inv.status !== 'confirmed') throw new Error('invite failed: ' + JSON.stringify(inv));
  const shown = await owner.tool('secret.reveal', { revealId: inv.result.revealId });
  const res = await fetch(b.base + '/v1/invites/accept', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': randomUUID() },
    body: JSON.stringify({ token: shown.result.token, name, password: 'another long password' }),
  });
  if (res.status !== 201) throw new Error('accept failed: ' + await res.text());
  const out = await res.json() as { memberId: string; workspaceId: string };
  const cookie = /vp_session=[^;]+/.exec(res.headers.get('set-cookie') ?? '')![0];
  return Object.assign(new Client(b.base, { cookie }, out.memberId, out.workspaceId), { email });
}

// ---- synthetic documents ---------------------------------------------------------------------------------------

/** A tiny valid PDF with Helvetica text; each page is a list of lines. ASCII only. */
export function makePdf(pages: string[][]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, m => '\\' + m);
  const objs: string[] = [];
  const pageIds = pages.map((_, i) => 4 + i * 2);
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${pageIds.map(i => `${i} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((lines, i) => {
    const stream = lines.map((l, n) => `BT /F1 11 Tf 56 ${760 - n * 16} Td (${esc(l)}) Tj ET`).join('\n');
    objs[4 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`;
    objs[5 + i * 2] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  });
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let i = 1; i < objs.length; i++) { offsets[i] = Buffer.byteLength(out); out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

function zipStored(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, 'utf8'), nm = Buffer.from(name), crc = crc32(data);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(0x21, 12); l.writeUInt32LE(crc, 14);
    l.writeUInt32LE(data.length, 18); l.writeUInt32LE(data.length, 22); l.writeUInt16LE(nm.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(offset, 42);
    locals.push(l, nm, data); centrals.push(c, nm);
    offset += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** A minimal Word document: one paragraph per string. */
export function makeDocx(paragraphs: string[]): Buffer {
  const x = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return zipStored({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map(p => `<w:p><w:r><w:t>${x(p)}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`,
  });
}
