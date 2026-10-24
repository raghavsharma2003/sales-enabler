-- VP schema 0804 (learning module): one automatic objection-note run per recurring objection theme per agent, at most.
-- theme_key is a hash of the theme's normalised title, so the same objection named again by a later insight is not
-- drafted twice. The rows also count toward the daily cap shared with learning_issue_run.
CREATE TABLE IF NOT EXISTS learning_theme_run (
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  agent_id      uuid NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
  theme_key     text NOT NULL,
  title         text NOT NULL,
  insight_id    uuid REFERENCES call_insight(id) ON DELETE SET NULL,
  status        text NOT NULL CHECK (status IN ('proposed','no_proposal','already_answered','failed')),
  proposal_id   uuid REFERENCES proposal(id) ON DELETE SET NULL,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, agent_id, theme_key)
);
CREATE INDEX IF NOT EXISTS learning_theme_run_ws_day ON learning_theme_run (workspace_id, created_at DESC);
