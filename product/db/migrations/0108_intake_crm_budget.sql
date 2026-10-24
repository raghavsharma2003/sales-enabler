-- VP schema 0108 (intake): a per-org budget for the Salesforce API calls a contact pull may make. Salesforce caps API calls
-- per org per rolling 24 hours, and the customer's other tools share that cap. A pull checks the budget before it reads a
-- page and stops cleanly (nothing imported) when the budget or the org's own reserve would be passed.
-- integration_id is not a foreign key: integration is created by a later migration (1001). Rows go with the workspace.
CREATE TABLE intake_crm_budget (
  integration_id uuid PRIMARY KEY,
  workspace_id   uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  daily_calls    integer NOT NULL CHECK (daily_calls BETWEEN 10 AND 100000),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- One row per pull: the calls it made, and the org's usage as Salesforce last reported it (Sforce-Limit-Info).
CREATE TABLE intake_crm_api_use (
  id             bigserial PRIMARY KEY,
  integration_id uuid NOT NULL,
  workspace_id   uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  at             timestamptz NOT NULL DEFAULT now(),
  calls          integer NOT NULL CHECK (calls >= 0),
  org_used       integer,
  org_limit      integer
);
CREATE INDEX intake_crm_api_use_recent ON intake_crm_api_use (integration_id, at);
