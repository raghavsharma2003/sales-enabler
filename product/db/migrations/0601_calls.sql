-- Calls module (06xx): runtime event ingest, per-call evidence, analysis, outcomes, judges, issues, reports.
-- The runtime may retry a batch, so every event is recorded once by (conversation_id, seq) in the same
-- transaction as its effects. Per-call moments live here, not in `moment` (that table is learning's
-- per-version locus hazard).

CREATE TABLE runtime_event_seen (
  conversation_id uuid NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  seq           integer NOT NULL,
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  type          text NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, seq)
);

ALTER TABLE conversation ADD COLUMN IF NOT EXISTS duration_s integer;
ALTER TABLE conversation ADD COLUMN IF NOT EXISTS cost_inr_milli bigint NOT NULL DEFAULT 0;
ALTER TABLE conversation ADD COLUMN IF NOT EXISTS late_cost_inr_milli bigint NOT NULL DEFAULT 0;
ALTER TABLE conversation ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT false;
ALTER TABLE conversation ADD COLUMN IF NOT EXISTS flags text[] NOT NULL DEFAULT '{}';
ALTER TABLE conversation ADD COLUMN IF NOT EXISTS settlement jsonb;       -- {reservationId, action: settled|released|none, inrMilli}
CREATE INDEX IF NOT EXISTS conv_ws_flagged ON conversation (workspace_id, flagged) WHERE flagged;
CREATE INDEX IF NOT EXISTS conv_ws_reason ON conversation (workspace_id, reason_code);

CREATE TABLE call_moment (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  source        text NOT NULL CHECK (source IN ('runtime','analysis')),
  kind          text NOT NULL,
  at_ms         integer,
  note          text,
  quote         text,                        -- analysis moments: an exact substring of the transcript
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX call_moment_conv ON call_moment (conversation_id);

CREATE TABLE call_safety_event (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  seq           integer NOT NULL,
  rule          text NOT NULL,
  action        text NOT NULL,
  detail        text NOT NULL,
  at            timestamptz NOT NULL
);
CREATE INDEX call_safety_conv ON call_safety_event (conversation_id);

CREATE TABLE call_tool_event (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  seq           integer NOT NULL,
  name          text NOT NULL,
  args          jsonb NOT NULL DEFAULT '{}'::jsonb,
  status        text NOT NULL CHECK (status IN ('requested','done','failed')),
  at            timestamptz NOT NULL
);
CREATE INDEX call_tool_conv ON call_tool_event (conversation_id);

-- An opt-out heard on a call must reach suppression even if the contacts module is not loaded yet.
CREATE TABLE call_opt_out (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  contact_id    uuid REFERENCES contact(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','failed','no_contact')),
  detail        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id)
);

-- Which outcome values count as the goal for the funnel's last stage.
ALTER TABLE outcome_definition ADD COLUMN IF NOT EXISTS goal_values text[] NOT NULL DEFAULT '{}';
ALTER TABLE outcome_definition ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE outcome ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '{}'::jsonb;  -- {quote} or {key:{source,ref}}
ALTER TABLE outcome ADD COLUMN IF NOT EXISTS judge_version_id uuid REFERENCES judge_version(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS outcome_conv ON outcome (conversation_id, grade);

ALTER TABLE judge_version ADD COLUMN IF NOT EXISTS outcome_definition_id uuid REFERENCES outcome_definition(id) ON DELETE CASCADE;
ALTER TABLE judge_version ADD COLUMN IF NOT EXISTS number integer NOT NULL DEFAULT 1;
ALTER TABLE calibration ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspace(id) ON DELETE CASCADE;
ALTER TABLE calibration ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE calibration ADD COLUMN IF NOT EXISTS confusion jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE issue ADD COLUMN IF NOT EXISTS monitor_id uuid REFERENCES monitor(id) ON DELETE SET NULL;
ALTER TABLE issue ADD COLUMN IF NOT EXISTS resolution text;
CREATE INDEX IF NOT EXISTS issue_monitor_open ON issue (monitor_id) WHERE status <> 'resolved';

CREATE TABLE call_report (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  title         text NOT NULL,
  scope         jsonb NOT NULL,              -- {campaignId?, from?, to?}
  content       jsonb NOT NULL,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX call_report_ws ON call_report (workspace_id, created_at DESC);
