// The agents module: templates, drafts, the brief, the voice stack choice, tools, text simulations, versions and splits.
// Edits never publish: every edit changes agent.draft; version.publish (A2) compiles the exact draft the approval card
// showed into an immutable agent_version holding { agent, brief }, and deployment.split (A2) decides where it runs.
import type { AgentConfig, ToolGrant } from '../../../shared/agent-config.ts';
import { RISK_CLASSES } from '../../../shared/approval.ts';
import { requireStack, STACKS, StackError, type VoiceStack } from '../../../shared/stacks.ts';
import { lintAgentConfig } from '../../../shared/safety/index.ts';
import { any, arr, bool, num, obj, opt, record, str, uuid, ValidationError } from '../../../shared/validate.ts';
import type { Module } from '../../app.ts';
import { many, one } from '../../db.ts';
import { tool, type Registry, type ToolCtx } from '../../tools.ts';
import { BriefBudgetError, BriefLintError, compile, compileReport } from './compile.ts';
import { draftHash, validateConfig, versionHashOf } from './config.ts';
import { DraftError, draftFromDescription } from './draft.ts';
import { shapeLint } from './lint.ts';
import { passCriteriaV, simulate, type SimCaller } from './simulate.ts';
import { getTemplate, TEMPLATES } from './templates.ts';

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

function stackCard(s: VoiceStack) {
  return { id: s.id, label: s.label, kind: s.kind, status: s.status, note: s.note, replyGap: s.replyGap, requires: s.requires ?? [], risks: s.risks ?? [],
    // money.estimate is not reachable from inside a tool yet (see STATUS.json); a missing figure reads "not measured", never zero.
    pricePerMinute: { value: 'not measured', grade: 'not_measured' as const, source: 'money.estimate not wired into the picker yet' } };
}

/** In-call tools an agent may be granted by name, with the risk class each carries (workspace tools attach by id). */
const IN_CALL_TOOLS: Record<string, ToolGrant['risk']> = {
  end_call: 'read', lookup_order: 'read', kb_query: 'read', mark_callback: 'draft', book_slot: 'draft',
  transfer: 'external', send_whatsapp_link: 'external', send_sms: 'external',
};

// ------------------------------------------------------------------------------------------------ brief.edit patches

const LOCKED = new Set(['schema', 'agentId', 'version', 'versionHash', 'voice', 'tools']);
const LOCK_REASON: Record<string, string> = { voice: 'use stack.set or voice.set', tools: 'use tool.attach' };

function parsePath(p: string): (string | number)[] {
  if (!/^[a-zA-Z]+(\.[a-zA-Z]+|\[\d+\])*$/.test(p)) throw new ValidationError('patch.path', `"${p}" is not a field path like persona.notes[0]`);
  return [...p.matchAll(/([a-zA-Z]+)|\[(\d+)\]/g)].map(m => (m[1] !== undefined ? m[1] : Number(m[2])));
}

function applyPatch(draft: AgentConfig, ops: { op: string; path: string; value?: unknown }[]): unknown {
  const doc = structuredClone(draft) as unknown as Record<string, unknown>;
  for (const [i, o] of ops.entries()) {
    const keys = parsePath(o.path);
    if (LOCKED.has(String(keys[0]))) throw new ValidationError(`patch[${i}].path`, `${keys[0]} cannot be edited here` + (LOCK_REASON[String(keys[0])] ? `; ${LOCK_REASON[String(keys[0])]}` : ''));
    let parent: any = doc;
    for (const k of keys.slice(0, -1)) {
      parent = parent?.[k];
      if (parent === undefined || parent === null || typeof parent !== 'object') throw new ValidationError(`patch[${i}].path`, `${o.path} does not exist`);
    }
    const last = keys[keys.length - 1];
    if (o.op === 'set') {
      if (o.value === undefined) throw new ValidationError(`patch[${i}].value`, 'set needs a value');
      if (Array.isArray(parent) && (typeof last !== 'number' || last >= parent.length)) throw new ValidationError(`patch[${i}].path`, `${o.path} is past the end of the list; use append`);
      parent[last] = o.value;
    } else if (o.op === 'remove') {
      if (Array.isArray(parent) && typeof last === 'number') { if (last >= parent.length) throw new ValidationError(`patch[${i}].path`, `${o.path} does not exist`); parent.splice(last, 1); }
      else delete parent[last];
    } else {
      const list = parent[last];
      if (!Array.isArray(list)) throw new ValidationError(`patch[${i}].path`, `${o.path} is not a list`);
      list.push(o.value);
    }
  }
  return doc;
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
      return { agentId: row!.id, status: 'draft', from, draftHash: draftHash(draft), draft, ...preview(draft), stackChosen: false, usage };
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
      const stack = STACKS.find(s => s.id === a.draft.voice.stackId);
      const versions = await many(ctx.q, 'SELECT id, number, hash, created_at FROM agent_version WHERE agent_id = $1 ORDER BY number DESC LIMIT 20', [a.id]);
      const tests = await many(ctx.q, 'SELECT id, passed, draft_hash, created_at FROM agent_test_run WHERE agent_id = $1 AND workspace_id = $2 ORDER BY created_at DESC LIMIT 10', [a.id, ctx.workspaceId]);
      return { agent: { id: a.id, name: a.name, job: a.job, status: a.status, updatedAt: a.updated_at }, draft: a.draft, draftHash: draftHash(a.draft),
        ...preview(a.draft), stack: stack ? stackCard(stack) : null, stackChosen: !!stack, versions, tests };
    },
  }));

  r.register(tool(obj({
    agentId: uuid(), expectDraftHash: opt(str({ max: 64 })),
    patch: arr(obj({ op: str({ oneOf: ['set', 'remove', 'append'] }), path: str({ min: 1, max: 120 }), value: opt(any('the new value')) }), { min: 1, max: 30 }),
  }), {
    name: 'brief.edit', risk: 'draft', summary: "Edit an agent's draft brief with a validated patch (never publishes)",
    run: async (ctx, i) => {
      const a = await loadAgent(ctx, i.agentId, true);
      if (i.expectDraftHash && i.expectDraftHash !== draftHash(a.draft)) throw new ValidationError('expectDraftHash', 'the draft changed since you last read it; reload and edit again');
      const next = validateConfig(applyPatch(a.draft, i.patch));
      await saveDraft(ctx, a.id, next);
      return { agentId: a.id, draftHash: draftHash(next), changes: diff(comparable(a.draft), comparable(next)), ...preview(next) };
    },
  }));

  r.register(tool(obj({}), {
    name: 'stack.list', risk: 'read', summary: 'The finalised voice stacks with their figures and grades; there is no default',
    run: async () => ({ default: null, note: 'There is no default stack yet: choose one for each agent.', stacks: STACKS.map(stackCard) }),
  }));

  r.register(tool(obj({ agentId: uuid(), stackId: str({ min: 1, max: 60 }) }), {
    name: 'stack.set', risk: 'draft', summary: "Choose an agent's voice stack from the finalised stacks",
    run: async (ctx, i) => {
      const a = await loadAgent(ctx, i.agentId, true);
      let s: VoiceStack;
      try { s = requireStack(i.stackId); } catch (e) { if (e instanceof StackError) throw new ValidationError('stackId', e.message + `; choose one of: ${STACKS.map(x => x.id).join(', ')}`); throw e; }
      const changed = a.draft.voice.stackId !== s.id;
      const next: AgentConfig = { ...a.draft, voice: changed ? { stackId: s.id } : a.draft.voice };   // a voice belongs to its stack
      await saveDraft(ctx, a.id, next);
      return { agentId: a.id, stack: stackCard(s), voiceCleared: changed && !!a.draft.voice.voiceId, draftHash: draftHash(next), ...preview(next) };
    },
  }));

  r.register(tool(obj({ agentId: uuid(), voiceId: str({ min: 1, max: 80 }), speed: opt(num({ min: 0.7, max: 1.3 })) }), {
    name: 'voice.set', risk: 'draft', summary: "Choose the agent's voice and speed within its chosen stack",
    run: async (ctx, i) => {
      const a = await loadAgent(ctx, i.agentId, true);
      if (!a.draft.voice.stackId) throw new ValidationError('agentId', 'choose a voice stack first (stack.set): there is no default');
      const next: AgentConfig = { ...a.draft, voice: { stackId: a.draft.voice.stackId, voiceId: i.voiceId, ...(i.speed !== undefined ? { speed: i.speed } : {}) } };
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

  r.register(tool(obj({ agentId: uuid(), simCallerId: opt(uuid()), simCaller: opt(simCallerV), maxTurns: opt(num({ int: true, min: 2, max: 30 })) }), {
    name: 'test.simulate', risk: 'test', summary: 'Run a text simulation of the draft against a simulated caller, graded by code',
    run: async (ctx, i) => {
      if (!!i.simCallerId === !!i.simCaller) throw new ValidationError('simCallerId', 'give either a simCallerId or an inline simCaller');
      const a = await loadAgent(ctx, i.agentId);
      const brief = compile(a.draft);                 // throws on lint or budget: an untestable draft is said so, not run
      let sc: SimCaller, scId: string;
      if (i.simCallerId) {
        const row = await one<{ id: string; persona: string; scenario: string; hidden_keys: Record<string, string>; contact: Record<string, string>; pass_criteria: unknown }>(ctx.q,
          'SELECT id, persona, scenario, hidden_keys, contact, pass_criteria FROM sim_caller WHERE id = $1 AND workspace_id = $2 AND (agent_id = $3 OR agent_id IS NULL)', [i.simCallerId, ctx.workspaceId, a.id]);
        if (!row) throw new ValidationError('simCallerId', 'no such simulated caller for this agent');
        sc = { persona: row.persona, scenario: row.scenario, hiddenKeys: row.hidden_keys, contact: row.contact, passCriteria: passCriteriaV(row.pass_criteria) };
        scId = row.id;
      } else {
        sc = { ...i.simCaller!, contact: i.simCaller!.contact ?? {} };
        scId = (await one<{ id: string }>(ctx.q, 'INSERT INTO sim_caller (workspace_id, agent_id, persona, scenario, hidden_keys, contact, pass_criteria) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
          [ctx.workspaceId, a.id, sc.persona, sc.scenario, JSON.stringify(sc.hiddenKeys), JSON.stringify(sc.contact), JSON.stringify(sc.passCriteria)]))!.id;
      }
      const res = await simulate(a.draft, brief, sc, i.maxTurns ?? 12);
      const run = await one<{ id: string }>(ctx.q, `INSERT INTO agent_test_run (workspace_id, agent_id, sim_caller_id, draft_hash, brief_hash, transcript, door, grades, passed, ended_by, usage)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [ctx.workspaceId, a.id, scId, draftHash(a.draft), brief.hash, JSON.stringify(res.transcript), JSON.stringify(res.door), JSON.stringify(res.grades), res.passed, res.endedBy, JSON.stringify(res.usage)]);
      return { runId: run!.id, simCallerId: scId, briefHash: brief.hash, ...res };
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
      try { requireStack(a.draft.voice.stackId); } catch (e) { if (e instanceof StackError) throw new ValidationError('voice.stackId', e.message); throw e; }
      const prev = await one<{ id: string; number: number }>(ctx.q, 'SELECT id, number FROM agent_version WHERE agent_id = $1 ORDER BY number DESC LIMIT 1', [a.id]);
      const number = (prev?.number ?? 0) + 1;
      const agent: AgentConfig = validateConfig({ ...a.draft, agentId: a.id, version: number, versionHash: '' });
      agent.versionHash = versionHashOf(agent);
      const brief = compile(agent);                  // the brief is compiled ONCE, here; tickets copy it
      const actor = ctx.actor.type === 'vp_success' ? 'system' : ctx.actor.type;
      const v = await one<{ id: string }>(ctx.q, `INSERT INTO agent_version (agent_id, number, hash, parent_id, author_type, author_id, note, config)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [a.id, number, agent.versionHash, prev?.id ?? null, actor, ctx.actor.id ?? null, i.note ?? null, JSON.stringify({ agent, brief })]);
      return { versionId: v!.id, number, versionHash: agent.versionHash, parentId: prev?.id ?? null, brief: { hash: brief.hash, bytes: brief.bytes } };
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
