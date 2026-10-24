// op6 (zero cost): operator/loop.ts asksFor on given (tool, member text) pairs. Not product code.
import { asksFor } from '/dev/shm/wt-op6/product/server/modules/operator/loop.ts';
for (const [tool, text] of JSON.parse(process.argv[2]!) as [string, string][]) console.log(JSON.stringify({ tool, text, asksFor: asksFor(tool, text) }));
