// A small typed router on node:http. JSON in and out, a 1 MB body limit, path params, and one place
// that maps errors to responses: 422 for invalid input (with the field path), the HttpError status
// for known failures, and a plain 500 that never leaks a stack trace.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ValidationError } from '../shared/validate.ts';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = 'HttpError'; }
}

export interface Req {
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  headers: IncomingMessage['headers'];
  body: unknown;
  /** The caller's address for throttling (clientIp); absent when a Req is built by hand. */
  ip?: string;
}

/** True for loopback, private, link-local and CGNAT addresses (IPv4, IPv6, and IPv4-mapped IPv6). */
export function isPrivateIp(addr: string): boolean {
  const a = addr.toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a);
  if (v4) {
    const [p, q] = [Number(v4[1]), Number(v4[2])];
    return p === 10 || p === 127 || (p === 172 && q >= 16 && q <= 31) || (p === 192 && q === 168) || (p === 169 && q === 254) || (p === 100 && q >= 64 && q <= 127);
  }
  return a === '::1' || /^f[cd][0-9a-f]{2}:/.test(a) || /^fe[89ab][0-9a-f]:/.test(a);
}

/** The address to throttle on. The socket peer is the client unless it is a trusted proxy (loopback or private by
 *  default; VP_TRUSTED_PROXIES=none trusts nothing). Behind trusted proxies it is the right-most X-Forwarded-For hop
 *  that is not itself a trusted proxy: hops a client adds sit to the left of the one its proxy appended, so a spoofed
 *  header never changes the result. */
export function clientIp(peer: string | undefined, xff: string | string[] | undefined): string {
  const trust = process.env.VP_TRUSTED_PROXIES === 'none' ? () => false : isPrivateIp;
  const me = peer ?? 'unknown';
  if (!trust(me)) return me;
  const hops = (Array.isArray(xff) ? xff.join(',') : xff ?? '').split(',').map(s => s.trim()).filter(Boolean);
  for (let i = hops.length - 1; i >= 0; i--) if (!trust(hops[i])) return hops[i];
  return hops[0] ?? me;
}

export interface Res {
  status?: number; body?: unknown; headers?: Record<string, string | string[]>; raw?: Buffer | string;
  /** Stream the body (e.g. Server-Sent Events). write() flushes a chunk; the response ends when the promise settles.
   *  `closed` aborts when the client goes away. */
  stream?: (write: (chunk: string) => void, closed: AbortSignal) => Promise<void>;
}
export type Handler = (req: Req) => Promise<Res>;

export interface RouteOpts {
  /** Deliver the body as a Buffer (uploads, multipart, signed webhooks that must verify exact bytes). */
  rawBody?: boolean;
  /** Body size limit in bytes (default 1 MB). */
  limit?: number;
}
interface Route { method: string; parts: string[]; handler: Handler; opts: RouteOpts }

const LIMIT = 1_000_000;

async function readBody(req: IncomingMessage, opts: RouteOpts = {}): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const limit = opts.limit ?? LIMIT;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new HttpError(413, 'too_large', `request body is larger than ${Math.round(limit / 1_000_000 * 10) / 10} MB`);
    chunks.push(c as Buffer);
  }
  if (opts.rawBody) return Buffer.concat(chunks);
  if (!size) return undefined;
  const text = Buffer.concat(chunks).toString('utf8');
  const ct = String(req.headers['content-type'] ?? '');
  if (ct.includes('application/json') || /^[\s]*[{[]/.test(text)) {
    try { return JSON.parse(text); } catch { throw new HttpError(400, 'bad_json', 'the request body is not valid JSON'); }
  }
  return text;
}

export class Router {
  private routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler, opts: RouteOpts = {}): this {
    this.routes.push({ method: method.toUpperCase(), parts: pattern.split('/').filter(Boolean), handler, opts });
    return this;
  }

  match(method: string, path: string): { handler: Handler; params: Record<string, string>; opts: RouteOpts } | null {
    const segs = path.split('/').filter(Boolean);
    for (const r of this.routes) {
      if (r.method !== method || r.parts.length !== segs.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < segs.length; i++) {
        const p = r.parts[i];
        if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(segs[i]);
        else if (p !== segs[i]) { ok = false; break; }
      }
      if (ok) return { handler: r.handler, params, opts: r.opts };
    }
    return null;
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://local');
    const send = (status: number, body: unknown, headers: Record<string, string | string[]> = {}) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
      res.end(JSON.stringify(body));
    };
    try {
      const m = this.match(req.method ?? 'GET', url.pathname);
      if (!m) return send(404, { error: { code: 'not_found', message: 'no such route' } });
      const body = await readBody(req, m.opts);
      const out = await m.handler({ method: req.method ?? 'GET', path: url.pathname, params: m.params, query: url.searchParams, headers: req.headers, body,
        ip: clientIp(req.socket.remoteAddress, req.headers['x-forwarded-for']) });
      if (out.stream) {
        res.writeHead(out.status ?? 200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', 'x-accel-buffering': 'no', ...(out.headers ?? {}) });
        const ac = new AbortController();
        res.on('close', () => ac.abort());
        try { await out.stream(chunk => { if (!res.writableEnded) res.write(chunk); }, ac.signal); }
        catch (e) { console.error('[vp] stream failed', e); if (!res.writableEnded) res.write('event: error\ndata: {"message":"the stream failed"}\n\n'); }
        res.end();
        return;
      }
      if (out.raw !== undefined) {
        res.writeHead(out.status ?? 200, out.headers ?? {});
        res.end(out.raw);
        return;
      }
      send(out.status ?? 200, out.body ?? {}, out.headers);
    } catch (e) {
      if (e instanceof ValidationError) return send(422, { error: { code: 'invalid', path: e.path, message: e.message } });
      // After a 413 the rest of the body is still unread on the socket; close it so a keep-alive client's next
      // request is not parsed out of the leftover bytes.
      if (e instanceof HttpError) return send(e.status, { error: { code: e.code, message: e.message } }, e.status === 413 ? { connection: 'close' } : {});
      console.error('[vp] unhandled', e);
      send(500, { error: { code: 'internal', message: 'something went wrong on our side' } });
    }
  }
}
