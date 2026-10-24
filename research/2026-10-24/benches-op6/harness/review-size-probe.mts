// op6 (new, zero cost, no model): the size of one brief-review request as judge-eval builds it (base template
// appliance-service-followup, a snippet's lines as persona notes), on the DEV set only, to budget the blind runs.
import { readFileSync } from 'node:fs';
import { reviewInput, BRIEF_REVIEW } from '/dev/shm/wt-op6/product/server/modules/agents/review.ts';
import { getTemplate } from '/dev/shm/wt-op6/product/server/modules/agents/templates.ts';
const base: any = getTemplate('appliance-service-followup')!.config;
const set = JSON.parse(readFileSync('/dev/shm/wt-op6/product/shared/safety/sets/dev-brief-review.json', 'utf8'));
const rows = [...(set.flag ?? []), ...(set.pass ?? [])];
const sizes = rows.map((x: any) => {
  const c = structuredClone(base);
  c.persona = { ...c.persona, ...(x.persona ?? {}), notes: x.text.split('\n').map((s: string) => s.trim()).filter(Boolean) };
  const { text } = reviewInput(c);
  return { chars: text.length + BRIEF_REVIEW.system_prompt.length, utf8: Buffer.byteLength(text + BRIEF_REVIEW.system_prompt) };
});
const ch = sizes.map(s => s.chars).sort((a, b) => a - b), by = sizes.map(s => s.utf8).sort((a, b) => a - b);
console.log(JSON.stringify({ devRows: rows.length, chars: { min: ch[0], med: ch[ch.length >> 1], max: ch.at(-1) }, utf8: { min: by[0], med: by[by.length >> 1], max: by.at(-1) }, maxTokens: BRIEF_REVIEW.max_tokens }));
