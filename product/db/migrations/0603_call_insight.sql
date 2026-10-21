-- Cross-call insight: themes across a workspace's recent analysed calls (per agent, per campaign or the whole
-- workspace). Every kept theme carries verbatim quotes checked against stored transcripts; test calls never enter.
CREATE TABLE call_insight (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  scope_type    text NOT NULL CHECK (scope_type IN ('workspace','agent','campaign')),
  scope_id      uuid,                         -- null for the workspace scope
  status        text NOT NULL CHECK (status IN ('done','failed','not_configured','no_calls')),
  themes        jsonb NOT NULL DEFAULT '[]'::jsonb,
  calls_sampled integer NOT NULL DEFAULT 0,   -- calls whose words the model saw
  calls_in_scope integer NOT NULL DEFAULT 0,  -- analysed non-test calls available in the window
  newest_call_at timestamptz,                 -- ended_at of the newest call considered; a run with nothing newer is skipped
  quotes_proposed integer NOT NULL DEFAULT 0,
  quotes_dropped integer NOT NULL DEFAULT 0,
  themes_dropped integer NOT NULL DEFAULT 0,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {reason, model, usage, caps}
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX call_insight_scope ON call_insight (workspace_id, scope_type, scope_id, created_at DESC);
