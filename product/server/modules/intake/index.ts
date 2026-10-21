// intake: people in, honestly. Files and webhooks land through one write path (store.ts) that dedupes on
// the number, merges by authority and freshness, appends consent and never clears a suppression or a
// tombstone. Tools: source.*, audience.*, contact.*, consent.record, dpdp.request.execute.
// Raw routes: POST /v1/uploads/contacts (file parts) and POST /hooks/contacts/:sourceId (signed events).
import type { Module } from '../../app.ts';
import { registerAudienceTools } from './audiences.ts';
import { registerContactTools } from './contacts.ts';
import { registerSourceRoutes, registerSourceTools } from './sources.ts';

export const module: Module = {
  name: 'intake',
  register(registry) {
    registerSourceTools(registry);
    registerContactTools(registry);
    registerAudienceTools(registry);
  },
  routes(router, deps) {
    registerSourceRoutes(router, deps);
  },
};

export { setDndProvider, FakeDndProvider, DisabledDndProvider, type DndProvider } from './dnd.ts';
export { signHook } from './sources.ts';
