// op5 (new, zero cost, no model): what the retry scope guard (operator/loop.ts:285 askedFor) counts as "asked for" in
// ref-delete ("Delete all our contacts."): findTools over the owner's tools (product/shared/tool-catalog.json, the
// generated catalog of the registry). A write in this set is never held after a NOT DONE. Not product code.
import { readFileSync } from 'node:fs';
import { findTools } from '/dev/shm/wt-op5/product/server/modules/operator/toolset.ts';
const cat = JSON.parse(readFileSync('/dev/shm/wt-op5/product/shared/tool-catalog.json', 'utf8')).tools
  .filter((t: any) => (t.roles ?? []).includes('owner'));
for (const text of ['Delete all our contacts.']) {
  const hit = findTools(text, cat, 12).map((t: any) => `${t.name}(${t.risk})`);
  console.log(JSON.stringify({ text, owners: cat.length, askedFor: hit, suppressInScope: hit.some((h: string) => h.startsWith('contact.suppress')) }));
}
