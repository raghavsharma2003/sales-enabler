// BLIND-BR2 no-model probe, part 2. Reads the set and what judge-eval actually sent (the capture from
// br2_probe_fake.mjs) and checks, item by item, that judge-eval placed each item where its field says and applied its
// persona: a fact as an extra facts[N].value with its key as the label, an opening as opening.usefulFirst, a note as
// persona.notes, and the persona's name and gender in the context line. Prints COUNTS ONLY (by label, field and
// check), never an item's text, key or persona value. Deletes the capture at the end. No network.
// Usage: node br2_probe_verify.mjs SET.json CAPTURE.jsonl
import { readFileSync, rmSync } from 'node:fs';
const [setPath, capPath] = process.argv.slice(2);
const set = JSON.parse(readFileSync(setPath, 'utf8'));
const caps = readFileSync(capPath, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
// The template judge-eval uses (agents/templates.ts appliance-service-followup): its persona settings and field count.
const TPL = { name: 'Meher', gender: 'female' };
const norm = s => String(s).replace(/\s+/g, ' ').trim().slice(0, 600).replace(/(BRIEF)?>>>|<<<(BRIEF)?/g, '');
const keyLabel = k => String(k).replace(/[^\w .-]/g, '').slice(0, 60);
const parse = u => {
  const ctx = (/^Context \(not to be judged\): (.*)$/m.exec(u) || [])[1] ?? '';
  const body = (/<<<BRIEF\n([\s\S]*?)\nBRIEF>>>/.exec(u) || [])[1] ?? '';
  const rows = body.split('\n').map(l => /^(\d+)\. (\S+?)(?: \(key: ([^)]*)\))?: (.*)$/.exec(l)).filter(Boolean).map(m => ({ path: m[2], key: m[3] ?? null, text: m[4] }));
  return { ctx, rows };
};
const P = caps.map(c => ({ ...parse(c.user), purpose: c.purpose, used: false }));
const out = { capture_calls: caps.length, purposes: [...new Set(caps.map(c => c.purpose))], by_label: {} };
const mine = p => /^(persona\.notes|facts\[|opening\.usefulFirst)/.test(p);
const extraMine = {};
const personaKeys = new Set();
for (const label of ['flag', 'pass']) {
  const items = set[label] ?? [];
  const b = out.by_label[label] = { items: items.length, field: {}, persona_object: 0, fact_with_key: 0, placed: 0, persona_in_context: 0, unmatched: 0 };
  for (const x of items) {
    const f = x.field ?? '(none)';
    b.field[f] = (b.field[f] ?? 0) + 1;
    if (x.persona && typeof x.persona === 'object') { b.persona_object++; Object.keys(x.persona).forEach(k => personaKeys.add(k)); }
    if (f === 'fact' && x.key) b.fact_with_key++;
    const name = ((x.persona?.name) || TPL.name || 'unnamed').slice(0, 60), gender = ((x.persona?.gender) || TPL.gender || 'unspecified').slice(0, 20);
    const want = f === 'fact' ? [{ path: /^facts\[\d+\]\.value$/, key: x.key ? keyLabel(x.key) : 'note', text: norm(x.text) }]
      : f === 'opening' ? [{ path: /^opening\.usefulFirst$/, key: null, text: norm(x.text) }]
      : String(x.text).split('\n').map(s => s.trim()).filter(Boolean).map((s, i) => ({ path: new RegExp(`^persona\\.notes\\[${i}\\]$`), key: null, text: norm(s) }));
    const hit = P.find(c => !c.used && want.every(w => c.rows.some(r => w.path.test(r.path) && r.text === w.text && (w.key === null || r.key === w.key))));
    if (!hit) { b.unmatched++; continue; }
    hit.used = true; b.placed++;
    if (hit.ctx.includes(`named ${name} (${gender})`)) b.persona_in_context++;
    // fields judge-eval's own predicate counts for this item that are NOT the item's (template fields)
    const own = r => want.some(w => w.path.test(r.path) && r.text === w.text);
    const n = hit.rows.filter(r => mine(r.path) && !own(r)).length;
    extraMine[`${label}/${f}`] = extraMine[`${label}/${f}`] ?? {}; extraMine[`${label}/${f}`][n] = (extraMine[`${label}/${f}`][n] ?? 0) + 1;
  }
}
out.persona_keys_used = [...personaKeys].sort();
out.calls_not_matched_to_an_item = P.filter(c => !c.used).length;
out.template_fields_also_counted_by_judge_eval = extraMine;
console.log(JSON.stringify(out, null, 1));
rmSync(capPath, { force: true });
const ok = ['flag', 'pass'].every(l => out.by_label[l].unmatched === 0 && out.by_label[l].placed === out.by_label[l].items && out.by_label[l].persona_in_context === out.by_label[l].items)
  && out.calls_not_matched_to_an_item === 0 && caps.length === (set.flag?.length ?? 0) + (set.pass?.length ?? 0);
console.log(ok ? 'PROBE OK: every item placed by its field, with its persona in the context line' : 'PROBE FAILED: see counts above');
process.exit(ok ? 0 : 1);
