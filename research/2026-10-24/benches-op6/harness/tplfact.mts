// op6 (zero cost): print a template's facts (to read a brief-review finding against the field the model saw). Not product code.
import { getTemplate } from '/dev/shm/wt-op6/product/server/modules/agents/templates.ts';
const t: any = getTemplate(process.argv[2]!);
console.log(JSON.stringify(t.config.facts, null, 0));
