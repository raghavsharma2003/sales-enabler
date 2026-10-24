// Workspace HTTP tools for calls (must-be audit, brief 3, control-plane half): define, edit, list and dry-run a tool
// against shared/contracts/http-tool.ts. A tool row (table `tool`, kind 'http') holds the spec; the secret stays in its
// integration and is never returned. A dry run builds the exact request (secret masked) and reads a fake response, so
// nothing leaves VP. Granting (tool.attach) and the version snapshot live in index.ts.
import { checkSpec, buildRequest, HttpToolError, readResult, validateArgs, IN_CALL_RISKS, MAX_TIMEOUT_MS, type HttpToolSpec } from '../../../shared/contracts/http-tool.ts';
import { any, arr, bool, num, obj, opt, record, str, uuid, ValidationError } from '../../../shared/validate.ts';
import { many, one } from '../../db.ts';
import { tool, type Registry, type ToolCtx } from '../../tools.ts';

const argSchema = obj({ type: str({ oneOf: ['string', 'number', 'integer', 'boolean'] }), description: opt(str({ max: 200 })),
  enum: opt(arr(any(), { max: 20 })), maxLength: opt(num({ int: true, min: 1, max: 500 })), minimum: opt(num()), maximum: opt(num()) });
const fields = {
  name: str({ min: 2, max: 40, desc: 'the function name she calls: lowercase letters, digits and underscores' }),
  description: str({ min: 1, max: 300, desc: 'when she should use it, in plain words' }),
  input: obj({ type: str({ oneOf: ['object'] }), properties: record(argSchema, { maxKeys: 8 }), required: opt(arr(str({ max: 40 }), { max: 8 })) }),
  method: str({ oneOf: ['GET', 'POST'] }),
  url: str({ min: 8, max: 500, desc: 'https URL; {argument} placeholders are filled in' }),
  query: opt(arr(str({ max: 40 }), { max: 8 })), body: opt(arr(str({ max: 40 }), { max: 8 })),
  integrationId: opt(uuid()), authHeader: opt(str({ max: 40 })), secretKey: opt(str({ max: 60 })), authPrefix: opt(str({ max: 20 })),
  timeoutMs: opt(num({ int: true, min: 100, max: MAX_TIMEOUT_MS })),
  risk: str({ oneOf: IN_CALL_RISKS, desc: "'read' looks something up; 'draft' writes a note or record" }),
  resultFields: arr(str({ max: 120 }), { min: 1, max: 12 }),
};
type Fields = { [K in keyof typeof fields]: ReturnType<(typeof fields)[K]> };

function toSpec(i: Fields): HttpToolSpec {
  return {
    contract: 1, kind: 'http', name: i.name, description: i.description,
    input: { type: 'object', properties: i.input.properties as HttpToolSpec['input']['properties'], ...(i.input.required ? { required: i.input.required } : {}) },
    request: { method: i.method as 'GET' | 'POST', url: i.url, ...(i.query ? { query: i.query } : {}), ...(i.body ? { body: i.body } : {}) },
    auth: i.integrationId ? { integrationId: i.integrationId, header: i.authHeader ?? 'authorization', secretKey: i.secretKey ?? '', ...(i.authPrefix ? { prefix: i.authPrefix } : {}) } : null,
    timeoutMs: i.timeoutMs ?? 2000, risk: i.risk as HttpToolSpec['risk'], result: { fields: i.resultFields },
  };
}

/** Check a spec as it will run, inside this workspace: the contract's rules, then the integration and its secret. */
async function checkInWorkspace(ctx: ToolCtx, s: HttpToolSpec, selfId?: string): Promise<HttpToolSpec> {
  try { checkSpec(s); } catch (e) { if (e instanceof HttpToolError) throw new ValidationError(e.path, e.message.replace(/^[^:]+: /, '')); throw e; }
  if (s.auth) {
    const ig = await one<{ status: string; secret_keys: string[]; name: string }>(ctx.q, 'SELECT status, secret_keys, name FROM integration WHERE id = $1 AND workspace_id = $2', [s.auth.integrationId, ctx.workspaceId]);
    if (!ig) throw new ValidationError('integrationId', 'no such integration in this workspace; connect one first');
    if (ig.status !== 'connected') throw new ValidationError('integrationId', `the integration "${ig.name}" is disconnected`);
    if (!ig.secret_keys.includes(s.auth.secretKey)) throw new ValidationError('secretKey', `the integration "${ig.name}" holds no secret named "${s.auth.secretKey}"; it has: ${ig.secret_keys.join(', ') || 'none'}`);
  }
  const clash = await one(ctx.q, "SELECT 1 FROM tool WHERE workspace_id = $1 AND kind = 'http' AND config->>'name' = $2 AND ($3::uuid IS NULL OR id <> $3)", [ctx.workspaceId, s.name, selfId ?? null]);
  if (clash) throw new ValidationError('name', `a tool named "${s.name}" already exists in this workspace`);
  return s;
}

type ToolRow = { id: string; name: string; risk_class: string; config: HttpToolSpec; created_at: Date };
const view = (r: ToolRow) => ({ id: r.id, name: r.config.name, description: r.config.description, risk: r.config.risk, method: r.config.request.method, url: r.config.request.url,
  arguments: Object.keys(r.config.input.properties), resultFields: r.config.result.fields, timeoutMs: r.config.timeoutMs,
  usesIntegration: !!r.config.auth, status: 'Not available yet' as const, statusNote: 'Defined and testable here; calls start using it once the voice runtime supports workspace tools.' });

export async function loadHttpTool(ctx: ToolCtx, id: string): Promise<ToolRow> {
  const r = await one<ToolRow>(ctx.q, "SELECT id, name, risk_class, config, created_at FROM tool WHERE id = $1 AND workspace_id = $2 AND kind = 'http'", [id, ctx.workspaceId]);
  if (!r) throw new ValidationError('toolId', 'no such tool in this workspace');
  return r;
}

export function registerHttpTools(r: Registry): void {
  r.register(tool(obj(fields, 'Define a tool she can use during a call: an https request to your system that reads something or writes a note.'), {
    name: 'tool.create', risk: 'draft', summary: 'Define an in-call tool: an https request to your system (read, or write a note), its arguments and the fields she may use',
    run: async (ctx, i) => {
      const s = await checkInWorkspace(ctx, toSpec(i));
      const row = await one<ToolRow>(ctx.q, "INSERT INTO tool (workspace_id, name, kind, stage, risk_class, config) VALUES ($1,$2,'http','in_call',$3,$4) RETURNING id, name, risk_class, config, created_at",
        [ctx.workspaceId, s.name, s.risk, JSON.stringify(s)]);
      return { tool: view(row!) };
    },
  }));

  r.register(tool(obj({ toolId: uuid(), ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, opt(v as never)])) } as never), {
    name: 'tool.edit', risk: 'draft', summary: 'Change an in-call tool; versions already published keep the spec they were published with',
    run: async (ctx, raw) => {
      const i = raw as Partial<Fields> & { toolId: string };
      const cur = await loadHttpTool(ctx, i.toolId);
      const c = cur.config;
      const merged: Fields = {
        name: i.name ?? c.name, description: i.description ?? c.description, input: i.input ?? (c.input as Fields['input']), method: i.method ?? c.request.method,
        url: i.url ?? c.request.url, query: i.query ?? c.request.query, body: i.body ?? c.request.body,
        integrationId: i.integrationId ?? c.auth?.integrationId, authHeader: i.authHeader ?? c.auth?.header, secretKey: i.secretKey ?? c.auth?.secretKey, authPrefix: i.authPrefix ?? c.auth?.prefix,
        timeoutMs: i.timeoutMs ?? c.timeoutMs, risk: i.risk ?? c.risk, resultFields: i.resultFields ?? c.result.fields,
      };
      const s = await checkInWorkspace(ctx, toSpec(merged), cur.id);
      const row = await one<ToolRow>(ctx.q, 'UPDATE tool SET name = $3, risk_class = $4, config = $5 WHERE id = $1 AND workspace_id = $2 RETURNING id, name, risk_class, config, created_at',
        [cur.id, ctx.workspaceId, s.name, s.risk, JSON.stringify(s)]);
      return { tool: view(row!) };
    },
  }));

  r.register(tool(obj({}), {
    name: 'tool.list', risk: 'read', summary: "This workspace's in-call tools, with what each sends and what she may use from the answer",
    run: async ctx => ({ tools: (await many<ToolRow>(ctx.q, "SELECT id, name, risk_class, config, created_at FROM tool WHERE workspace_id = $1 AND kind = 'http' ORDER BY created_at, id", [ctx.workspaceId])).map(view) }),
  }));

  r.register(tool(obj({ toolId: uuid(), args: record(any(), { maxKeys: 8 }), fakeResponse: opt(obj({ status: opt(num({ int: true, min: 100, max: 599 })), body: opt(any()) })),
    timeout: opt(bool()) }, 'A dry run: builds the exact request (the secret masked) and reads a fake answer. Nothing is sent.'), {
    name: 'tool.test', risk: 'test', summary: 'Dry-run an in-call tool: the exact request it would send (secret masked) and what she would get from a sample answer',
    run: async (ctx, i) => {
      const t = await loadHttpTool(ctx, i.toolId);
      const s = t.config;
      let args;
      try { args = validateArgs(s, i.args); } catch (e) { if (e instanceof HttpToolError) throw new ValidationError(e.path, e.message.replace(/^[^:]+: /, '')); throw e; }
      const request = buildRequest(s, args, s.auth ? '••••••' : null);
      if (i.timeout) return { dryRun: true, sent: false, request, outcome: { ok: false, reason: `no answer within ${s.timeoutMs} ms: she would say she cannot check right now and carry on` } };
      const status = i.fakeResponse?.status ?? 200;
      const body = i.fakeResponse?.body === undefined ? {} : i.fakeResponse.body;
      const read = readResult(s, status, typeof body === 'string' ? body : JSON.stringify(body));
      return { dryRun: true, sent: false, request, outcome: read.ok ? { ok: true, status, sheGets: read.result } : { ok: false, status, reason: 'the answer was not a success with JSON, so she would say she cannot check right now' } };
    },
  }));
}
