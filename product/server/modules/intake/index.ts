// intake: people in, honestly. Files and webhooks land through one write path (store.ts) that dedupes on
// the number, merges by authority and freshness, appends consent and never clears a suppression or a
// tombstone. Tools: source.*, audience.*, contact.*, consent.record, dpdp.request.execute, policy.retention.*.
// source.crm.* / source.sync*: contacts from a connected HubSpot or Zoho CRM, read only.
// Jobs: intake.retention (nightly purge of uploaded file text and old receipt row issues); intake.crm_sync (timed CRM syncs, off unless set).
// Raw routes: POST /v1/uploads/contacts (file parts) and POST /hooks/contacts/:sourceId (signed events).
import type { Module } from '../../app.ts';
import { registerAudienceTools } from './audiences.ts';
import { registerContactTools } from './contacts.ts';
import { crmSyncJob, registerCrmTools } from './crm-tools.ts';
import { registerSampleTools } from './sample-tools.ts';
import { registerSheetTools } from './sheet-tools.ts';
import { paymentRetentionJob, registerPaymentRoutes, registerPaymentTools } from './payments.ts';
import { registerRetentionTools, retentionJob } from './retention.ts';
import { registerSourceRoutes, registerSourceTools } from './sources.ts';

export const module: Module = {
  name: 'intake',
  register(registry) {
    registerSourceTools(registry);
    registerContactTools(registry);
    registerAudienceTools(registry);
    registerRetentionTools(registry);
    registerCrmTools(registry);
    registerSampleTools(registry);
    registerSheetTools(registry);
    registerPaymentTools(registry);
  },
  routes(router, deps) {
    registerSourceRoutes(router, deps);
    registerPaymentRoutes(router, deps);
  },
  jobs() {
    return [retentionJob, crmSyncJob, paymentRetentionJob];
  },
};

export { setDndProvider, FakeDndProvider, DisabledDndProvider, type DndProvider } from './dnd.ts';
export { signHook } from './sources.ts';
// For memory's children's-data gate: the canonical age keys intake writes, and the rule that produces them.
export { AGE_KEY_SYNONYMS, canonicalAgeKey, type AgeKey } from './mapping.ts';
// For campaigns' ticket builder: a row's voice and first_message, applied inside the agent's rules (disclosure untouched).
export { rowOverrides, checkVoice, checkFirstMessage, OVERRIDE_KEYS, type OverrideKey } from './overrides.ts';
// For campaigns' dial gate (G4, 'already_paid'): did this person pay after their record was last imported?
export { paidSinceImport } from './payments.ts';
