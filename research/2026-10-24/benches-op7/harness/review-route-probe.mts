// op7 (new, zero cost, NO model request): which route, model and mode the brief review takes under the exact env run.sh
// builds (run with PROBE=<this file> sh run.sh operator <deployment> probe 0). globalThis.fetch is replaced by a stub
// BEFORE the product modules load; the stub never calls the network, records what the request would have been (whether
// its URL is VP_LLM_DEFAULT_URL, the model in the body, the auth header NAMES), and answers {"findings": []}. Then
// agents/review.ts reviewBrief runs on a template config the regex door lets through, and its mode and label are printed.
// It also prints the Vertex gate (server/vertex-token.ts) and which VP_LLM_* names are set. Prints no URL, key or token.
// Not product code.
const seen: { toDefault: boolean; host: string; model: unknown; headerNames: string[]; json: boolean }[] = [];
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  let b: any = {}; try { b = JSON.parse(String(init?.body ?? '{}')); } catch { /* not JSON */ }
  const h = init?.headers ?? {};
  seen.push({ toDefault: url === process.env.VP_LLM_DEFAULT_URL, host: url === process.env.VP_LLM_DEFAULT_URL ? '(the default URL)' : (new URL(url).hostname.split('.').slice(-2).join('.')),
    model: b.model, headerNames: Object.keys(h).map(k => k.toLowerCase()).sort(), json: Boolean(b.response_format) });
  return new Response(JSON.stringify({ model: 'stub', choices: [{ message: { role: 'assistant', content: '{"findings": []}' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
    { status: 200, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

const WT = '/dev/shm/wt-op7/product';
const { llmKeysConfigured } = await import(`${WT}/server/llm.ts`);
const { vertexToken } = await import(`${WT}/server/vertex-token.ts`);
const { reviewBrief, reviewConfigured, BRIEF_REVIEW } = await import(`${WT}/server/modules/agents/review.ts`);
const { getTemplate } = await import(`${WT}/server/modules/agents/templates.ts`);
const { hardFindings } = await import(`${WT}/server/modules/agents/guard.ts`);

const names = Object.keys(process.env).filter(k => k.startsWith('VP_LLM_')).sort();
const purposes = ['operator', 'memory', 'judge', 'learning', 'analysis', 'compile', 'simulate', 'safety_judge', 'brief_review'];
const cfg = structuredClone(getTemplate('appliance-service-followup')!.config);
const r = await reviewBrief(cfg as any);
console.log(JSON.stringify({
  vpLlmNamesSet: names,
  briefReviewOwnVarsSet: names.filter(n => n.startsWith('VP_LLM_BRIEF_REVIEW_')),
  authVarsSet: names.filter(n => n.endsWith('_AUTH')),
  vertex: { VERTEX_SA_FILE_set: 'VERTEX_SA_FILE' in process.env, VERTEX_OFF: process.env.VERTEX_OFF ?? null, tokenSource: vertexToken() === null ? 'null (no Vertex route)' : 'PRESENT' },
  contract: { llm_purpose: BRIEF_REVIEW.llm_purpose, threshold: BRIEF_REVIEW.threshold, timeout_ms: BRIEF_REVIEW.timeout_ms },
  keysConfigured: Object.fromEntries(purposes.map(p => [p, llmKeysConfigured(p)])),
  reviewConfigured: reviewConfigured(),
  templateDoorFindings: hardFindings(cfg as any).length,
  review: { mode: r.mode, label: r.label, reason: r.reason ?? null, modelFindings: r.model.length },
  requests: seen,
  requestModelIsDefaultModel: seen.length === 1 && seen[0].model === process.env.VP_LLM_DEFAULT_MODEL,
  defaultModel: process.env.VP_LLM_DEFAULT_MODEL,
}, null, 1));
