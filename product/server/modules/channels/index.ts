// Channels module (11xx): WhatsApp as the second channel on the same contact, consent, reply door, meter and log as
// calls. transport.ts is the seam (verify, parse, send, render); whatsapp.ts the Cloud API transport; graph.ts the Graph
// client (live, off unless VP_WHATSAPP_LIVE=1, or the fake); gate.ts the one gated send site; inbound.ts the webhook.
import type { Module } from '../../app.ts';
import { registerChannelTools } from './tools.ts';
import { registerFollowThroughTools } from './tools-followthrough.ts';
import { inboundHooks, webhook } from './inbound.ts';
import { onTemplateEvent } from './templates.ts';
import { runFollowThrough } from './followthrough.ts';

inboundHooks.template = onTemplateEvent;

export const module: Module = {
  name: 'channels',
  register(r) {
    registerChannelTools(r);
    registerFollowThroughTools(r);
  },
  routes(router, deps) {
    router.add('GET', '/hooks/channels/whatsapp/:id', req => webhook(deps.pool, req, req.params.id));
    router.add('POST', '/hooks/channels/whatsapp/:id', req => webhook(deps.pool, req, req.params.id), { rawBody: true, limit: 3_000_000 });
  },
  jobs() {
    // After calls are analysed: read what callers said about WhatsApp, then each approved follow-through rule.
    return [{ name: 'channels.followthrough', everyMs: 30_000, run: async deps => { await runFollowThrough(deps.pool, null); } }];
  },
};

export { FakeGraph, setGraph } from './graph.ts';
export { signWebhook } from './whatsapp.ts';
export { gatedSend } from './gate.ts';
export { runFollowThrough } from './followthrough.ts';
