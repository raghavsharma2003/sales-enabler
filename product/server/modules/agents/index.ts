// The agents module: templates, drafts, the brief, the voice stack choice, tools, text simulations, versions and splits.
// Edits never publish: every edit changes agent.draft; version.publish (A2) compiles the exact draft the approval card
// showed into an immutable agent_version holding { agent, brief }, and deployment.split (A2) decides where it runs.
import type { AgentConfig, ToolGrant } from '../../../shared/agent-config.ts';
import { RISK_CLASSES } from '../../../shared/approval.ts';
import { CUSTOM_STACK_ID, DEFAULT_STACK_ID, resolveStack, stackOf, STACKS, StackError, type Figure, type StackComponents, type VoiceStack } from '../../../shared/stacks.ts';
import { COMPONENTS, getComponent, type Component } from '../../../shared/components.ts';
import { lintAgentConfig } from '../../../shared/safety/index.ts';
import { any, arr, bool, num, obj, opt, record, str, uuid, ValidationError } from '../../../shared/validate.ts';
import type { Module } from '../../app.ts';
import { appendAudit } from '../../audit.ts';
import { many, one } from '../../db.ts';
import { tool, type Registry, type ToolCtx } from '../../tools.ts';
import { runtime, type RuntimeHealth } from '../../runtime-client.ts';
import { BriefBudgetError, BriefLintError, compile, compileReport } from './compile.ts';
import { draftHash, validateConfig, versionHashOf } from './config.ts';
import { DraftError, draftFromDescription } from './draft.ts';
import { shapeLint } from './lint.ts';
import { passCriteriaV, simulate, type SimCaller, type SimResult } from './simulate.ts';
import { getTemplate, TEMPLATES } from './templates.ts';
import { LIBRARY, libraryCaller, toSimCaller, type CallerShape, type LibraryCaller } from './library.ts';

interface AgentRow { id: string; name: string; job: string | null; status: string; draft: AgentConfig; updated_at: Date }

async function loadAgent(ctx: ToolCtx, agentId: string, lock = false): Promise<AgentRow> {
  const a = await one<AgentRow>(ctx.q, `SELECT id, name, job, status, draft, updated_at FROM agent WHERE id = $1 AND workspace_id = $2${lock ? ' FOR UPDATE' : ''}`, [agentId, ctx.workspaceId]);
  if (!a) throw new ValidationError('agentId', 'no such agent in this workspace');
  return a;
}

async function saveDraft(ctx: ToolCtx, agentId: string, draft: AgentConfig) {
  await ctx.q.query('UPDATE agent SET draft = $3, job = $4, updated_at = now() WHERE id = $1 AND workspace_id = $2', [agentId, ctx.workspaceId, JSON.stringify(draft), draft.job]);
}

/** What the brief editor shows: lint findings, the budget meters, and the compiled text when it compiles. */
function preview(c: AgentConfig) {
  const lint = [...shapeLint(c), ...lintAgentConfig(c)];
  try {
    const r = compileReport(c);
    return { compiles: true as const, lint, brief: { hash: r.hash, bytes: r.bytes, sections: r.sections, dropped: r.dropped, text: r.text } };
  } catch (e) {
    if (e instanceof BriefBudgetError) return { compiles: false as const, lint, error: { kind: 'budget', section: e.section, bytes: e.bytes, cap: e.cap, message: e.message } };
    if (e instanceof BriefLintError) return { compiles: false as const, lint, error: { kind: 'lint', message: e.message } };
    throw e;
  }
}

type Availability = { state: 'available' | 'unavailable' | 'unknown'; reason: string | null };
/** Whether the voice runtime can run a stack, from its own health report. With no report (the fake runtime, or the runtime
 *  unreachable) it is unknown: never assumed available. The reason is the runtime's own plain sentence. */
export function availabilityOf(id: string, h: RuntimeHealth | null, components?: StackComponents): Availability {
  if (!h) return { state: 'unknown', reason: null };
  if (id === CUSTOM_STACK_ID && components) {     // a built stack runs if each of its parts does; the first part that cannot says why
    if (!h.components) return { state: 'unknown', reason: null };
    if (!h.customStacks) return { state: 'unavailable', reason: "Our voice engine can't run a stack you build yourself yet." };
    const parts = components.s2s ? [['s2s', components.s2s]] : [['ears', components.ears], ['brain', components.brain], ['voice', components.voice]];
    for (const [part, pid] of parts) {
      const v = pid ? h.components[part as string]?.[pid] : undefined;
      if (!v) return { state: 'unavailable', reason: "Our voice engine doesn't offer one of these parts yet." };
      if (!v.available) return { state: 'unavailable', reason: v.reason ?? "One of these parts isn't connected on our voice engine yet." };
    }
    return { state: 'available', reason: null };
  }
  const v = h.stacks[id];
  if (!v) return { state: 'unavailable', reason: "Our voice engine doesn't offer this stack yet." };
  if (v.available) return { state: 'available', reason: null };
  return { state: 'unavailable', reason: v.reason ?? "This stack's providers aren't connected on our voice engine yet." };
}
let healthCache: { at: number; h: RuntimeHealth | null; rt: unknown } | null = null;
let healthGen = 0;   // bumped by forgetRuntimeHealth: a read that started before the bump must not write its answer back
async function runtimeHealth(): Promise<RuntimeHealth | null> {
  const rt = runtime();
  if (healthCache && healthCache.rt === rt && Date.now() - healthCache.at < 30_000) return healthCache.h;
  const gen = healthGen;
  const h = rt.health ? await rt.health().catch(() => null) : null;
  if (gen === healthGen) healthCache = { at: Date.now(), h, rt };
  return h;
}
/** Tests that swap the runtime's health call this so the next stack.list asks again. */
export function forgetRuntimeHealth(): void { healthCache = null; healthGen++; }

/** A part a stack can be built from, with the runtime's word on whether it can run here (unknown until it reports). */
function componentCard(c: Component, h: RuntimeHealth | null) {
  const v = h?.components?.[c.part]?.[c.id];
  const availability: Availability = !h ? { state: 'unknown', reason: null }
    : !h.components ? { state: 'unknown', reason: null }        // a runtime that does not report parts yet: unknown, not unavailable
    : !v ? { state: 'unavailable', reason: "Our voice engine doesn't offer this part yet." }
    : v.available ? { state: 'available', reason: null } : { state: 'unavailable', reason: v.reason ?? "This part's provider isn't connected on our voice engine yet." };
  return { id: c.id, part: c.part, label: c.label, maker: c.maker, route: c.route, processedIn: c.processedIn, latency: c.latency, price: c.price,
    status: c.status, note: c.note ?? null, voices: c.voices ?? [], defaultVoice: c.defaultVoice ?? null, availability };
}

const NOT_PRICED: Figure = { value: 'not measured', grade: 'not_measured', source: 'No provider cost has been worked out for this stack yet.' };

/** What VP pays its providers per minute on a stack: money's own estimate, the figure the picker shows. Without the money
 *  module, or with no cost lines for the stack, it reads "not measured", never zero. */
async function priceOf(r: Registry, ctx: ToolCtx, s: VoiceStack): Promise<Figure> {
  const est = r.get('money.estimate');
  if (est?.risk !== 'read') return NOT_PRICED;
  try {
    const e = await est.run(ctx, est.input({ stackId: s.id, minutes: 1, calls: 0 })) as { lines: unknown[]; basis: string; display: { perMinute: string } };
    return e.lines.length ? { value: `${e.display.perMinute}, provider cost`, grade: 'computed', source: e.basis } : NOT_PRICED;
  } catch { return NOT_PRICED; }
}

function stackCard(s: VoiceStack, h: RuntimeHealth | null = null, pricePerMinute: Figure = NOT_PRICED) {
  return { id: s.id, label: s.label, kind: s.kind, status: s.status, note: s.note, replyGap: s.replyGap, requires: s.requires ?? [], risks: s.risks ?? [],
    availability: availabilityOf(s.id, h, s.components),
    components: s.components,
    // Each part in plain words: what it is, how it is routed and where it is processed (a part not in the catalog is left out).
    parts: (['ears', 'brain', 'voice', 's2s'] as const).flatMap(part => {
      const c = s.components[part] ? getComponent(part, s.components[part]!) : undefined;
      return c ? [{ part, id: c.id, label: c.label, maker: c.maker, route: c.route, processedIn: c.processedIn }] : [];
    }),
    pricePerMinute };
}

/** In-call tools an agent may be granted by name, with the risk class each carries (workspace tools attach by id). */
const IN_CALL_TOOLS: Record<string, ToolGrant['risk']> = {
  end_call: 'read', lookup_order: 'read', kb_query: 'read', mark_callback: 'draft', book_slot: 'draft',
  transfer: 'external', send_whatsapp_link: 'external', send_sms: 'external',
};

// ------------------------------------------------------------------------------------------------ brief.edit patches

const LOCKED = new Set(['schema', 'agentId', 'version', 'versionHash', 'voice', 'tools']);
const LOCK_REASON: Record<string, string> = { voice: 'use stack.set or voice.set', tools: 'use tool.attach' };

const PATH_FORMS = 'use persona.notes[0], persona.notes.0 or /persona/notes/0; append to a list with /facts/- or facts[-]';

/** A patch path in any of the forms models send, as keys plus whether it ends in an append ("-"):
 *  persona.notes[0], persona.notes.0, JSON Pointer /persona/notes/0, /facts/-, facts[-], with an optional draft prefix. */
export function parsePath(p: string): { keys: (string | number)[]; append: boolean } {
  let segs: string[];
  if (p.startsWith('/')) segs = p.slice(1).split('/').map(x => x.replace(/~1/g, '/').replace(/~0/g, '~'));
  else {
    if (!/^[a-zA-Z]+(\.([a-zA-Z]+|\d+|-)|\[(\d+|-)\])*$/.test(p)) throw new ValidationError('patch.path', `"${p}" is not a field path: ${PATH_FORMS}`);
    segs = [...p.matchAll(/([a-zA-Z]+|\d+|-)/g)].map(m => m[1]!);
  }
  if (segs[0] === 'draft') segs = segs.slice(1);
  const append = segs[segs.length - 1] === '-';
  if (append) segs = segs.slice(0, -1);
  if (!segs.length || segs.some(x => !/^([a-zA-Z]+|\d+)$/.test(x))) throw new ValidationError('patch.path', `"${p}" is not a field path: ${PATH_FORMS}`);
  return { keys: segs.map(x => (/^\d+$/.test(x) ? Number(x) : x)), append };
}

function applyPatch(draft: AgentConfig, ops: { op: string; path: string; value?: unknown }[]): unknown {
  const doc = structuredClone(draft) as unknown as Record<string, unknown>;
  for (const [i, o] of ops.entries()) {
    const { keys, append } = parsePath(o.path);
    // RFC 6902 names: replace is set; add, or any op on a path ending in "-", appends to that list.
    const op = append || o.op === 'add' && Array.isArray(getIn(doc, keys)) ? 'append' : o.op === 'replace' || o.op === 'add' ? 'set' : o.op;
    if (append && o.op === 'remove') throw new ValidationError(`patch[${i}].path`, `"${o.path}" ends in "-": remove needs an index`);
    if (LOCKED.has(String(keys[0]))) throw new ValidationError(`patch[${i}].path`, `${keys[0]} cannot be edited here` + (LOCK_REASON[String(keys[0])] ? `; ${LOCK_REASON[String(keys[0])]}` : ''));
    let parent: any = doc;
    for (const k of keys.slice(0, -1)) {
      parent = parent?.[k];
      if (parent === undefined || parent === null || typeof parent !== 'object') throw new ValidationError(`patch[${i}].path`, `${o.path} does not exist`);
    }
    const last = keys[keys.length - 1];
    if (o.op === 'add' && Array.isArray(parent) && typeof last === 'number') {        // RFC 6902: add at an index inserts
      if (o.value === undefined) throw new ValidationError(`patch[${i}].value`, 'add needs a value');
      if (last > parent.length) throw new ValidationError(`patch[${i}].path`, `${o.path} is past the end of the list`);
      parent.splice(last, 0, o.value);
    } else if (op === 'set') {
      if (o.value === undefined) throw new ValidationError(`patch[${i}].value`, 'set needs a value');
      if (Array.isArray(parent) && (typeof last !== 'number' || last >= parent.length)) throw new ValidationError(`patch[${i}].path`, `${o.path} is past the end of the list; use append`);
      parent[last] = o.value;
    } else if (op === 'remove') {
      if (Array.isArray(parent) && typeof last === 'number') { if (last >= parent.length) throw new ValidationError(`patch[${i}].path`, `${o.path} does not exist`); parent.splice(last, 1); }
      else delete parent[last];
    } else {
      if (o.value === undefined) throw new ValidationError(`patch[${i}].value`, 'append needs a value');
      const list = parent[last];
      if (!Array.isArray(list)) throw new ValidationError(`patch[${i}].path`, `${o.path} is not a list`);
      list.push(o.value);
    }
  }
  return doc;
}

function getIn(doc: unknown, keys: (string | number)[]): unknown {
  let v: any = doc;
  for (const k of keys) { if (v === null || typeof v !== 'object') return undefined; v = v[k]; }
  return v;
}

/** On "is not a known field", say which fields exist there, so the next patch can name one of them. */
function withKnownFields(e: ValidationError, doc: unknown): ValidationError {
  if (!/is not a known field/.test(e.message) || !e.path) return e;
  let keys: (string | number)[];
  try { keys = parsePath(e.path).keys; } catch { return e; }
  const parent = getIn(doc, keys.slice(0, -1));
  if (!parent || typeof parent !== 'object' || Array.isArray(parent)) return e;
  const known = Object.keys(parent).filter(k => k !== keys[keys.length - 1]);
  return known.length ? new ValidationError(e.path, `is not a known field; the fields there are: ${known.join(', ')}`) : e;
}

// ------------------------------------------------------------------------------------------------ diff

type Change = { path: string; from: unknown; to: unknown };
function diff(a: unknown, b: unknown, path = '', out: Change[] = []): Change[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  const isObj = (x: unknown) => x !== null && typeof x === 'object';
  if (isObj(a) && isObj(b) && Array.isArray(a) === Array.isArray(b)) {
    const keys = Array.isArray(a) ? [...Array(Math.max(a.length, (b as unknown[]).length)).keys()].map(String)
      : [...new Set([...Object.keys(a as object), ...Object.keys(b as object)])].sort();
    for (const k of keys) diff((a as any)[k], (b as any)[k], Array.isArray(a) ? `${path}[${k}]` : path ? `${path}.${k}` : k, out);
    return out;
  }
  out.push({ path, from: a ?? null, to: b ?? null });
  return out;
}
const comparable = (c: AgentConfig) => { const { agentId: _a, version: _v, versionHash: _h, ...rest } = c; return rest; };

// ------------------------------------------------------------------------------------------------ shared paths

type SimCallerRow = { id: string; agent_id: string | null; persona: string; scenario: string; hidden_keys: Record<string, string>; contact: Record<string, string>;
  pass_criteria: unknown; shape: CallerShape | null; created_at: Date };

/** A practice caller reference: a library default ('default:<slug>') or a workspace caller's uuid. */
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const callerRef = () => str({ min: 1, max: 60, pattern: /^(default:[a-z0-9_]{1,40}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/,
  desc: "a practice caller: 'default:<slug>' from simcaller.list, or a saved caller's id" });

async function loadSimCaller(ctx: ToolCtx, agentId: string, ref: string): Promise<SimCaller> {
  if (ref.startsWith('default:')) {
    const d = libraryCaller(ref);
    if (!d) throw new ValidationError('simCallerId', `no practice caller "${ref}"; see simcaller.list`);
    return toSimCaller(d);
  }
  if (!UUID_RX.test(ref)) throw new ValidationError('simCallerId', 'must be a practice caller id');
  const row = await one<SimCallerRow>(ctx.q, 'SELECT * FROM sim_caller WHERE id = $1 AND workspace_id = $2 AND (agent_id = $3 OR agent_id IS NULL)',
    [ref.toLowerCase(), ctx.workspaceId, agentId]);
  if (!row) throw new ValidationError('simCallerId', `no such simulated caller for this agent (${ref})`);
  return { persona: row.persona, scenario: row.scenario, hiddenKeys: row.hidden_keys, contact: row.contact, passCriteria: passCriteriaV(row.pass_criteria) };
}

async function storeRun(ctx: ToolCtx, agentId: string, ref: string, cfg: AgentConfig, briefHash: string, res: SimResult, seed: number | null) {
  const rowId = UUID_RX.test(ref) ? ref.toLowerCase() : null;
  return (await one<{ id: string }>(ctx.q, `INSERT INTO agent_test_run (workspace_id, agent_id, sim_caller_id, sim_caller_key, draft_hash, brief_hash, transcript, door, grades, passed, ended_by, usage, seed)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [ctx.workspaceId, agentId, rowId, rowId ? null : ref, draftHash(cfg), briefHash, JSON.stringify(res.transcript), JSON.stringify(res.door), JSON.stringify(res.grades), res.passed, res.endedBy, JSON.stringify(res.usage), seed]))!.id;
}

const SHAPE_LINE = /["“”«»]|\[[^\]]*\]|<[^>]*>/;
const callerShapeV = obj({
  label: str({ min: 1, max: 80 }), persona: str({ min: 1, max: 400 }), goal: str({ min: 1, max: 300 }), temperament: str({ min: 1, max: 200 }),
  languageMix: str({ min: 1, max: 120 }), trap: str({ min: 1, max: 400 }),
});
const libraryRow = (c: LibraryCaller) => ({ id: c.id, source: 'default' as const, label: c.label, persona: c.persona, goal: c.goal, temperament: c.temperament,
  languageMix: c.languageMix, trap: c.trap, hiddenKeys: c.hiddenKeys, checks: c.passCriteria });

/** The one path that creates an immutable version: validate, require a chosen stack, number it, hash it, compile ONCE. */
async function createVersion(ctx: ToolCtx, agentId: string, cfg: AgentConfig, parentId: string | null, note: string | null) {
  try { resolveStack(cfg.voice); } catch (e) { if (e instanceof StackError) throw new ValidationError('voice.stackId', e.message); throw e; }
  await ctx.q.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['agent_version:' + agentId]);
  const n = await one<{ n: number }>(ctx.q, 'SELECT coalesce(max(number), 0) + 1 AS n FROM agent_version WHERE agent_id = $1', [agentId]);
  const agent: AgentConfig = validateConfig({ ...cfg, agentId, version: n!.n, versionHash: '' });
  agent.versionHash = versionHashOf(agent);
  const report = compileReport(agent);           // the brief is compiled ONCE, here; tickets copy it
  const brief = { text: report.text, hash: report.hash, bytes: report.bytes };
  // Campaigns' launch gate (G10) reads config.lint.ok; a version only exists if it compiled, so ok is true by construction.
  const lint = { ok: true, findings: [...shapeLint(agent), ...lintAgentConfig(agent)], dropped: report.dropped };
  const actor = ctx.actor.type === 'vp_success' ? 'system' : ctx.actor.type;
  const v = await one<{ id: string }>(ctx.q, `INSERT INTO agent_version (agent_id, number, hash, parent_id, author_type, author_id, note, config)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [agentId, n!.n, agent.versionHash, parentId, actor, ctx.actor.id ?? null, note, JSON.stringify({ agent, brief, lint })]);
  return { versionId: v!.id, number: n!.n, versionHash: agent.versionHash, parentId, brief: { hash: brief.hash, bytes: brief.bytes } };
}

/** Compile errors as tool refusals: the reason names the lint finding or the section to cut. */
function compileOrRefuse(cfg: AgentConfig) {
  try { return compile(cfg); } catch (e) {
    if (e instanceof BriefBudgetError) throw new ValidationError(`brief.${e.section}`, e.message);
    if (e instanceof BriefLintError) throw new ValidationError(e.findings[0]?.path ?? 'config', e.message);
    throw e;
  }
}

// ------------------------------------------------------------------------------------------------ tools

const simCallerV = obj({
  persona: str({ min: 1, max: 600 }), scenario: str({ min: 1, max: 1200 }),
  hiddenKeys: record(str({ max: 200 }), { maxKeys: 20 }), contact: opt(record(str({ max: 200 }), { maxKeys: 20 })),
  passCriteria: passCriteriaV,
});

export function registerAgentTools(r: Registry): void {
  r.register(tool(obj({}), {
    name: 'template.list', risk: 'read', summary: 'List the starter agents by industry and job',
    run: async () => ({ templates: TEMPLATES.map(t => ({ id: t.id, label: t.label, industry: t.industry, job: t.config.job, category: t.config.category,
      languages: t.config.languages.allowed, summary: t.summary })) }),
  }));

  r.register(tool(obj({ name: str({ min: 1, max: 80 }), templateId: opt(str({ max: 60 })), description: opt(str({ min: 20, max: 4000 })) }), {
    name: 'agent.create', risk: 'draft', summary: 'Create a draft agent from a template or from a plain-words description',
    run: async (ctx, i) => {
      if (!!i.templateId === !!i.description) throw new ValidationError('templateId', 'give either a templateId or a description, not both');
      let draft: AgentConfig, from: string, usage: unknown = undefined;
      if (i.templateId) {
        const t = getTemplate(i.templateId);
        if (!t) throw new ValidationError('templateId', `no template "${i.templateId}"`);
        draft = structuredClone(t.config); from = 'template:' + t.id;
      } else {
        try { const d = await draftFromDescription(i.description!); draft = d.config; usage = d.usage; from = 'description'; }
        catch (e) { if (e instanceof DraftError) throw new ValidationError(e.path ?? 'description', e.message); throw e; }
      }
      const row = await one<{ id: string }>(ctx.q, "INSERT INTO agent (workspace_id, name, job, status, draft) VALUES ($1,$2,$3,'draft','{}') RETURNING id", [ctx.workspaceId, i.name, draft.job]);
      draft.agentId = row!.id;
      await saveDraft(ctx, row!.id, draft);
      return { agentId: row!.id, status: 'draft', from, draftHash: draftHash(draft), draft, ...preview(draft), stackChosen: !!stackOf(draft.voice), usage };
    },
  }));

  r.register(tool(obj({}), {
    name: 'agent.list', risk: 'read', summary: "List this workspace's agents",
    run: async ctx => ({ agents: await many(ctx.q, `SELECT a.id, a.name, a.job, a.status, a.updated_at, (SELECT max(number) FROM agent_version v WHERE v.agent_id = a.id) AS latest_version
      FROM agent a WHERE a.workspace_id = $1 ORDER BY a.updated_at DESC LIMIT 200`, [ctx.workspaceId]) }),
  }));

  r.register(tool(obj({ agentId: uuid() }), {
    name: 'agent.get', risk: 'read', summary: 'Read one agent: its draft, lint, brief preview and versions',
    run: async (ctx, i) => {
      const a = await loadAgent(ctx, i.agentId);
      const stack = stackOf(a.draft.voice);
      const versions = await many(ctx.q, 'SELECT id, number, hash, created_at FROM agent_version WHERE agent_id = $1 ORDER BY number DESC LIMIT 20', [a.id]);
      const tests = await many(ctx.q, 'SELECT id, passed, draft_hash, created_at FROM agent_test_run WHERE agent_id = $1 AND workspace_id = $2 ORDER BY created_at DESC LIMIT 10', [a.id, ctx.workspaceId]);
      return { agent: { id: a.id, name: a.name, job: a.job, status: a.status, updatedAt: a.updated_at }, draft: a.draft, draftHash: draftHash(a.draft),
        ...preview(a.draft), stack: stack ? stackCard(stack) : null, stackChosen: !!stack, versions, tests };
    },
  }));

  r.register(tool(obj({
    agentId: uuid(), expectDraftHash: opt(str({ max: 64 })),
    patch: arr(obj({ op: str({ oneOf: ['set', 'remove', 'append', 'add', 'replace'] }), path: str({ min: 1, max: 120 }), value: opt(any('the new value')) }), { min: 1, max: 30 }),
  }), {
    name: 'brief.edit', risk: 'draft', summary: "Edit an agent's draft brief with a validated patch (never publishes)",
    run: async (ctx, i) => {
      const a = await loadAgent(ctx, i.agentId, true);
      if (i.expectDraftHash && i.expectDraftHash !== draftHash(a.draft)) throw new ValidationError('expectDraftHash', 'the draft changed since you last read it; reload and edit again');
      const patched = applyPatch(a.draft, i.patch);
      let next: AgentConfig;
      try { next = validateConfig(patched); } catch (e) { throw e instanceof ValidationError ? withKnownFields(e, patched) : e; }
      await saveDraft(ctx, a.id, next);
      return { agentId: a.id, draftHash: draftHash(next), changes: diff(comparable(a.draft), comparable(next)), ...preview(next) };
    },
  }));

  r.register(tool(obj({}), {
    name: 'stack.list', risk: 'read', summary: 'The curated voice stacks with their figures and grades, the default, and the parts a stack can be built from',
    run: async ctx => {
      const h = await runtimeHealth();
      const stacks = [];
      for (const s of STACKS) stacks.push(stackCard(s, h, await priceOf(r, ctx, s)));
      return { default: DEFAULT_STACK_ID, note: 'New agents start on the default stack. Choose another, or build your own from the parts below.',
        stacks, components: COMPONENTS.map(c => componentCard(c, h)) };
    },
  }));

  r.register(tool(obj({ agentId: uuid(), stackId: str({ min: 1, max: 60 }),
    components: opt(obj({ ears: opt(str({ max: 60 })), brain: opt(str({ max: 60 })), voice: opt(str({ max: 60 })), s2s: opt(str({ max: 60 })), gatedEars: opt(bool()) })) }), {
    name: 'stack.set', risk: 'draft', summary: "Choose an agent's voice stack: a curated one, or stackId 'custom' with the parts (ears, brain and voice, or one speech-to-speech engine)",
    run: async (ctx, i) => {
      const a = await loadAgent(ctx, i.agentId, true);
      let s: VoiceStack;
      try { s = resolveStack({ stackId: i.stackId, components: i.components as StackComponents | undefined }); }
      catch (e) { if (e instanceof StackError) throw new ValidationError(i.stackId === CUSTOM_STACK_ID ? 'components' : 'stackId', e.message + (i.stackId === CUSTOM_STACK_ID ? '' : `; choose one of: ${STACKS.map(x => x.id).join(', ')}, or ${CUSTOM_STACK_ID}`)); throw e; }
      const nextVoice = s.id === CUSTOM_STACK_ID ? { stackId: s.id, components: s.components } : { stackId: s.id };
      // A voice belongs to the part that speaks: keep it only while that part is unchanged.
      const speaker = (v: { stackId?: string; components?: StackComponents } | undefined) => { const r = stackOf(v); return r ? (r.components.s2s ?? r.components.voice) : null; };
      const changed = JSON.stringify(nextVoice) !== JSON.stringify({ stackId: a.draft.voice.stackId, ...(a.draft.voice.components ? { components: a.draft.voice.components } : {}) });
      const keepVoice = !changed || speaker(a.draft.voice) === speaker(nextVoice);
      const next: AgentConfig = { ...a.draft, voice: keepVoice ? { ...a.draft.voice, ...nextVoice, ...(nextVoice.components ? {} : { components: undefined }) } : nextVoice };
      if (!next.voice.components) delete next.voice.components;
      await saveDraft(ctx, a.id, next);
      return { agentId: a.id, stack: stackCard(s), voiceCleared: !keepVoice && !!a.draft.voice.voiceId, draftHash: draftHash(next), ...preview(next) };
    },
  }));

  r.register(tool(obj({ agentId: uuid(), voiceId: str({ min: 1, max: 80 }), speed: opt(num({ min: 0.7, max: 1.3 })) }), {
    name: 'voice.set', risk: 'draft', summary: "Choose the agent's voice and speed within its chosen stack",
    run: async (ctx, i) => {
      const a = await loadAgent(ctx, i.agentId, true);
      if (!stackOf(a.draft.voice)) throw new ValidationError('agentId', 'choose a voice stack first (stack.set)');
      const next: AgentConfig = { ...a.draft, voice: { ...a.draft.voice, voiceId: i.voiceId, ...(i.speed !== undefined ? { speed: i.speed } : {}) } };
      await saveDraft(ctx, a.id, next);
      return { agentId: a.id, voice: next.voice, draftHash: draftHash(next) };
    },
  }));

  r.register(tool(obj({ agentId: uuid(), name: opt(str({ max: 60 })), toolId: opt(uuid()), config: opt(record(any())), remove: opt(bool()) }), {
    name: 'tool.attach', risk: 'draft', summary: 'Grant an agent an in-call tool (or remove one)',
    run: async (ctx, i) => {
      const a = await loadAgent(ctx, i.agentId, true);
      if (!!i.name === !!i.toolId) throw new ValidationError('name', 'give either a tool name or a toolId');
      let grant: ToolGrant;
      if (i.toolId) {
        const t = await one<{ name: string; risk_class: ToolGrant['risk'] }>(ctx.q, 'SELECT name, risk_class FROM tool WHERE id = $1 AND workspace_id = $2', [i.toolId, ctx.workspaceId]);
        if (!t) throw new ValidationError('toolId', 'no such tool in this workspace');
        grant = { name: t.name, risk: t.risk_class, config: { ...(i.config ?? {}), toolId: i.toolId } };
      } else {
        const risk = IN_CALL_TOOLS[i.name!];
        if (!risk) throw new ValidationError('name', `unknown in-call tool; choose one of: ${Object.keys(IN_CALL_TOOLS).join(', ')}`);
        grant = { name: i.name!, risk, ...(i.config ? { config: i.config } : {}) };
      }
      if (!RISK_CLASSES.includes(grant.risk)) throw new ValidationError('toolId', 'that tool has an unknown risk class');
      const tools = a.draft.tools.filter(t => t.name !== grant.name);
      if (!i.remove) tools.push(grant);
      const next = validateConfig({ ...a.draft, tools });
      await saveDraft(ctx, a.id, next);
      return { agentId: a.id, tools: next.tools, draftHash: draftHash(next) };
    },
  }));

  r.register(tool(obj({ agentId: opt(uuid()) }), {
    name: 'simcaller.list', risk: 'read', summary: "The practice callers: Vyakti's industry-neutral defaults plus this workspace's own",
    run: async (ctx, i) => {
      if (i.agentId) await loadAgent(ctx, i.agentId);
      const rows = await many<SimCallerRow>(ctx.q, `SELECT * FROM sim_caller WHERE workspace_id = $1 AND shape IS NOT NULL AND (agent_id IS NULL${i.agentId ? ' OR agent_id = $2' : ''})
        ORDER BY created_at DESC LIMIT 200`, i.agentId ? [ctx.workspaceId, i.agentId] : [ctx.workspaceId]);
      return { callers: [...LIBRARY.map(libraryRow), ...rows.map(r => ({ id: r.id, source: 'workspace' as const, agentId: r.agent_id, ...r.shape!, hiddenKeys: r.hidden_keys,
        contact: r.contact, checks: r.pass_criteria }))] };
    },
  }));

  r.register(tool(obj({ id: opt(uuid()), agentId: opt(uuid()), shape: callerShapeV, hiddenKeys: record(str({ max: 200 }), { maxKeys: 20 }),
    contact: opt(record(str({ max: 200 }), { maxKeys: 20 })), checks: passCriteriaV }), {
    name: 'simcaller.save', risk: 'draft', summary: "Save one of this workspace's practice callers (a shape with the checks it should trigger)",
    run: async (ctx, i) => {
      for (const [k, v] of Object.entries(i.shape)) if (k !== 'label' && SHAPE_LINE.test(v)) throw new ValidationError(`shape.${k}`, 'describe the caller as notes, not quoted lines or bracketed directions');
      if (i.agentId) await loadAgent(ctx, i.agentId);
      const sc = toSimCaller({ ...i.shape, hiddenKeys: i.hiddenKeys, passCriteria: i.checks }, i.contact ?? {});
      const vals = [ctx.workspaceId, i.agentId ?? null, sc.persona, sc.scenario, JSON.stringify(sc.hiddenKeys), JSON.stringify(sc.contact), JSON.stringify(i.checks), JSON.stringify(i.shape)];
      const row = i.id
        ? await one<{ id: string }>(ctx.q, `UPDATE sim_caller SET agent_id = $2, persona = $3, scenario = $4, hidden_keys = $5, contact = $6, pass_criteria = $7, shape = $8
            WHERE id = $9 AND workspace_id = $1 RETURNING id`, [...vals, i.id])
        : await one<{ id: string }>(ctx.q, `INSERT INTO sim_caller (workspace_id, agent_id, persona, scenario, hidden_keys, contact, pass_criteria, shape)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, vals);
      if (!row) throw new ValidationError('id', 'no such practice caller in this workspace');
      return { id: row.id, source: 'workspace', agentId: i.agentId ?? null, ...i.shape };
    },
  }));

  r.register(tool(obj({ agentId: uuid(), simCallerId: opt(callerRef()), simCaller: opt(simCallerV), maxTurns: opt(num({ int: true, min: 2, max: 30 })) }), {
    name: 'test.simulate', risk: 'test', summary: 'Run a text simulation of the draft against a simulated caller, graded by code',
    run: async (ctx, i) => {
      if (!!i.simCallerId === !!i.simCaller) throw new ValidationError('simCallerId', 'give either a simCallerId or an inline simCaller');
      const a = await loadAgent(ctx, i.agentId);
      const brief = compile(a.draft);                 // throws on lint or budget: an untestable draft is said so, not run
      let sc: SimCaller, scId: string;
      if (i.simCallerId) {
        sc = await loadSimCaller(ctx, a.id, i.simCallerId);
        scId = i.simCallerId;
      } else {
        sc = { ...i.simCaller!, contact: i.simCaller!.contact ?? {} };
        scId = (await one<{ id: string }>(ctx.q, 'INSERT INTO sim_caller (workspace_id, agent_id, persona, scenario, hidden_keys, contact, pass_criteria) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
          [ctx.workspaceId, a.id, sc.persona, sc.scenario, JSON.stringify(sc.hiddenKeys), JSON.stringify(sc.contact), JSON.stringify(sc.passCriteria)]))!.id;
      }
      const res = await simulate(a.draft, brief, sc, i.maxTurns ?? 12);
      const runId = await storeRun(ctx, a.id, scId, a.draft, brief.hash, res, null);
      return { runId, simCallerId: scId, briefHash: brief.hash, ...res };
    },
  }));

  r.register(tool(obj({ agentId: uuid(), draftHash: str({ min: 64, max: 64 }), note: opt(str({ max: 300 })) }), {
    name: 'version.publish', risk: 'external', summary: 'Publish the reviewed draft as a new immutable agent version',
    describe: i => `Publish agent ${i.agentId.slice(0, 8)} from the draft you reviewed (${i.draftHash.slice(0, 12)})` + (i.note ? `: ${i.note}` : ''),
    version: async (ctx, i) => {
      const a = await one<{ draft: AgentConfig }>(ctx.q, 'SELECT draft FROM agent WHERE id = $1 AND workspace_id = $2', [i.agentId, ctx.workspaceId]);
      return a ? draftHash(a.draft) : null;
    },
    run: async (ctx, i) => {
      const a = await loadAgent(ctx, i.agentId, true);
      if (draftHash(a.draft) !== i.draftHash) throw new ValidationError('draftHash', 'the draft changed since it was shown; review the new draft and publish again');
      const prev = await one<{ id: string }>(ctx.q, 'SELECT id FROM agent_version WHERE agent_id = $1 ORDER BY number DESC LIMIT 1', [a.id]);
      return createVersion(ctx, a.id, a.draft, prev?.id ?? null, i.note ?? null);
    },
  }));

  const splitV = obj({
    agentId: uuid(), binding: str({ oneOf: ['campaign', 'inbound', 'web', 'test'] }),
    split: arr(obj({ versionId: uuid(), percent: num({ int: true, min: 1, max: 100 }) }), { min: 1, max: 4 }),
  });
  const currentSplit = async (ctx: ToolCtx, agentId: string, binding: string) =>
    (await one<{ id: string }>(ctx.q, 'SELECT id FROM deployment WHERE agent_id = $1 AND workspace_id = $2 AND binding = $3 ORDER BY created_at DESC, id DESC LIMIT 1', [agentId, ctx.workspaceId, binding]))?.id ?? 'none';
  r.register(tool(splitV, {
    name: 'deployment.split', risk: 'external', summary: 'Set which published versions run, and how traffic splits between them',
    describe: i => `Run agent ${i.agentId.slice(0, 8)} on ${i.binding} as ` + i.split.map(s => `${s.percent}% version ${s.versionId.slice(0, 8)}`).join(' + '),
    version: async (ctx, i) => currentSplit(ctx, i.agentId, i.binding),
    run: async (ctx, i) => {
      const a = await loadAgent(ctx, i.agentId, true);
      if (i.split.reduce((n, s) => n + s.percent, 0) !== 100) throw new ValidationError('split', 'percentages must add up to 100');
      const ids = i.split.map(s => s.versionId);
      if (new Set(ids).size !== ids.length) throw new ValidationError('split', 'each version may appear once');
      const found = await many<{ id: string; number: number }>(ctx.q, 'SELECT id, number FROM agent_version WHERE agent_id = $1 AND id = ANY($2::uuid[])', [a.id, ids]);
      if (found.length !== ids.length) throw new ValidationError('split', 'every version must be a published version of this agent');
      const d = await one<{ id: string }>(ctx.q, 'INSERT INTO deployment (workspace_id, agent_id, binding, split) VALUES ($1,$2,$3,$4) RETURNING id',
        [ctx.workspaceId, a.id, i.binding, JSON.stringify(i.split.map(s => ({ version_id: s.versionId, percent: s.percent })))]);
      if (i.binding !== 'test' && a.status === 'draft') await ctx.q.query("UPDATE agent SET status = 'live', updated_at = now() WHERE id = $1 AND workspace_id = $2", [a.id, ctx.workspaceId]);
      return { deploymentId: d!.id, binding: i.binding, split: i.split.map(s => ({ ...s, number: found.find(f => f.id === s.versionId)!.number })) };
    },
  }));

  r.register(tool(obj({ config: any('an AgentConfig') }), {
    name: 'brief.compile', risk: 'read', summary: 'Compile an agent config into its brief (the one compile(), for previews and other modules)',
    run: async (_ctx, i) => compileOrRefuse(validateConfig(i.config)),
  }));

  r.register(tool(obj({ agentId: uuid(), config: any('an AgentConfig'), parentVersionId: uuid(), note: str({ min: 1, max: 300 }) }), {
    name: 'version.candidate', risk: 'draft', summary: 'Create an immutable, undeployed candidate version (e.g. an experiment arm) without touching the draft',
    run: async (ctx, i) => {
      const a = await loadAgent(ctx, i.agentId);
      const parent = await one<{ id: string }>(ctx.q, 'SELECT id FROM agent_version WHERE id = $1 AND agent_id = $2', [i.parentVersionId, a.id]);
      if (!parent) throw new ValidationError('parentVersionId', 'must be a published version of this agent');
      const cfg = validateConfig(i.config);
      compileOrRefuse({ ...cfg, agentId: a.id });   // refuse with the lint or budget reason before numbering anything
      return createVersion(ctx, a.id, cfg, parent.id, i.note);
    },
  }));

  r.register(tool(obj({
    agentId: uuid(), config: opt(any('an AgentConfig; defaults to the draft')),
    simCallerIds: arr(callerRef(), { min: 1, max: 12 }), seeds: arr(num({ int: true, min: 0, max: 1_000_000 }), { min: 1, max: 5 }),
    maxTurns: opt(num({ int: true, min: 2, max: 30 })),
  }), {
    name: 'test.simulate_batch', risk: 'test', summary: 'Run seeded text simulations of a config against saved simulated callers, graded by code',
    run: async (ctx, i) => {
      const a = await loadAgent(ctx, i.agentId);
      const cfg = i.config === undefined ? a.draft : validateConfig(i.config);
      const brief = compileOrRefuse(cfg);
      const callers = await Promise.all([...new Set(i.simCallerIds)].map(async id => [id, await loadSimCaller(ctx, a.id, id)] as const));
      const runs = [];
      for (const [id, sc] of callers) for (const seed of [...new Set(i.seeds)]) {
        const res = await simulate(cfg, brief, sc, i.maxTurns ?? 12, { seed });
        const runId = await storeRun(ctx, a.id, id, cfg, brief.hash, res, seed);
        // Only what a text simulation measures. Cut-ins and reply gaps need audio timing, so they are omitted, never 0.
        runs.push({ runId, simCallerId: id, seed, passed: res.passed, endedBy: res.endedBy,
          metrics: { hung_up: res.endedBy === 'caller', safety_violations: res.door.length, disclosure_missed: !res.grades.find(g => g.check === 'disclosure')?.pass },
          grades: res.grades });
      }
      return { briefHash: brief.hash, configHash: draftHash(cfg), runs };
    },
  }));

  r.register(tool(obj({ agentId: uuid(), binding: opt(str({ oneOf: ['campaign', 'inbound', 'web', 'test'] })), reason: opt(str({ max: 300 })) }), {
    name: 'deployment.revert_to_last_good', risk: 'external', summary: 'Put the previous deployment for a binding back in place',
    describe: i => `Revert agent ${i.agentId.slice(0, 8)}${i.binding ? ' on ' + i.binding : ''} to its previous deployment` + (i.reason ? `: ${i.reason}` : ''),
    version: async (ctx, i) => {
      const b = i.binding ?? (await one<{ binding: string }>(ctx.q, 'SELECT binding FROM deployment WHERE agent_id = $1 AND workspace_id = $2 ORDER BY created_at DESC, id DESC LIMIT 1', [i.agentId, ctx.workspaceId]))?.binding;
      return b ? currentSplit(ctx, i.agentId, b) : 'none';
    },
    run: async (ctx, i) => {
      const a = await loadAgent(ctx, i.agentId, true);
      // No binding given: the one most recently deployed (what a guardrail stop means by "the agent's traffic").
      const binding = i.binding ?? (await one<{ binding: string }>(ctx.q, 'SELECT binding FROM deployment WHERE agent_id = $1 AND workspace_id = $2 ORDER BY created_at DESC, id DESC LIMIT 1', [a.id, ctx.workspaceId]))?.binding;
      if (!binding) throw new ValidationError('agentId', 'this agent has never been deployed; there is nothing to revert to');
      const rows = await many<{ id: string; split: unknown }>(ctx.q, 'SELECT id, split FROM deployment WHERE agent_id = $1 AND workspace_id = $2 AND binding = $3 ORDER BY created_at DESC, id DESC LIMIT 2', [a.id, ctx.workspaceId, binding]);
      if (rows.length < 2) throw new ValidationError('binding', `there is no earlier deployment on ${binding} to revert to`);
      const [current, previous] = rows;
      const d = await one<{ id: string }>(ctx.q, 'INSERT INTO deployment (workspace_id, agent_id, binding, split) VALUES ($1,$2,$3,$4) RETURNING id', [ctx.workspaceId, a.id, binding, JSON.stringify(previous.split)]);
      const why = i.reason ?? (ctx.actor.type === 'member' ? 'reverted by a member' : `reverted by ${ctx.actor.id ?? ctx.actor.type}`);
      await appendAudit(ctx.q, { workspaceId: ctx.workspaceId, actorType: ctx.actor.type, actorId: ctx.actor.id, action: 'deployment.reverted', objectType: 'deployment', objectId: d!.id,
        payload: { agentId: a.id, binding, from: current.id, restored: previous.id, reason: why } });
      return { deploymentId: d!.id, binding, restoredFrom: previous.id, replaced: current.id, split: previous.split, reason: why };
    },
  }));

  r.register(tool(obj({ agentId: uuid() }), {
    name: 'version.list', risk: 'read', summary: "List an agent's published versions",
    run: async (ctx, i) => {
      const a = await loadAgent(ctx, i.agentId);
      const rows = await many(ctx.q, `SELECT id, number, hash, parent_id, author_type, author_id, note, created_at,
        config->'brief'->>'hash' AS brief_hash, (config->'brief'->>'bytes')::int AS brief_bytes FROM agent_version WHERE agent_id = $1 ORDER BY number DESC`, [a.id]);
      return { agentId: a.id, versions: rows };
    },
  }));

  r.register(tool(obj({ agentId: uuid(), from: opt(uuid()), to: opt(str({ max: 40 })) }), {
    name: 'version.diff', risk: 'read', summary: 'Compare two versions, or the draft with the latest version',
    run: async (ctx, i) => {
      const a = await loadAgent(ctx, i.agentId);
      const get = async (id: string) => {
        const v = await one<{ id: string; number: number; config: { agent: AgentConfig; brief: { hash: string; bytes: number } } }>(ctx.q,
          'SELECT id, number, config FROM agent_version WHERE id = $1 AND agent_id = $2', [id, a.id]);
        if (!v) throw new ValidationError('from', 'no such version of this agent');
        return { label: `version ${v.number}`, agent: v.config.agent, brief: v.config.brief };
      };
      const latest = await one<{ id: string }>(ctx.q, 'SELECT id FROM agent_version WHERE agent_id = $1 ORDER BY number DESC LIMIT 1', [a.id]);
      const draftSide = () => { const p = preview(a.draft); return { label: 'draft', agent: a.draft, brief: p.compiles ? { hash: p.brief.hash, bytes: p.brief.bytes } : null }; };
      const to = !i.to || i.to === 'draft' ? draftSide() : await get(uuid()(i.to, 'to'));
      const fromId = i.from ?? latest?.id;
      const from = fromId ? await get(fromId) : null;
      return { from: from ? { label: from.label, brief: from.brief } : null, to: { label: to.label, brief: to.brief },
        changes: from ? diff(comparable(from.agent), comparable(to.agent)) : [{ path: '', from: null, to: 'first version' }] };
    },
  }));
}

export const module: Module = { name: 'agents', register: registerAgentTools };
