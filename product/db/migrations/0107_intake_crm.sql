-- VP schema 0107 (intake): contacts pulled from a connected CRM (HubSpot lists, Zoho CRM views), read only. Each pull is an
-- upload with a receipt on a 'crm' source that remembers what it pulls; a sync re-pulls and imports with the saved mapping.
-- Scheduled sync is off unless set. intake_crm_record keeps one row per CRM record per source, so imports stay
-- idempotent on the CRM's id: an unchanged record is skipped, and a record whose number changed is flagged, not doubled.
ALTER TABLE intake_source ADD COLUMN crm jsonb;                -- { integrationId, kind, listId, listName, fields }
ALTER TABLE intake_source ADD COLUMN sync_every_h integer CHECK (sync_every_h IS NULL OR sync_every_h IN (1, 6, 24));
ALTER TABLE intake_source ADD COLUMN last_synced_at timestamptz;
ALTER TABLE intake_source ADD COLUMN last_sync_error text;

CREATE TABLE intake_crm_record (
  source_id     uuid NOT NULL REFERENCES intake_source(id) ON DELETE CASCADE,
  crm_id        text NOT NULL,
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  e164_hash     text,                    -- HMAC of the number (as tombstones): no personal data kept here
  crm_updated_at text,
  seen_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, crm_id)
);
CREATE INDEX intake_crm_record_ws ON intake_crm_record (workspace_id);
