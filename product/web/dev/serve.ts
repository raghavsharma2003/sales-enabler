// Dev server: the real kernel + the real Operator and Memory modules + the stand-in tools in mock-module.ts + web/dist.
//   eval $(sh product/scripts/pg-test.sh vp_mod_web); node product/web/build.mjs; node --import tsx product/web/dev/serve.ts
// DEV ONLY: server/main.ts must never import this file or mock-module.ts. The Operator's model is a scripted fake (below),
// so the chat shows real cards from real tool calls without a network or a key.
import { fileURLToPath } from 'node:url';
import { buildApp, type Module } from '../../server/app.ts';
import { createPool } from '../../server/db.ts';
import { setFakeLlm, type LlmRequest, type LlmReply } from '../../server/llm.ts';
import { module as operator } from '../../server/modules/operator/index.ts';
import { module as memory } from '../../server/modules/memory/index.ts';
import { mockModule } from './mock-module.ts';

process.env.VP_OPERATOR_BRAINS ??= 'gemini-3.5-flash-lite,gpt-5.4-mini,sarvam-105b';

const reply = (text: string, toolCalls: LlmReply['toolCalls'] = []): LlmReply => ({ text, toolCalls, usage: { inputTokens: 220, outputTokens: 40 }, model: 'dev-script', provider: 'dev-script' });
let n = 0;
setFakeLlm((req: LlmRequest) => {
  const last = req.messages[req.messages.length - 1];
  const userMsg = [...req.messages].reverse().find(m => m.role === 'user')?.content.toLowerCase() ?? '';
  if (last.role === 'tool') {
    if (userMsg.includes('launch') || userMsg.includes('shuru')) return reply('Launch card taiyaar hai. Isme kaun, kab aur kitna kharcha hoga sab dikh raha hai. Aapke hold karne ke baad hi calls shuru hongi.');
    return reply('Maine plan ke steps chala diye. Jo cheez logon tak pahunchti hai, wo aapke tap ka intezaar kar rahi hai.');
  }
  if (userMsg.includes('launch') || userMsg.includes('shuru')) {
    return reply('Appointment reminders ka launch card bana raha hoon.', [{ id: 'c' + ++n, name: 'campaign_launch', args: JSON.stringify({ id: 'cmp_appt' }) }]);
  }
  if (userMsg.includes('csv') || userMsg.includes('import') || userMsg.includes('reminder')) {
    return reply('Plan taiyaar hai: list, audience, agent ka test aur estimate main karta hoon; launch aapke tap par.', [{ id: 'c' + ++n, name: 'operator_plan', args: JSON.stringify({ goal: 'Renewal reminders ek list par chalana', steps: [
      { tool: 'contact.import_commit', args: { source: 'renewals.csv', consentBasis: 'existing_customer' }, why: 'list padhna aur sahi karna' },
      { tool: 'audience.create', args: { name: 'Renewals Oct', filter: 'imported:renewals.csv' }, why: 'audience banana' },
      { tool: 'test.simulate', args: { agentId: 'a_renew' }, why: 'chhe nakli callers ke saath test' },
      { tool: 'campaign.estimate', args: { agentId: 'a_renew', audienceId: 'aud_renew' }, why: 'kharcha pata karna' },
      { tool: 'campaign.launch', args: { id: 'cmp_appt' }, why: 'launch: aapke tap par' },
    ] }) }]);
  }
  return reply('Namaste. Main yahan hoon. Aap bataiye: kaunsi calls karwani hain, ya kisi page ka kaam karna hai? Main drafts aur tests khud kar leta hoon; launch aur kharcha aapke tap ke baad.');
});

const mods: Module[] = [operator, memory, mockModule];   // mock last: it skips any tool a real module already registered
const pool = createPool();
const webRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const { server } = buildApp(pool, mods, { webRoot });
const port = Number(process.env.PORT ?? 8787);
server.listen(port, () => console.log(`[vp-web-dev] http://localhost:${port}  (stand-in tools: sample data only)`));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { server.close(); void pool.end(); });
