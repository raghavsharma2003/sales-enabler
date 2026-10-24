// BLIND-BR2, after scoring: which regex-door rule (agents/guard.ts hardFindings) fires on each given item, with the
// field path, building the brief exactly as judge-eval's askBrief does. Ids, rules and paths only. No model calls.
// Usage: node --import tsx br2_regex_rules.mts TREE SET.json ID [ID ...]
import { readFileSync } from 'node:fs';
const [tree, setPath, ...ids] = process.argv.slice(2);
const { hardFindings } = await import(`${tree}/product/server/modules/agents/guard.ts`);
const { lintAgentConfig } = await import(`${tree}/product/shared/safety/index.ts`);
const base = (await import(`${tree}/product/server/modules/agents/templates.ts`)).getTemplate('appliance-service-followup').config;
const set = JSON.parse(readFileSync(setPath, 'utf8'));
for (const id of ids) {
  const [, lst, i] = /\.(flag|pass)\.(\d+)$/.exec(id)!; const x = set[lst][Number(i) - 1];
  const c = structuredClone(base) as any; c.persona = { ...c.persona, ...(x.persona ?? {}) };
  if (x.field === 'fact') c.facts = [...(c.facts ?? []), { key: x.key || 'note', value: x.text, purpose: 'service', source: 'eval' }];
  else if (x.field === 'opening') c.opening = { ...c.opening, usefulFirst: x.text };
  else c.persona.notes = x.text.split('\n').map((s: string) => s.trim()).filter(Boolean);
  const lint = lintAgentConfig(c).filter((f: any) => f.effect === 'refuse' && /^(persona\.notes|facts\[|opening\.usefulFirst)/.test(f.path));
  console.log(id, x.field, hardFindings(c).map((f: any) => `${f.rule}@${f.path}`).join('; ') || 'none', '| lint:', lint.map((f: any) => `${f.rule}${f.id ? '/' + f.id : ''}: ${String(f.message).slice(0, 90)}`).join('; '));
}
