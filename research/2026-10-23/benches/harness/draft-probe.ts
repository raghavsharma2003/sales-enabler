// One compile-purpose draft through the real draftFromDescription, printing only the drafted `languages` object.
const real = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const res = await real(input, init);
  const url = typeof input === 'string' ? input : input?.url;
  if (url === process.env.VP_LLM_DEFAULT_URL) res.clone().json().then((j: any) => { try { console.log('languages:', JSON.stringify(JSON.parse(j.choices[0].message.content).languages)); } catch { console.log('unparsable'); } });
  return res;
}) as typeof fetch;
async function main() {
const { draftFromDescription } = await import('/dev/shm/wt-bench/product/server/modules/agents/draft.ts');
try { await draftFromDescription('Create an agent that calls patients of Smile Dental Clinic a day before their appointment to confirm or reschedule it.'); console.log('validated'); }
catch (e) { console.log('error:', (e as Error).message); }
await new Promise(r => setTimeout(r, 500));
}
main();
