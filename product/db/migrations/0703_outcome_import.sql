-- Verified outcomes from a file (calls/outcome-import.ts): a business exports results from its own system of record
-- (payments, policy admin, CRM) and uploads them; no developer needed. A preview matches every row to one call before
-- anything is written; committing records each match as a verified outcome. After commit a row keeps only its status
-- and the call it matched: the phone, external id, reference and amount are not kept here (they live on the outcome's
-- evidence, which erasure redacts).
CREATE TABLE IF NOT EXISTS outcome_import (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  file_name     text NOT NULL,
  definition_id uuid NOT NULL REFERENCES outcome_definition(id) ON DELETE CASCADE,
  window_days   integer NOT NULL CHECK (window_days BETWEEN 1 AND 90),
  status        text NOT NULL DEFAULT 'previewed' CHECK (status IN ('previewed','committed')),
  rows          jsonb NOT NULL DEFAULT '[]'::jsonb,
  counts        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  committed_at  timestamptz
);
CREATE INDEX IF NOT EXISTS outcome_import_ws ON outcome_import (workspace_id, created_at DESC);
