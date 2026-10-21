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
  const last = req.messages[req.messages.length - 1];
  const said = [...req.messages].reverse().find(m => m.role === 'user')?.content.toLowerCase() ?? '';
  if (last.role === 'tool') return reply('Maine jo draft aur test ke steps the, chala diye. Jo cheez paise lagati hai, wo aapke tap ka intezaar kar rahi hai.');
  if (said.includes('top up') || said.includes('topup')) return reply('Wallet top-up ka card bana raha hoon.', [{ id: 'c' + ++n, name: 'wallet_topup', args: JSON.stringify({ inrMilli: 500000 }) }]);
  if (said.includes('plan') || said.includes('csv') || said.includes('launch')) {
    return reply('Plan taiyaar hai: audience main abhi banata hoon; paise wala step aapke tap par.', [{ id: 'c' + ++n, name: 'operator_plan', args: JSON.stringify({ goal: 'Pune ke liye audience banana aur wallet bharna', steps: [
      { tool: 'audience.create', args: { name: 'Pune renewals', filter: { all: [{ key: 'city', op: 'eq', value: 'Pune' }] } }, why: 'sirf Pune ke log' },
      { tool: 'wallet.topup', args: { inrMilli: 500000 }, why: 'campaign ke liye paise: aapke tap par' },
    ] }) }]);
  }
  return reply('Namaste. Main yahan hoon. Aap bataiye: kaunsi calls karwani hain, ya kisi page ka kaam karna hai? Drafts aur tests main khud kar leta hoon; jo logon tak pahunchta hai ya paise lagata hai, wo aapke tap ke baad.');
});
import('../../server/main.ts');
