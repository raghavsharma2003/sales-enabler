// MCP server generated from the tool registry (blueprint defining decision 1: one spec generates the API, the SDK, MCP
// and the Operator's tools). Streamable HTTP, JSON-RPC 2.0 on POST /v1/mcp, answered as application/json (no
// server-initiated stream, so GET is 405). Stateless: no session id is issued.
//
// Authority is the registry's, never MCP's:
//   - Only a workspace API key may connect. The key's role (builder) and scopes are enforced by Registry.execute, the
//     same code the HTTP endpoint runs; tools/list shows exactly the tools that role and those scopes allow.
//   - Every risk class that needs a person (external, spend, destructive, policy) becomes an approval card and returns
//     its action id, INCLUDING the A3 verbs the kernel lets agents run at once: an outside agent never runs one. A
//     workspace at A0 holds drafts and tests for a tap too, as for the Operator. A person approves in Vyakti; the agent
//     reads the outcome with action.get. Nothing over MCP can approve.
import { needsHumanApproval } from '../../../shared/approval.ts';
import type { Deps } from '../../app.ts';
import { HttpError, type Req, type Router } from '../../http.ts';
import { inScope, type Actor, type Receipt } from '../../tools.ts';
import { A0_EXEMPT, proposeA0 } from './loop.ts';
import { operatorSettings } from './tools.ts';

export const MCP_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;
const SERVER_INFO = { name: 'vyakti', title: 'Vyakti', version: '1.0.0' };

/** MCP tool names: letters, digits, "_" and "-". Registry names are dotted, so dots become "_" (agent.create -> agent_create). */
export const mcpName = (tool: string) => tool.replace(/[^a-zA-Z0-9_-]/g, '_');

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: unknown; params?: any };
type Reply = { jsonrpc: '2.0'; id: string | number | null; result?: unknown; error?: { code: number; message: string; data?: unknown } };
const ok = (id: Reply['id'], result: unknown): Reply => ({ jsonrpc: '2.0', id, result });
const fail = (id: Reply['id'], code: number, message: string, data?: unknown): Reply => ({ jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } });

/** The tools an MCP caller sees: the registry's, filtered by the key's role and scopes, with their JSON Schemas. */
export function mcpTools(deps: Pick<Deps, 'registry'>, actor: Actor) {
  return deps.registry.list()
    .filter(t => actor.role && t.roles.includes(actor.role) && inScope(actor.scopes, t.name))
    .map(t => ({
      name: mcpName(t.name), title: t.name,
      description: `${t.summary}.${t.needsApproval ? ' Waits for a person to approve it in Vyakti: the call returns an approval card id; read the outcome with action_get.' : ''}`,
      inputSchema: deps.registry.get(t.name)!.input.schema ?? { type: 'object' },
      annotations: { readOnlyHint: t.risk === 'read', destructiveHint: t.risk === 'destructive', idempotentHint: t.risk === 'read', openWorldHint: t.risk === 'external' },
    }));
}

/** Call one tool for an MCP caller: role and scope in the registry; every approval class, and A0, held for a tap. */
async function callTool(deps: Deps, workspaceId: string, actor: Actor, name: string, args: unknown): Promise<Receipt> {
  const def = deps.registry.get(name);
  const listed = deps.registry.list().find(t => t.name === name);
  // Hold only what the caller may call at all; anything else goes to the registry, which refuses it with its reason.
  if (def && listed && actor.role && listed.roles.includes(actor.role) && inScope(actor.scopes, name)) {
    const a0 = (def.risk === 'draft' || def.risk === 'test') && !A0_EXEMPT.has(name) && (await operatorSettings(deps.pool, workspaceId)).autonomy === 'A0';
    if (needsHumanApproval(def.risk) || a0) return proposeA0(deps.pool, def, args, workspaceId, actor, null, a0 ? 'A0' : 'mcp');
  }
  return deps.registry.execute(deps.pool, name, args, { workspaceId, actor });
}

/** A receipt as an MCP tool result: plain text first (outcome first, as for the Operator), the receipt as structured content. */
function toolResult(name: string, r: Receipt) {
  const text = r.status === 'confirmed' ? `DONE: ${JSON.stringify(r.result ?? null)}`
    : r.status === 'needs_approval' ? `WAITING FOR APPROVAL: ${r.summary}. Approval card ${r.actionId}; a person approves it in Vyakti (it expires ${r.expiresAt}). Nothing has happened yet. Read the outcome with action_get.`
    : r.status === 'not_executed' ? `NOT DONE: ${r.reason}. Nothing changed.`
    : `UNKNOWN: ${r.reason}. It may or may not have happened; do not retry, check first.`;
  return { content: [{ type: 'text', text }], structuredContent: { tool: name, ...r }, isError: r.status === 'not_executed' || r.status === 'unknown' };
}

async function handle(deps: Deps, workspaceId: string, actor: Actor, m: Rpc): Promise<Reply | null> {
  const id = m.id ?? null;
  if (m.jsonrpc !== '2.0' || typeof m.method !== 'string') return fail(id, -32600, 'not a JSON-RPC 2.0 request');
  if (m.id === undefined) return null;                               // a notification (e.g. notifications/initialized): no reply
  switch (m.method) {
    case 'initialize': {
      const asked = String(m.params?.protocolVersion ?? '');
      return ok(id, {
        protocolVersion: (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : MCP_PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: 'Vyakti workspace tools. Reads, drafts and tests run at once. Anything that reaches people, spends money, deletes or changes policy returns an approval card id instead of running: a person approves it in Vyakti, and action_get reads the outcome. Results start with DONE, NOT DONE, WAITING FOR APPROVAL or UNKNOWN.',
      });
    }
    case 'ping': return ok(id, {});
    case 'tools/list': return ok(id, { tools: mcpTools(deps, actor) });
    case 'tools/call': {
      const raw = String(m.params?.name ?? '');
      const name = deps.registry.list().find(t => t.name === raw || mcpName(t.name) === raw)?.name;
      if (!name) return fail(id, -32602, `unknown tool "${raw}"`);
      const args = m.params?.arguments ?? {};
      if (typeof args !== 'object' || args === null || Array.isArray(args)) return fail(id, -32602, 'arguments must be an object');
      return ok(id, toolResult(name, await callTool(deps, workspaceId, actor, name, args)));
    }
    default: return fail(id, -32601, `method not supported: ${m.method}`);
  }
}

/** Browsers send Origin; a page on another site must not reach the workspace through a member's network (DNS rebinding). */
function checkOrigin(req: Req) {
  const origin = req.headers['origin'];
  if (!origin) return;
  const allowed = (process.env.VP_MCP_ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.includes(String(origin))) throw new HttpError(403, 'origin_not_allowed', 'this origin may not use the MCP endpoint');
}

export function mcpRoutes(router: Router, deps: Deps) {
  router.add('POST', '/v1/mcp', async req => {
    checkOrigin(req);
    const c = await deps.auth(req);
    if (c.via !== 'key') throw new HttpError(401, 'api_key_only', 'connect with a workspace API key (Authorization: Bearer vp_...)');
    const body = req.body;
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map(m => handle(deps, c.workspaceId, c.actor, m as Rpc)))).filter((r): r is Reply => r !== null);
      return out.length ? { body: out } : { status: 202, raw: '' };
    }
    if (!body || typeof body !== 'object') return { status: 400, body: fail(null, -32700, 'the body is not a JSON-RPC message') };
    const r = await handle(deps, c.workspaceId, c.actor, body as Rpc);
    return r ? { body: r } : { status: 202, raw: '' };
  });
  // No server-initiated stream: every reply comes back on its POST.
  router.add('GET', '/v1/mcp', async () => ({ status: 405, headers: { allow: 'POST' }, body: { error: { code: 'method_not_allowed', message: 'POST JSON-RPC to /v1/mcp' } } }));
  router.add('DELETE', '/v1/mcp', async () => ({ status: 405, headers: { allow: 'POST' }, body: { error: { code: 'method_not_allowed', message: 'this server keeps no sessions' } } }));
}
