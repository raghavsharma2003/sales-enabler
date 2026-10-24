// BLIND-BR2, after the one scoring (or on a DEV dry run): attribute each counted model finding to the item's own field
// or to a template field. judge-eval's predicate counts findings on persona.notes, facts[...] and opening.usefulFirst,
// which for every item also covers the template's facts and opening (and its notes, for fact and opening items).
// Method: rebuild each row's brief exactly as judge-eval's askBrief does, match it to the spy record by the sha256_16 of
// the user message, replay the recorded {field, kind, confidence} through the real reviewBrief (fake LLM, no network),
// re-derive judge-eval's verdict (asserted equal to results.json's), then the verdict on the item's own field(s) only.
// Usage: node --import tsx br2_attribution.mts TREE SET.json RESULTS.json SPY.jsonl [OUT.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const [tree, setPath, resPath, spyPath, outPath] = process.argv.slice(2);
const { setFakeLlm } = await import(`${tree}/product/server/llm.ts`);
const review = await import(`${tree}/product/server/modules/agents/review.ts`);
const base = (await import(`${tree}/product/server/modules/agents/templates.ts`)).getTemplate('appliance-service-followup').config;
const set = JSON.parse(readFileSync(setPath, 'utf8'));
const rows = JSON.parse(readFileSync(resPath, 'utf8'));
const spy = readFileSync(spyPath, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const bySha = new Map<string, any[]>(); for (const s of spy) { const a = bySha.get(s.user_sha16) ?? []; a.push(s); bySha.set(s.user_sha16, a); }
const mine = (p: string) => /^(persona\.notes|facts\[|opening\.usefulFirst)/.test(p);
const TH = review.BRIEF_REVIEW.threshold;
function build(text: string, persona: any, field: string, key: string) {          // judge-eval askBrief, line for line
  const c = structuredClone(base) as any;
  c.persona = { ...c.persona, ...(persona ?? {}) };
  if (field === 'fact') c.facts = [...(c.facts ?? []), { key: key || 'note', value: text, purpose: 'service', source: 'eval' }];
  else if (field === 'opening') c.opening = { ...c.opening, usefulFirst: text };
  else c.persona.notes = text.split('\n').map((x: string) => x.trim()).filter(Boolean);
  return c;
}
const own = (c: any, field: string) => (p: string) => field === 'fact' ? p === `facts[${c.facts.length - 1}].value` : field === 'opening' ? p === 'opening.usefulFirst' : p.startsWith('persona.notes');
let replayMismatch = 0, noSpy = 0;
const per: any[] = [];
for (const r of rows) {
  const [, lst, idx] = /\.(flag|pass)\.(\d+)$/.exec(r.id)!;
  const x = set[lst][Number(idx) - 1];
  if (x.text !== r.text) throw new Error(`row ${r.id} does not map back to the set`);
  const c = build(x.text, x.persona, x.field, x.key);
  const sha = createHash('sha256').update(review.reviewInput(c).text).digest('hex').slice(0, 16);
  const rec = (bySha.get(sha) ?? []).shift();
  const out: any = { id: r.id, list: lst, cat: lst === 'flag' ? x.kind : (x.family ?? x.kind ?? x.group ?? null), field: x.field ?? 'note', truth: r.truth, floor: r.floor, judge: r.judge, failed: r.failed };
  if (!rec) { noSpy++; out.spy = false; per.push(out); continue; }
  out.spy = true; out.spy_i = rec.i;
  if (r.failed || !Array.isArray(rec.findings)) { out.item_judge = null; out.template_counted = false; per.push(out); continue; }
  setFakeLlm(() => ({ text: JSON.stringify({ findings: rec.findings.map((f: any) => ({ ...f, reason: '' })) }), toolCalls: [], usage: { inputTokens: 0, outputTokens: 0 }, model: 'replay', provider: 'replay' }));
  const rv = await review.reviewBrief(c, { assumeConfigured: true, threshold: 0, alwaysAsk: true });
  const top = rv.model.filter((f: any) => mine(f.path)).sort((a: any, b: any) => b.confidence - a.confidence)[0];
  const says = rv.mode === 'model' ? (top?.kind ?? 'none') !== 'none' && (top?.confidence ?? 0) >= TH : null;
  if (says !== r.judge) replayMismatch++;
  const isOwn = own(c, x.field);
  const topOwn = rv.model.filter((f: any) => isOwn(f.path)).sort((a: any, b: any) => b.confidence - a.confidence)[0];
  out.item_judge = (topOwn?.kind ?? 'none') !== 'none' && (topOwn?.confidence ?? 0) >= TH;
  const counted = rv.model.filter((f: any) => mine(f.path) && f.confidence >= TH);
  out.template_counted = counted.some((f: any) => !isOwn(f.path));
  out.template_counted_paths = [...new Set(counted.filter((f: any) => !isOwn(f.path)).map((f: any) => f.path))];
  out.any_template_finding_ge_th = rv.model.some((f: any) => !isOwn(f.path) && f.confidence >= TH);
  out.floor_on_template = rv.rules.some((f: any) => mine(f.path) && !isOwn(f.path));
  out.raw_findings = rec.findings.length;
  out.raw_own_ge_th = rec.findings.some((f: any) => Number.isInteger(f.field) && rec.paths?.[f.field - 1] && isOwn(rec.paths[f.field - 1]) && f.confidence >= TH && f.kind in review.BRIEF_REVIEW.kinds);
  out.raw_on_template = rec.findings.filter((f: any) => Number.isInteger(f.field) && rec.paths?.[f.field - 1] && !isOwn(rec.paths[f.field - 1])).length;
  per.push(out);
}
const k = (rs: any[], f: (r: any) => boolean) => rs.filter(f).length;
const pos = per.filter(r => r.truth), neg = per.filter(r => !r.truth);
const summary = {
  rows: per.length, spy_records: spy.length, rows_without_spy_record: noSpy, replay_mismatches: replayMismatch,
  floor_findings_on_template_fields: k(per, r => r.floor_on_template),
  rows_with_a_counted_template_field_finding: { flag: k(pos, r => r.template_counted), pass: k(neg, r => r.template_counted) },
  judge_as_scored: { recall: k(pos, r => r.judge === true), fp: k(neg, r => r.judge === true) },
  judge_item_field_only: { recall: k(pos, r => r.item_judge === true), fp: k(neg, r => r.item_judge === true) },
  combined_as_scored: { recall: k(pos, r => r.floor || r.judge === true), fp: k(neg, r => r.floor || r.judge === true) },
  combined_item_field_only: { recall: k(pos, r => r.floor || r.item_judge === true), fp: k(neg, r => r.floor || r.item_judge === true) },
  counted_only_because_of_a_template_field: { flag: pos.filter(r => r.judge === true && r.item_judge === false).map(r => r.id), pass: neg.filter(r => r.judge === true && r.item_judge === false).map(r => r.id) },
  raw_model_findings: { all: per.reduce((a, r) => a + (r.raw_findings ?? 0), 0), on_template_fields_any_confidence: per.reduce((a, r) => a + (r.raw_on_template ?? 0), 0), rows_with_one: k(per, r => (r.raw_on_template ?? 0) > 0) },
  dropped_by_the_honest_affirmation_filter: { flag: pos.filter(r => r.raw_own_ge_th && r.item_judge === false).map(r => r.id), pass: neg.filter(r => r.raw_own_ge_th && r.item_judge === false).map(r => r.id) },
  template_paths_counted: Object.entries(per.flatMap(r => r.template_counted_paths ?? []).reduce((m: any, p: string) => ({ ...m, [p]: (m[p] ?? 0) + 1 }), {})),
};
console.log(JSON.stringify(summary, null, 1));
if (outPath) writeFileSync(outPath, JSON.stringify({ summary, rows: per.map(({ id, list, cat, field, truth, floor, judge, item_judge, template_counted, template_counted_paths, failed }) => ({ id, list, cat, field, truth, floor, judge, item_judge, template_counted, template_counted_paths, failed })) }, null, 1));
