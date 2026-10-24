-- VP schema 0802 (learning module): one automatic learning.propose run per monitor issue, at most.
-- The primary key makes "one proposal per issue" hold across replicas; the rows also carry the daily cap.

CREATE TABLE learning_issue_run (
  issue_id      uuid PRIMARY KEY REFERENCES issue(id) ON DELETE CASCADE,
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  agent_id      uuid REFERENCES agent(id) ON DELETE SET NULL,
  status        text NOT NULL CHECK (status IN ('proposed','no_proposal','skipped_engineering','skipped_no_agent','skipped_daily_cap','failed')),
  proposal_id   uuid REFERENCES proposal(id) ON DELETE SET NULL,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX learning_issue_run_ws_day ON learning_issue_run (workspace_id, created_at DESC);
