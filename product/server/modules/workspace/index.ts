// Workspace module: team and roles, API keys, brand, knowledge, offerings, integrations, webhooks and the results that
// leave Vyakti (call records, the calls export), activity, search, sharing.
import type { Module } from '../../app.ts';
import { HttpError } from '../../http.ts';
import { createSession, sessionCookie } from '../../auth.ts';
import { appendAudit } from '../../audit.ts';
import { one, tx } from '../../db.ts';
import { obj, opt, str } from '../../../shared/validate.ts';
import { registerActivity } from './activity.ts';
import { registerApiKeys } from './apikeys.ts';
import { auditExportRoutes, auditRetentionJob, registerAuditExport } from './audit-export.ts';
import { registerScim, scimRoutes } from './scim.ts';
import { registerSso, ssoRoutes } from './sso.ts';
import { registerBrand, brandView, primaryBrand } from './brand.ts';
import { registerIntegrations } from './integrations.ts';
import { registerKnowledge } from './knowledge.ts';
import { acceptInvite, registerMembers } from './members.ts';
import { registerOffering } from './offering.ts';
import { registerSearch } from './search.ts';
import { registerShare, viewShared } from './share.ts';
import { registerUndo } from './undo.ts';
import { deliverPending, registerWebhooks } from './webhooks.ts';
import { registerResults, resultsRoutes } from './results.ts';
import { registerNotifications, sendNotifications, startNotifier } from './notifications.ts';
import { registerDuty } from './duty.ts';
import { tool } from '../../tools.ts';

const accept = obj({ token: str({ min: 20, max: 200 }), name: str({ min: 1, max: 80 }), password: str({ min: 10, max: 200 }) });
const upload = obj({ title: opt(str({ min: 1, max: 200 })), filename: opt(str({ max: 200 })), text: opt(str({ max: 2_000_000 })), contentBase64: opt(str({ max: 12_500_000 })) });

// Failed invite attempts per client address (Req.ip: the socket peer or the right-most untrusted forwarded hop, never a raw header).
// Only failures count, so a team accepting invites from one office address is not locked out.
const failures = new Map<string, { n: number; until: number }>();
const WINDOW_MS = 15 * 60_000, MAX_FAILURES = 10;
const tooMany = (key: string) => { const a = failures.get(key); return !!a && a.until > Date.now() && a.n >= MAX_FAILURES; };
function fail(key: string) {
  const now = Date.now(), a = failures.get(key);
  failures.set(key, a && a.until > now ? { n: a.n + 1, until: a.until } : { n: 1, until: now + WINDOW_MS });
}

export const module: Module = {
  name: 'workspace',

  register(registry) {
    registry.register(tool(obj({}), {
      name: 'workspace.get', risk: 'read', summary: 'Read this workspace: its name, plan, brand and who is in it',
      run: async ctx => {
        const ws = await one(ctx.q, 'SELECT id, name, region, plan, status, created_at AS "createdAt" FROM workspace WHERE id = $1', [ctx.workspaceId]);
        const b = await primaryBrand(ctx);
        const n = await one<{ members: number; invited: number; keys: number; knowledge: number; integrations: number; webhooks: number }>(ctx.q,
          `SELECT (SELECT count(*)::int FROM member WHERE workspace_id = $1 AND status = 'active') AS members,
                  (SELECT count(*)::int FROM member WHERE workspace_id = $1 AND status = 'invited') AS invited,
                  (SELECT count(*)::int FROM api_key WHERE workspace_id = $1 AND revoked_at IS NULL) AS keys,
                  (SELECT count(*)::int FROM knowledge_source WHERE workspace_id = $1) AS knowledge,
                  (SELECT count(*)::int FROM integration WHERE workspace_id = $1 AND status = 'connected') AS integrations,
                  (SELECT count(*)::int FROM webhook_endpoint WHERE workspace_id = $1 AND status = 'active') AS webhooks`, [ctx.workspaceId]);
        return { workspace: ws, brand: b ? brandView(b) : null, counts: n };
      },
    }));
    registerMembers(registry);
    registerApiKeys(registry);
    registerBrand(registry);
    registerKnowledge(registry);
    registerOffering(registry);
    registerIntegrations(registry);
    registerWebhooks(registry);
    registerResults(registry);
    registerNotifications(registry);
    registerDuty(registry);
    registerActivity(registry);
    registerUndo(registry);
    registerSearch(registry);
    registerShare(registry);
    registerSso(registry);
    registerScim(registry);
    registerAuditExport(registry);
  },

  jobs: () => [auditRetentionJob],

  routes(router, { pool, registry, auth }) {
    // The invitee has no account yet: the invite token is the credential. They set a name and password and are signed in.
    router.add('POST', '/v1/invites/accept', async req => {
      const b = accept(req.body);
      const key = 'invite:' + (req.ip ?? 'local');
      if (tooMany(key)) throw new HttpError(429, 'slow_down', 'too many attempts; try again in a few minutes');
      try {
        const out = await tx(pool, async c => {
          const m = await acceptInvite(c, b.token, b.name, b.password);
          // A password made here would be a way around "SSO required": the invitee signs in with SSO instead, which links them.
          if (await one(c, 'SELECT 1 FROM sso_config WHERE workspace_id = $1 AND sso_required AND enabled', [m.workspaceId])) {
            throw new HttpError(403, 'sso_required', 'this workspace signs in with single sign-on; use "Sign in with SSO" with this email address');
          }
          await appendAudit(c, { workspaceId: m.workspaceId, actorType: 'member', actorId: m.memberId, action: 'member.accept_invite', objectType: 'member', objectId: m.memberId });
          return { ...m, s: await createSession(c, m.memberId) };
        });
        return { status: 201, body: { workspaceId: out.workspaceId, memberId: out.memberId }, headers: { 'set-cookie': sessionCookie(out.s.token, out.s.expiresAt) } };
      } catch (e) {
        if ((e as { notFound?: boolean }).notFound) { fail(key); throw new HttpError(404, 'invalid_invite', (e as Error).message); }
        throw e;
      }
    });

    // The file is the request body (application/pdf, the DOCX type, text/plain or application/octet-stream) up to 9 MB, with
    // ?filename= and ?title=. A JSON body ({filename, contentBase64} or {text}) still works. Multipart forms are not parsed.
    router.add('POST', '/v1/uploads/knowledge', async req => {
      const c = await auth(req);
      let input: ReturnType<typeof upload>;
      const raw = req.body as Buffer;
      if (String(req.headers['content-type'] ?? '').includes('application/json')) {
        try { input = upload(JSON.parse(raw.toString('utf8'))); } catch (e) { if (e instanceof SyntaxError) throw new HttpError(400, 'bad_json', 'the request body is not valid JSON'); throw e; }
      } else {
        if (!raw?.length) throw new HttpError(422, 'empty', 'send the file as the request body');
        input = upload({ filename: req.query.get('filename') ?? undefined, title: req.query.get('title') ?? undefined, contentBase64: raw.toString('base64') });
      }
      const r = await registry.execute(pool, 'knowledge.ingest', input, { workspaceId: c.workspaceId, actor: c.actor });
      return { status: r.status === 'confirmed' ? 201 : r.status === 'not_executed' ? 422 : 409, body: r };
    }, { rawBody: true, limit: 9_500_000 });

    // Public, read-only, signed. Every failure looks the same.
    router.add('GET', '/v1/share/:token', async req => {
      const v = await viewShared(pool, req.params.token);
      if (!v) throw new HttpError(404, 'not_found', 'this link is not valid or has expired');
      return { body: v, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } };
    });

    ssoRoutes(router, pool, auth);
    scimRoutes(router, pool);
    auditExportRoutes(router, pool, auth);
    resultsRoutes(router, pool, auth);

    // Send queued webhooks every few seconds while the server runs. unref() so it never holds a process open.
    // Notifications go out at once when an event commits (LISTEN vp_outbox), and on the same timer as a safety net.
    if (process.env.NODE_ENV !== 'test') {
      setInterval(() => {
        deliverPending(pool).catch(e => console.error('[vp] webhook delivery', e));
        sendNotifications(pool).catch(e => console.error('[vp] notifications', e));
      }, 5000).unref();
      startNotifier(pool, () => sendNotifications(pool));
    }
  },
};

export { deliverPending } from './webhooks.ts';
export { integrationSecrets } from './integrations.ts';
