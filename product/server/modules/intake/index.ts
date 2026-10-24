// intake: people in, honestly. Files and webhooks land through one write path (store.ts) that dedupes on
// the number, merges by authority and freshness, appends consent and never clears a suppression or a
// tombstone. Tools: source.*, audience.*, contact.*, consent.record, dpdp.request.execute, policy.retention.*.
// Job: intake.retention (nightly purge of uploaded file text and old receipt row issues).
// Raw routes: POST /v1/uploads/contacts (file parts) and POST /hooks/contacts/:sourceId (signed events).
import type { Module } from '../../app.ts';
import { registerAudienceTools } from './audiences.ts';
import { registerContactTools } from './contacts.ts';
import { registerRetentionTools, retentionJob } from './retention.ts';
import { registerSourceRoutes, registerSourceTools } from './sources.ts';

export const module: Module = {
  name: 'intake',
  register(registry) {
    registerSourceTools(registry);
    registerContactTools(registry);
    registerAudienceTools(registry);
    registerRetentionTools(registry);
  },
  routes(router, deps) {
    registerSourceRoutes(router, deps);
  },
  jobs() {
    return [retentionJob];
  },
};

export { setDndProvider, FakeDndProvider, DisabledDndProvider, type DndProvider } from './dnd.ts';
export { signHook } from './sources.ts';
// For memory's children's-data gate: the canonical age keys intake writes, and the rule that produces them.
export { AGE_KEY_SYNONYMS, canonicalAgeKey, type AgeKey } from './mapping.ts';
// For campaigns' ticket builder: a row's voice and first_message, applied inside the agent's rules (disclosure untouched).
export { rowOverrides, checkVoice, checkFirstMessage, OVERRIDE_KEYS, type OverrideKey } from './overrides.ts';
