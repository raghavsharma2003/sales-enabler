// Runs the real control plane (server/main.ts: every module, real tools, real database) with ONE difference: the Operator's model
// is a scripted stand-in, so the chat shows real cards from real tool calls without a network or a key. DEV ONLY; production
// never imports this file.
//   eval $(sh product/scripts/pg-test.sh vp_web_real)
//   VP_SECRET_KEY=$(openssl rand -hex 32) VP_RUNTIME_SECRET=... node --import tsx product/web/dev/serve.ts
import { setFakeLlm, type LlmReply, type LlmRequest } from '../../server/llm.ts';

process.env.VP_OPERATOR_BRAINS ??= 'gemini-3.5-flash-lite,gpt-5.4-mini';
const reply = (text: string, toolCalls: LlmReply['toolCalls'] = []): LlmReply => ({ text, toolCalls, usage: { inputTokens: 220, outputTokens: 40 }, model: 'dev-script', provider: 'dev-script' });
let n = 0;
setFakeLlm((req: LlmRequest) => {
  if (req.purpose === 'learning') {
    // Proposes one change that cites a real call from the evidence the server sent (it refuses changes that cite nothing of its own).
    let ids: string[] = [];
    try { ids = (JSON.parse(req.messages[req.messages.length - 1].content).evidence?.calls ?? []).map((c: { id: string }) => c.id).slice(0, 1); } catch { /* no evidence */ }
    return reply(JSON.stringify({ proposals: [{ kind: 'opening', rationale: 'Callers who are asked about timing first stay on longer. Open by asking if it is a good time.', change: [{ op: 'set', path: 'opening.usefulFirst', value: 'Ask if it is a good time for two minutes before anything else' }], evidenceIds: ids }] }));
  }
  const last = req.messages[req.messages.length - 1];
  const said = [...req.messages].reverse().find(m => m.role === 'user')?.content.toLowerCase() ?? '';
  if (last.role === 'tool') return reply('Maine jo draft aur test ke steps the, chala diye. Jo cheez paise lagati hai, wo aapke tap ka intezaar kar rahi hai.');
  if (said.includes('top up') || said.includes('topup')) return reply('Wallet top-up ka card bana raha hoon.', [{ id: 'c' + ++n, name: 'wallet_topup', args: JSON.stringify({ inrMilli: 500000 }) }]);
  if (said.includes('plan with a bad step')) {
    return reply('Plan taiyaar hai.', [{ id: 'c' + ++n, name: 'operator_plan', args: JSON.stringify({ goal: 'Spending limit set karna', steps: [
      { tool: 'cap.raise', args: { scope: 'workspace', period: 'day', capInrMilli: 2000000 }, why: 'din ka kharcha limit' },
    ] }) }]);
  }
  if (said.includes('for the campaign') || said.includes('fix step')) {
    return reply('Limit ka plan taiyaar hai; paise wala step aapke tap par.', [{ id: 'c' + ++n, name: 'operator_plan', args: JSON.stringify({ goal: 'Spending limit set karna', steps: [
      { tool: 'cap.raise', args: { scope: 'workspace', period: 'daily', capInrMilli: 2000000 }, why: 'din ka kharcha limit: aapke tap par' },
    ] }) }]);
  }
  if (said.includes('plan') || said.includes('csv') || said.includes('launch')) {
    return reply('Plan taiyaar hai: audience main abhi banata hoon; paise wala step aapke tap par.', [{ id: 'c' + ++n, name: 'operator_plan', args: JSON.stringify({ goal: 'Pune ke liye audience banana aur wallet bharna', steps: [
      { tool: 'audience.create', args: { name: 'Pune renewals', filter: { all: [{ key: 'city', op: 'eq', value: 'Pune' }] } }, why: 'sirf Pune ke log' },
      { tool: 'wallet.topup', args: { inrMilli: 500000 }, why: 'campaign ke liye paise: aapke tap par' },
    ] }) }]);
  }
  return reply('Namaste. Main yahan hoon. Aap bataiye: kaunsi calls karwani hain, ya kisi page ka kaam karna hai? Drafts aur tests main khud kar leta hoon; jo logon tak pahunchta hai ya paise lagata hai, wo aapke tap ke baad.');
});
import('../../server/main.ts');

// DEV ONLY: a tiny control port so an e2e flow can set what the fake voice runtime reports about stacks (POST a JSON health body, or null).
import { createServer } from 'node:http';
import { runtime, FakeRuntime } from '../../server/runtime-client.ts';
import { forgetRuntimeHealth } from '../../server/modules/agents/index.ts';
const hook = createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    const rt = runtime();
    if (req.method === 'POST' && rt instanceof FakeRuntime) {
      try { rt.healthReply = JSON.parse(body || 'null'); forgetRuntimeHealth(); res.writeHead(204).end(); } catch { res.writeHead(400).end(); }
    } else res.writeHead(404).end();
  });
});
hook.on('error', e => console.error('health hook not listening:', (e as Error).message));   // never take the dev server down
hook.listen(Number(process.env.HEALTH_HOOK_PORT ?? Number(process.env.PORT ?? 8799) + 1), '127.0.0.1');
