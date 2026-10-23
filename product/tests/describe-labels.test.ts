// Approval cards say what will happen in words a person reads: names, not ids or hashes
// (research/2026-10-23/walkthrough/FRICTION.md, S2). Every registered tool's describe() runs on an input generated from
// its schema, with every id and hash as hex, and must not print a hex run of 8+ characters. Skipped without DATABASE_URL.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import type { Registry, ToolCtx } from '../server/tools.ts';
import { modules } from '../server/modules/index.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(() => { if (skip) return; pool = createPool(); registry = buildApp(pool, modules).registry; });
after(async () => { await pool?.end(); });

const HEX = /[0-9a-f]{8,}/i;

/** A value that satisfies a JSON Schema, with ids and hashes as hex so a describe that prints them is caught. */
function sample(s: any, key = ''): unknown {
  if (!s || typeof s !== 'object') return 'sample';
  if (s.enum) return s.enum[0];
  switch (s.type) {
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(s.properties ?? {})) out[k] = sample(v, k);
      return out;
    }
    case 'array': return Array.from({ length: Math.max(1, s.minItems ?? 1) }, () => sample(s.items, key));
    case 'integer': case 'number': return Math.max(s.minimum ?? 1, Math.min(s.maximum ?? 5, 5));
    case 'boolean': return true;
    case 'string': {
      if (s.format === 'uuid' || /id$/i.test(key)) return s.format === 'uuid' ? randomUUID() : randomUUID().slice(0, Math.min(36, s.maxLength ?? 36));
      if (/hash$/i.test(key) || s.minLength === 64) return 'ab'.repeat(32);
      if (s.pattern) return { '^\\d{6}$': '123456', '^([01]\\d|2[0-3]):[0-5]\\d$': '10:00', '^\\d{4}-\\d{2}-\\d{2}$': '2026-11-02' }[s.pattern as string] ?? null;
      if (/email/i.test(key)) return 'person@example.test';
      if (/url/i.test(key)) return 'https://hooks.example.test/in';
      return 'Sample ' + key.slice(0, Math.max(1, (s.maxLength ?? 40) - 7));
    }
    default: return 'sample';
  }
}

test('no approval summary prints an id or a hash', { skip }, async () => {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('describe test') RETURNING id"))!.id;
  const ctx: ToolCtx = { q: pool, workspaceId: ws, actor: { type: 'system' } };
  const bad: string[] = [];
  let described = 0;
  for (const t of registry.list()) {
    const def = registry.get(t.name)!;
    if (!def.describe) continue;
    let input: unknown;
    try { input = def.input(sample(def.input.schema)); } catch { continue; }       // a schema the sampler cannot satisfy
    const text = await def.describe(input as never, ctx);
    described++;
    if (HEX.test(text)) bad.push(`${t.name}: ${text}`);
  }
  assert.ok(described >= 35, `only ${described} describes could be exercised`);
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('version.publish says "Publish <agent name>, version N"', { skip }, async () => {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('publish describe') RETURNING id"))!.id;
  const m = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `d${Math.random()}@example.test`]))!.id;
  const as = { workspaceId: ws, actor: { type: 'member' as const, id: m, role: 'owner' as const } };
  const a: any = await registry.execute(pool, 'agent.create', { name: 'AC service reminders', templateId: 'appliance-service-followup' }, as);
  const set: any = await registry.execute(pool, 'stack.set', { agentId: a.result.agentId, stackId: 'v2-flashlite' }, as);
  const p: any = await registry.execute(pool, 'version.publish', { agentId: a.result.agentId, draftHash: set.result.draftHash }, as);
  assert.equal(p.status, 'needs_approval');
  assert.equal(p.summary, 'Publish AC service reminders, version 1');
});
