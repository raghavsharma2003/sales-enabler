// The control plane's HTTP surface. Modules contribute tools (and, rarely, raw routes); the kernel owns
// sign-in, the generic tool endpoint, approvals and the audit check. The web UI and the Operator chat
// both go through POST /v1/tools/:name, so every page action is a tool.
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import type pg from 'pg';
import { bool, obj, opt, str } from '../shared/validate.ts';
import { checkPassword, createSession, endSession, hashPassword, resolveCaller, sessionCookie, type Caller } from './auth.ts';
import { verifyAudit, appendAudit } from './audit.ts';
import { many, one, tx } from './db.ts';
import { HttpError, Router, type Req } from './http.ts';
import { Registry, inScope } from './tools.ts';
import type { Job } from './jobs.ts';

export interface Deps { pool: pg.Pool; registry: Registry; auth: (req: Req) => Promise<Caller> }

/** A module adds tools to the registry and, only when a tool cannot fit (webhooks, file upload, streams), routes. */
export interface Module {
  name: string;
  register(registry: Registry): void;
  routes?(router: Router, deps: Deps): void;
  /** Background work (dispatch loops, nightly rollups, analysis queues). See server/jobs.ts. */
  jobs?(deps: Deps): Job[];
}

const signup = obj({ workspace: str({ min: 2, max: 80 }), name: str({ min: 1, max: 80 }), email: str({ pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, max: 200 }), password: str({ min: 10, max: 200 }) });
const login = obj({ email: str({ max: 200 }), password: str({ max: 200 }) });
const callBody = obj({ args: opt((v: unknown) => v), threadId: opt(str({ max: 40 })) });
const decideBody = obj({ approve: bool() });

// Counters over 15-minute windows, keyed on an account or on clientIp() (never on a raw client header). In-process is
// enough for one replica; move to Postgres when scaled out.
const attempts = new Map<string, { n: number; until: number }>();
const WINDOW_MS = 15 * 60_000;
function throttled(key: string, max: number): boolean {
  const a = attempts.get(key);
  return !!a && a.until > Date.now() && a.n >= max;
}
function count(key: string) {
  const now = Date.now(), a = attempts.get(key);
  attempts.set(key, a && a.until > now ? { n: a.n + 1, until: a.until } : { n: 1, until: now + WINDOW_MS });
}
function throttle(key: string, max = 10) {
  if (throttled(key, max)) throw new HttpError(429, 'slow_down', 'too many attempts; try again in a few minutes');
  count(key);
}
/** Wrong passwords per account: 10 per window from any address, so rotating addresses never buys more guesses. */
const LOGIN_FAILS_PER_ACCOUNT = 10;
/** Sign-in requests per address: generous, it only slows one source spraying many accounts. */
const LOGIN_PER_IP = 50;

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac' };

export function buildApp(pool: pg.Pool, modules: Module[], opts: { webRoot?: string } = {}): { router: Router; registry: Registry; server: Server; deps: Deps; jobs: Job[] } {
  const registry = new Registry();
  for (const m of modules) m.register(registry);
  const router = new Router();
  const auth = (req: Req) => resolveCaller(pool, req);
  const deps: Deps = { pool, registry, auth };

  router.add('GET', '/v1/health', async () => ({ body: { ok: true } }));

  router.add('POST', '/v1/signup', async req => {
    const b = signup(req.body);
    throttle('signup:' + (req.ip ?? 'local'));
    const pw = await hashPassword(b.password);
    const out = await tx(pool, async c => {
      if (await one(c, 'SELECT 1 FROM member WHERE lower(email) = lower($1)', [b.email])) throw new HttpError(409, 'exists', 'that email already has a workspace; sign in instead');
      const ws = await one<{ id: string }>(c, 'INSERT INTO workspace (name) VALUES ($1) RETURNING id', [b.workspace]);
      const mem = await one<{ id: string }>(c, "INSERT INTO member (workspace_id, email, name, role, status, password_hash) VALUES ($1,$2,$3,'owner','active',$4) RETURNING id", [ws!.id, b.email, b.name, pw]);
      await c.query('INSERT INTO wallet (workspace_id) VALUES ($1) ON CONFLICT DO NOTHING', [ws!.id]);
      await appendAudit(c, { workspaceId: ws!.id, actorType: 'member', actorId: mem!.id, action: 'workspace.create' });
      const s = await createSession(c, mem!.id);
      return { workspaceId: ws!.id, memberId: mem!.id, s };
    });
    return { status: 201, body: { workspaceId: out.workspaceId, memberId: out.memberId }, headers: { 'set-cookie': sessionCookie(out.s.token, out.s.expiresAt) } };
  });

  router.add('POST', '/v1/login', async req => {
    const b = login(req.body);
    const acct = 'login-fail:' + b.email.toLowerCase();
    if (throttled(acct, LOGIN_FAILS_PER_ACCOUNT)) throw new HttpError(429, 'slow_down', 'too many sign-in attempts; try again in a few minutes');
    throttle('login-ip:' + (req.ip ?? 'local'), LOGIN_PER_IP);
    const m = await one<{ id: string; password_hash: string | null }>(pool, "SELECT id, password_hash FROM member WHERE lower(email) = lower($1) AND status = 'active' LIMIT 1", [b.email]);
    if (!(await checkPassword(b.password, m?.password_hash ?? null)) || !m) {
      count(acct);
      throw new HttpError(401, 'unauthorised', 'that email and password do not match');
    }
    const s = await createSession(pool, m.id);
    return { body: { memberId: m.id }, headers: { 'set-cookie': sessionCookie(s.token, s.expiresAt) } };
  });

  router.add('POST', '/v1/logout', async req => {
    const tok = /(?:^|;\s*)vp_session=([^;]+)/.exec(String(req.headers['cookie'] ?? ''))?.[1];
    if (tok) await endSession(pool, tok);
    return { body: { ok: true }, headers: { 'set-cookie': 'vp_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' } };
  });

  router.add('GET', '/v1/me', async req => {
    const c = await auth(req);
    const ws = await one(pool, 'SELECT id, name, region, plan, status, settings FROM workspace WHERE id = $1', [c.workspaceId]);
    const me = c.memberId ? await one(pool, 'SELECT id, email, name, role FROM member WHERE id = $1', [c.memberId]) : null;
    return { body: { workspace: ws, member: me, via: c.via } };
  });

  router.add('GET', '/v1/tools', async req => { await auth(req); return { body: { tools: registry.list() } }; });

  router.add('POST', '/v1/tools/:name', async req => {
    const c = await auth(req);
    const b = callBody(req.body ?? {});
    const r = await registry.execute(pool, req.params.name, b.args ?? {}, { workspaceId: c.workspaceId, actor: c.actor, threadId: b.threadId });
    const status = r.status === 'confirmed' ? 200 : r.status === 'needs_approval' ? 202 : r.status === 'unknown' ? 200 : r.path ? 422 : 409;
    return { status, body: r };
  });

  // Kernel routes that are not tools are scope-checked like tools: a narrowed key reads them only with that scope.
  const needScope = (c: Caller, scope: string) => {
    if (!inScope(c.actor.scopes, scope)) throw new HttpError(403, 'out_of_scope', `this API key's scopes do not include ${scope}`);
  };

  router.add('GET', '/v1/actions', async req => {
    const c = await auth(req);
    needScope(c, 'action.list');
    const st = req.query.get('status') ?? 'proposed';
    const rows = await many(pool, `SELECT id, tool, args, risk_class, status, summary, proposed_by, created_at, expires_at, executed_at, result
      FROM action WHERE workspace_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 100`, [c.workspaceId, st]);
    return { body: { actions: rows } };
  });

  router.add('POST', '/v1/actions/:id/decide', async req => {
    const c = await auth(req);
    if (!c.memberId || c.via === 'key') throw new HttpError(403, 'human_only', 'approvals need a signed-in person, not an API key');
    const b = decideBody(req.body);
    if (!b.approve) return { body: { declined: await registry.decline(pool, req.params.id, { workspaceId: c.workspaceId, memberId: c.memberId }) } };
    const r = await registry.approve(pool, req.params.id, { workspaceId: c.workspaceId, memberId: c.memberId });
    return { status: r.status === 'confirmed' ? 200 : 409, body: r };
  });

  router.add('GET', '/v1/audit/verify', async req => {
    const c = await auth(req);
    needScope(c, 'audit.verify');
    const broken = await verifyAudit(pool, c.workspaceId);
    return { body: { intact: broken === null, firstBroken: broken } };
  });

  for (const m of modules) m.routes?.(router, deps);

  const webRoot = opts.webRoot;
  const server = createServer(async (req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    if (webRoot && req.method === 'GET' && !path.startsWith('/v1/') && !path.startsWith('/hooks/')) {
      const rel = normalize(path).replace(/^([/\\])+/, '');
      const file = join(webRoot, rel && !rel.startsWith('..') && extname(rel) ? rel : 'index.html');
      try {
        const data = await readFile(file);
        res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream',
          'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
          'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin' });
        res.end(data);
      } catch { res.writeHead(404).end(); }
      return;
    }
    await router.handle(req, res);
  });
  const jobs = modules.flatMap(m => m.jobs?.(deps) ?? []);
  return { router, registry, server, deps, jobs };
}
