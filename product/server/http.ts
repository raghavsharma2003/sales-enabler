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
}

export interface Res {
  status?: number; body?: unknown; headers?: Record<string, string>; raw?: Buffer | string;
  /** Stream the body (e.g. Server-Sent Events). write() flushes a chunk; the response ends when the promise settles.
   *  `closed` aborts when the client goes away. */
  stream?: (write: (chunk: string) => void, closed: AbortSignal) => Promise<void>;
}
export type Handler = (req: Req) => Promise<Res>;

interface Route { method: string; parts: string[]; handler: Handler }

const LIMIT = 1_000_000;

async function readBody(req: IncomingMessage): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > LIMIT) throw new HttpError(413, 'too_large', 'request body is larger than 1 MB');
    chunks.push(c as Buffer);
  }
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

  add(method: string, pattern: string, handler: Handler): this {
    this.routes.push({ method: method.toUpperCase(), parts: pattern.split('/').filter(Boolean), handler });
    return this;
  }

  match(method: string, path: string): { handler: Handler; params: Record<string, string> } | null {
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
      if (ok) return { handler: r.handler, params };
    }
    return null;
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://local');
    const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
      res.end(JSON.stringify(body));
    };
    try {
      const m = this.match(req.method ?? 'GET', url.pathname);
      if (!m) return send(404, { error: { code: 'not_found', message: 'no such route' } });
      const body = await readBody(req);
      const out = await m.handler({ method: req.method ?? 'GET', path: url.pathname, params: m.params, query: url.searchParams, headers: req.headers, body });
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
      if (e instanceof HttpError) return send(e.status, { error: { code: e.code, message: e.message } });
      console.error('[vp] unhandled', e);
      send(500, { error: { code: 'internal', message: 'something went wrong on our side' } });
    }
  }
}
