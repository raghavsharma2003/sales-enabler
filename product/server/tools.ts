// The tool registry: every capability in VP is a tool. The Operator (chat), the HTTP API, MCP and the
// UI all call the same tools, so "every page action is a tool and every tool has a page" holds by construction.
//
// Autonomy is decided here, in code:
//   A1  read / draft / test tools run at once.
//   A3  a closed list of risk-lowering verbs runs at once when VP itself (agent/system) calls it.
//   A2  anything that reaches people, spends, deletes or changes policy is PROPOSED: the call stores the
//       exact args and the object version and returns an approval card. A human member then approves that
//       action id; the approval is single-use, bound to sha256(tool + canonical args), re-checked against
//       the object version, and the tool runs in the same transaction. Nobody can hand execute() an approval.
// Every run appends a hash-chained audit row in the same transaction as its effects.
import type pg from 'pg';
import { argsHash, authorise, canApprove, isA3, needsHumanApproval, type RiskClass, type Role } from '../shared/approval.ts';
import { ValidationError, type Validator } from '../shared/validate.ts';
import { appendAudit } from './audit.ts';
import { one, tx, type Queryable } from './db.ts';

export interface Actor {
  type: 'member' | 'agent' | 'vp_success' | 'system';
  id?: string;
  role?: Role;
  /** API-key scopes: when non-empty the caller may use only tools whose name equals a scope or starts with
   *  `<scope>.` (e.g. 'campaign' allows campaign.*; 'call.get' allows exactly that). Empty or absent = no narrowing. */
  scopes?: readonly string[];
}

export function inScope(scopes: readonly string[] | undefined, tool: string): boolean {
  if (!scopes || scopes.length === 0) return true;
  return scopes.some(s => tool === s || tool.startsWith(s + '.'));
}

export interface ToolCtx {
  q: Queryable;
  workspaceId: string;
  actor: Actor;
}

export interface PrepareCtx { pool: pg.Pool; workspaceId: string; actor: Actor }

export interface ToolDef<I = unknown, O = unknown> {
  name: string;            // dotted verb, e.g. 'campaign.launch'
  risk: RiskClass;
  summary: string;         // plain words for approval cards: what it does
  input: Validator<I>;
  /** Slow work that must NOT hold a transaction open (an LLM call, a provider request): runs first, outside the
   *  transaction, reading through the pool; its result is handed to run() as `prepared`. Writes belong in run(). */
  prepare?(ctx: PrepareCtx, input: I): Promise<unknown>;
  run(ctx: ToolCtx, input: I, prepared?: unknown): Promise<O>;
  /** For A2 tools: the version of the object the approval is about (e.g. agent_version hash, campaign policy_version).
   *  Read at proposal and again at execution; a mismatch voids the approval. */
  version?(ctx: ToolCtx, input: I): Promise<string | null>;
  /** For A2 tools: one plain sentence describing exactly this call, shown on the approval card. */
  describe?(input: I): string;
  /** Roles that may call (or propose) this tool. Defaults by risk class; approval rights are separate (shared/approval.ts). */
  roles?: readonly Role[];
  /** What to persist in action.result (and so show in /v1/actions) instead of the raw result, when the result holds
   *  something that must be shown once and never stored (a token, a secret). The live receipt still carries the raw result. */
  redactResult?(out: O): unknown;
}

const DEFAULT_ROLES: Record<RiskClass, readonly Role[]> = {
  read: ['owner', 'builder', 'operator', 'compliance', 'viewer'],
  draft: ['owner', 'builder', 'operator'],
  test: ['owner', 'builder', 'operator'],
  external: ['owner', 'builder', 'operator'],
  spend: ['owner', 'builder', 'operator'],        // anyone working may PROPOSE spend; only an owner approves it
  destructive: ['owner', 'operator', 'compliance'],
  policy: ['owner', 'builder', 'operator', 'compliance'],
};

/** Define a tool. Takes the validator first so the input type is inferred for run/describe/version
 *  (an inline generic validator inside one object literal is not inferred by TypeScript). */
export function tool<I, O>(input: Validator<I>, def: Omit<ToolDef<I, O>, 'input'>): ToolDef<I, O> {
  return { ...def, input };
}

export type Receipt<O = unknown> =
  | { status: 'confirmed'; mode: 'A1' | 'A2' | 'A3'; result: O; argsHash: string; actionId?: string }
  | { status: 'needs_approval'; actionId: string; argsHash: string; risk: RiskClass; summary: string; expiresAt: string }
  | { status: 'not_executed'; reason: string; argsHash?: string; path?: string }
  | { status: 'unknown'; reason: string; argsHash: string; actionId?: string };

/** Throw this from a tool whose side effect may have happened (e.g. a carrier request timed out). */
export class UnknownOutcome extends Error {
  constructor(message: string) { super(message); this.name = 'UnknownOutcome'; }
}

const APPROVAL_TTL_MS = 24 * 3600_000;
const actorId = (a: Actor) => a.id ?? a.type;

export class Registry {
  private tools = new Map<string, ToolDef<any, any>>();

  register<I, O>(t: ToolDef<I, O>): void {
    if (this.tools.has(t.name)) throw new Error(`tool ${t.name} is already registered`);
    this.tools.set(t.name, t);
  }

  get(name: string): ToolDef | undefined { return this.tools.get(name); }

  list(): { name: string; risk: RiskClass; summary: string; needsApproval: boolean; roles: readonly Role[] }[] {
    return [...this.tools.values()]
      .map(t => ({ name: t.name, risk: t.risk, summary: t.summary, needsApproval: needsHumanApproval(t.risk), roles: t.roles ?? DEFAULT_ROLES[t.risk] }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Call a tool. A1/A3 run now; A2 is stored as a proposed action and returns an approval card. */
  async execute<O = unknown>(pool: pg.Pool, name: string, raw: unknown, opts: { workspaceId: string; actor: Actor; threadId?: string }): Promise<Receipt<O>> {
    const t = this.tools.get(name);
    if (!t) return { status: 'not_executed', reason: `unknown tool "${name}"` };
    // Members (and agents acting for one, which carry that member's role) are held to the tool's roles.
    // Internal workers (system, or an agent with no role) are trusted code paths.
    if (opts.actor.type === 'member' || opts.actor.role) {
      const allowed = t.roles ?? DEFAULT_ROLES[t.risk];
      if (!opts.actor.role || !allowed.includes(opts.actor.role)) return { status: 'not_executed', reason: `a ${opts.actor.role ?? 'caller without a role'} cannot use ${name}` };
    }
    if (!inScope(opts.actor.scopes, name)) return { status: 'not_executed', reason: `this API key's scopes do not include ${name}` };

    let input: unknown;
    try { input = t.input(raw); } catch (e) {
      if (e instanceof ValidationError) return { status: 'not_executed', reason: e.message, path: e.path };
      throw e;
    }
    const h = argsHash(name, input);
    const ctxFor = (q: Queryable): ToolCtx => ({ q, workspaceId: opts.workspaceId, actor: opts.actor });

    const selfA3 = isA3(name) && (opts.actor.type === 'agent' || opts.actor.type === 'system');
    if (needsHumanApproval(t.risk) && !selfA3) {
      const summary = t.describe ? t.describe(input) : t.summary;
      const row = await tx(pool, async c => {
        const version = t.version ? await t.version(ctxFor(c), input) : null;
        const a = await one<{ id: string; expires_at: Date }>(c,
          `INSERT INTO action (workspace_id, thread_id, tool, args, args_hash, risk_class, status, proposed_by, object_version, summary, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,'proposed',$7,$8,$9,$10) RETURNING id, expires_at`,
          [opts.workspaceId, opts.threadId ?? null, name, JSON.stringify(input), h, t.risk, actorId(opts.actor), version, summary, new Date(Date.now() + APPROVAL_TTL_MS)]);
        await appendAudit(c, { workspaceId: opts.workspaceId, actorType: opts.actor.type, actorId: opts.actor.id, action: 'action.propose',
          objectType: 'action', objectId: a!.id, argsHash: h, payload: { tool: name, risk: t.risk } });
        return a!;
      });
      return { status: 'needs_approval', actionId: row.id, argsHash: h, risk: t.risk, summary, expiresAt: row.expires_at.toISOString() };
    }

    const mode: 'A1' | 'A3' = selfA3 ? 'A3' : 'A1';
    return this.run<O>(pool, t, input, h, mode, opts.workspaceId, opts.actor, async (c, out) => {
      if (t.risk === 'read') return out;     // reads change nothing; auditing them would bury the changes
      await appendAudit(c,{ workspaceId: opts.workspaceId, actorType: opts.actor.type, actorId: opts.actor.id, action: name, argsHash: h, payload: { mode, risk: t.risk } });
      return out;
    });
  }

  /** A human member approves a proposed action; it runs now, once, if nothing changed since it was proposed. */
  async approve<O = unknown>(pool: pg.Pool, actionId: string, approver: { workspaceId: string; memberId: string }): Promise<Receipt<O>> {
    const pre = await one<{ tool: string }>(pool, 'SELECT tool FROM action WHERE id = $1 AND workspace_id = $2', [actionId, approver.workspaceId]);
    if (!pre) return { status: 'not_executed', reason: 'no such action' };
    const t = this.tools.get(pre.tool);
    if (!t) return { status: 'not_executed', reason: `unknown tool "${pre.tool}"` };

    let h = '';
    let prepared: unknown;
    if (t.prepare) {
      const a0 = await one<{ args: unknown }>(pool, "SELECT args FROM action WHERE id = $1 AND workspace_id = $2 AND status = 'proposed'", [actionId, approver.workspaceId]);
      if (!a0) return { status: 'not_executed', reason: 'this action is no longer waiting for approval' };
      try { prepared = await t.prepare({ pool, workspaceId: approver.workspaceId, actor: { type: 'member', id: approver.memberId } }, t.input(a0.args)); }
      catch (e) { return { status: 'not_executed', reason: e instanceof Error ? e.message : String(e) }; }
    }
    try {
      return await tx(pool, async c => {
        const a = await one<{ args: unknown; args_hash: string; status: string; risk_class: RiskClass; expires_at: Date | null; object_version: string | null }>(c,
          'SELECT args, args_hash, status, risk_class, expires_at, object_version FROM action WHERE id = $1 AND workspace_id = $2 FOR UPDATE',
          [actionId, approver.workspaceId]);
        if (!a) throw new Refusal('no such action');
        if (a.status !== 'proposed') throw new Refusal(`this action is already ${a.status}`);
        if (a.expires_at && a.expires_at.getTime() < Date.now()) {
          await c.query("UPDATE action SET status = 'expired' WHERE id = $1", [actionId]);
          throw new Refusal('this approval request expired; ask again', true);
        }
        const m = await one<{ role: Role }>(c, "SELECT role FROM member WHERE id = $1 AND workspace_id = $2 AND status = 'active'", [approver.memberId, approver.workspaceId]);
        if (!m) throw new Refusal('only an active member of this workspace can approve');

        const input = t.input(a.args);              // re-validate what is stored, not what was sent
        h = argsHash(t.name, input);
        if (h !== a.args_hash) throw new Refusal('the stored action does not match its hash; it was not run');
        // Any held action (A2, or a draft held because the workspace lowered autonomy to A0) needs an approver whose
        // role may approve its risk class; authorise() alone lets non-A2 classes through.
        if (!canApprove(m.role, t.risk)) throw new Refusal(`a ${m.role} cannot approve ${t.risk} actions`);
        const v = authorise({ tool: t.name, args: input, risk: t.risk, approver: { role: m.role }, tokenArgsHash: a.args_hash });
        if (!v.allowed) throw new Refusal(v.reason);

        const actor: Actor = { type: 'member', id: approver.memberId, role: m.role };
        const ctx: ToolCtx = { q: c, workspaceId: approver.workspaceId, actor };
        if (t.version) {
          const now = await t.version(ctx, input);
          if (now !== a.object_version) {
            await c.query("UPDATE action SET status = 'cancelled' WHERE id = $1", [actionId]);
            throw new Refusal('what you approved has changed since it was proposed; review it again', true);
          }
        }
        await c.query('INSERT INTO approval_token (action_id, approver_id, args_hash, object_version) VALUES ($1,$2,$3,$4)', [actionId, approver.memberId, h, a.object_version]);
        const out = await t.run(ctx, input, prepared);
        const stored = t.redactResult ? t.redactResult(out) : out;
        await c.query("UPDATE action SET status = 'executed', result = $2, executed_at = now() WHERE id = $1", [actionId, JSON.stringify(stored ?? null)]);
        await appendAudit(c, { workspaceId: approver.workspaceId, actorType: 'member', actorId: approver.memberId, action: t.name,
          objectType: 'action', objectId: actionId, argsHash: h, payload: { mode: 'A2', risk: t.risk, approverRole: m.role } });
        return { status: 'confirmed', mode: 'A2', result: out as O, argsHash: h, actionId } as Receipt<O>;
      });
    } catch (e) {
      if (e instanceof Refusal) {
        if (e.persist) await this.persistStatusChange(pool, actionId, approver.workspaceId, e.message);
        return { status: 'not_executed', reason: e.message, argsHash: h || undefined };
      }
      if (e instanceof UnknownOutcome) {
        await tx(pool, async c => {
          await c.query("UPDATE action SET status = 'unknown' WHERE id = $1 AND workspace_id = $2", [actionId, approver.workspaceId]);
          await appendAudit(c, { workspaceId: approver.workspaceId, actorType: 'member', actorId: approver.memberId, action: t.name,
            objectType: 'action', objectId: actionId, argsHash: h, payload: { mode: 'A2', outcome: 'unknown', reason: e.message } });
        });
        return { status: 'unknown', reason: e.message, argsHash: h, actionId };
      }
      if (e instanceof ValidationError) return { status: 'not_executed', reason: e.message, path: e.path, argsHash: h || undefined };
      return { status: 'not_executed', reason: e instanceof Error ? e.message : String(e), argsHash: h || undefined };
    }
  }

  /** Decline a proposed action. */
  async decline(pool: pg.Pool, actionId: string, by: { workspaceId: string; memberId: string }): Promise<boolean> {
    return tx(pool, async c => {
      const r = await c.query("UPDATE action SET status = 'cancelled' WHERE id = $1 AND workspace_id = $2 AND status = 'proposed'", [actionId, by.workspaceId]);
      if (!r.rowCount) return false;
      await appendAudit(c, { workspaceId: by.workspaceId, actorType: 'member', actorId: by.memberId, action: 'action.decline', objectType: 'action', objectId: actionId });
      return true;
    });
  }

  // Expiry and version-change cancellations happen inside a transaction that then rolls back; write them again.
  private async persistStatusChange(pool: pg.Pool, actionId: string, ws: string, reason: string) {
    const status = reason.includes('expired') ? 'expired' : 'cancelled';
    await pool.query("UPDATE action SET status = $3 WHERE id = $1 AND workspace_id = $2 AND status = 'proposed'", [actionId, ws, status]);
  }

  private async run<O>(pool: pg.Pool, t: ToolDef, input: unknown, h: string, mode: 'A1' | 'A3', ws: string, actor: Actor,
    finish: (c: pg.PoolClient, out: unknown) => Promise<unknown>): Promise<Receipt<O>> {
    try {
      const prepared = t.prepare ? await t.prepare({ pool, workspaceId: ws, actor }, input) : undefined;
      const result = await tx(pool, async c => finish(c, await t.run({ q: c, workspaceId: ws, actor }, input, prepared)));
      return { status: 'confirmed', mode, result: result as O, argsHash: h };
    } catch (e) {
      if (e instanceof UnknownOutcome) {
        await tx(pool, c => appendAudit(c, { workspaceId: ws, actorType: actor.type, actorId: actor.id, action: t.name, argsHash: h, payload: { mode, outcome: 'unknown', reason: e.message } }));
        return { status: 'unknown', reason: e.message, argsHash: h };
      }
      if (e instanceof ValidationError) return { status: 'not_executed', reason: e.message, path: e.path, argsHash: h };
      return { status: 'not_executed', reason: e instanceof Error ? e.message : String(e), argsHash: h };
    }
  }
}

class Refusal extends Error {
  constructor(message: string, public persist = false) { super(message); this.name = 'Refusal'; }
}
