// Runs the real control plane (server/main.ts: every module, real tools, real database) with ONE difference: the Operator's model
// is a scripted stand-in, so the chat shows real cards from real tool calls without a network or a key. DEV ONLY; production
// never imports this file.
//   eval $(sh product/scripts/pg-test.sh vp_web_real)
//   VP_SECRET_KEY=$(openssl rand -hex 32) VP_RUNTIME_SECRET=... node --import tsx product/web/dev/serve.ts
import { setFakeLlm, type LlmReply, type LlmRequest } from '../../server/llm.ts';
import { sampleAnalysis } from './sample-analysis.ts';   // throws at load with NODE_ENV=production, before anything below runs

if (process.env.NODE_ENV === 'production') throw new Error('web/dev/serve.ts is the development server and never runs with NODE_ENV=production');

process.env.VP_OPERATOR_BRAINS ??= 'gemini-3.5-flash-lite,gpt-5.4-mini';
const reply = (text: string, toolCalls: LlmReply['toolCalls'] = []): LlmReply => ({ text, toolCalls, usage: { inputTokens: 220, outputTokens: 40 }, model: 'dev-script', provider: 'dev-script' });
let n = 0;
setFakeLlm((req: LlmRequest) => {
  // DEV ONLY: seeded calls get a finished, clearly labelled sample analysis ("Sample analysis (dev only)").
  if (req.purpose === 'analysis') return sampleAnalysis(req);
  if (req.purpose === 'learning') {
    // Proposes one change that cites a real call from the evidence the server sent (it refuses changes that cite nothing of its own).
    let ids: string[] = [];
    try { ids = (JSON.parse(req.messages[req.messages.length - 1].content).evidence?.calls ?? []).map((c: { id: string }) => c.id).slice(0, 1); } catch { /* no evidence */ }
    return reply(JSON.stringify({ proposals: [{ kind: 'opening', rationale: 'Callers who are asked about timing first stay on longer. Open by asking if it is a good time.', change: [{ op: 'set', path: 'opening.usefulFirst', value: 'Ask if it is a good time for two minutes before anything else' }], evidenceIds: ids }] }));
  }
  const last = req.messages[req.messages.length - 1];
  const said = [...req.messages].reverse().find(m => m.role === 'user')?.content.toLowerCase() ?? '';
  if (last.role === 'tool') return reply('I ran the draft and test steps myself. The step that spends money is waiting for your approval.');
  if (said.includes('top up') || said.includes('topup')) return reply('I have prepared the wallet top-up for your approval.', [{ id: 'c' + ++n, name: 'wallet_topup', args: JSON.stringify({ inrMilli: 500000 }) }]);
  if (said.includes('plan with a bad step')) {
    return reply('The plan is ready.', [{ id: 'c' + ++n, name: 'operator_plan', args: JSON.stringify({ goal: 'Set a spending limit', steps: [
      { tool: 'cap.raise', args: { scope: 'workspace', period: 'day', capInrMilli: 2000000 }, why: 'daily spending limit' },
    ] }) }]);
  }
  if (said.includes('for the campaign') || said.includes('fix step')) {
    return reply('The plan is ready. The step that spends money waits for your approval.', [{ id: 'c' + ++n, name: 'operator_plan', args: JSON.stringify({ goal: 'Set a spending limit', steps: [
      { tool: 'cap.raise', args: { scope: 'workspace', period: 'daily', capInrMilli: 2000000 }, why: 'daily spending limit, waits for your approval' },
    ] }) }]);
  }
  if (said.includes('plan') || said.includes('csv') || said.includes('launch')) {
    return reply('The plan is ready. I will create the audience now; the step that spends money waits for your approval.', [{ id: 'c' + ++n, name: 'operator_plan', args: JSON.stringify({ goal: 'Create a Pune audience and top up the wallet', steps: [
      { tool: 'audience.create', args: { name: 'Pune renewals', filter: { all: [{ key: 'city', op: 'eq', value: 'Pune' }] } }, why: 'only people in Pune' },
      { tool: 'wallet.topup', args: { inrMilli: 500000 }, why: 'funds for the campaign, waits for your approval' },
    ] }) }]);
  }
  return reply('I can help with this page or with anything else you need done. I prepare drafts and tests myself; anything that reaches people or spends money waits for your approval.');
});
// DEV ONLY: with VP_DEVSIM_URL (python -m vpvoice.devsim: the real voice runtime on fake providers), browser test calls go
// to that runtime, so "Call me in the browser" runs end to end; every other ticket and the stack health stay on the fake
// runtime (the stack-health flows set what it reports through the hook below).
if (process.env.VP_DEVSIM_URL) {
  const devsim = new HttpRuntime(process.env.VP_DEVSIM_URL);
  class DevRuntime extends FakeRuntime {
    private viaDevsim = new Set<string>();
    async start(ticket: CallTicket) {
      if (ticket.transport.kind !== 'webrtc') return super.start(ticket);
      this.viaDevsim.add(ticket.conversationId);
      return devsim.start(ticket);
    }
    async control(id: string, action: string, body?: Record<string, unknown>) {
      return this.viaDevsim.has(id) ? devsim.control(id, action, body) : super.control(id, action, body);
    }
  }
  setRuntime(new DevRuntime());
}
import('../../server/main.ts');

// DEV ONLY: a tiny control port so an e2e flow can set what the fake voice runtime reports about stacks (POST a JSON health body, or null).
import { createServer } from 'node:http';
import { runtime, FakeRuntime, HttpRuntime, setRuntime } from '../../server/runtime-client.ts';
import type { CallTicket } from '../../shared/runtime-protocol.ts';
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
hook.unref();   // the hook must never keep the process alive: the server's own shutdown waits for the event loop to empty
