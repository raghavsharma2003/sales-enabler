-- VP schema 0005: outcomes, judges, issues, monitors, and the self-learning loop
-- (moments, proposals, experiments, shadow A/A, lessons). Learning is per tenant, never pooled.

CREATE TABLE outcome_definition (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name          text NOT NULL,
  question      text NOT NULL,
  allowed_values text[] NOT NULL,
  verified_by   text,                       -- e.g. 'payment_webhook', 'crm_field', 'paid_list', 'manager'
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outcome (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversation(id) ON DELETE CASCADE,
  contact_id    uuid REFERENCES contact(id) ON DELETE SET NULL,
  definition_id uuid REFERENCES outcome_definition(id) ON DELETE SET NULL,
  value         text NOT NULL,
  grade         text NOT NULL CHECK (grade IN ('verified','manager','ai_guess')),
  source        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outcome_ws ON outcome (workspace_id, created_at DESC);

-- Judges are visible, versioned, pinned; a judge is "trusted" only after calibration.
CREATE TABLE judge_version (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name          text NOT NULL,
  model         text NOT NULL,
  config        jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE calibration (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judge_version_id uuid NOT NULL REFERENCES judge_version(id) ON DELETE CASCADE,
  n             integer NOT NULL,
  agreement     numeric NOT NULL,
  wilson_lower  numeric NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE issue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  category      text NOT NULL,
  severity      text NOT NULL CHECK (severity IN ('critical','warning','info')),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  subject_type  text,
  subject_id    uuid,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);
CREATE INDEX issue_ws ON issue (workspace_id, status, severity);

CREATE TABLE monitor (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name          text NOT NULL,
  config        jsonb NOT NULL,
  enabled       boolean NOT NULL DEFAULT true,
  last_read_at  timestamptz
);

-- A moment is a point in a script where callers leave; hazard carries the interval.
CREATE TABLE moment (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  agent_version_id uuid NOT NULL REFERENCES agent_version(id) ON DELETE CASCADE,
  locus         text NOT NULL,              -- e.g. 'slot:opening', 'turn:2'
  reached       integer NOT NULL DEFAULT 0,
  left_here     integer NOT NULL DEFAULT 0,
  hazard        jsonb,                      -- {ratio, lo, hi, reference}
  flagged       boolean NOT NULL DEFAULT false,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_version_id, locus)
);

-- Propose / probe / compose (harness2-style): a proposal is a drafted change with its evidence,
-- simulated results and how many calls it takes to prove.
CREATE TABLE proposal (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  agent_id      uuid NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
  base_version_id uuid REFERENCES agent_version(id) ON DELETE SET NULL,
  kind          text NOT NULL,              -- 'opening', 'slot', 'turn_timing', 'objection_pack', ...
  change        jsonb NOT NULL,             -- a diff on the brief, as shapes
  evidence      jsonb NOT NULL DEFAULT '{}'::jsonb,
  simulation    jsonb,                      -- probe results on simulated callers
  gates         jsonb,                      -- lint, budget, locked-section, provenance, latency
  calls_to_prove integer,
  status        text NOT NULL DEFAULT 'drafted'
                 CHECK (status IN ('drafted','gated_out','awaiting_approval','testing','promoted','rejected','expired')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX proposal_agent ON proposal (agent_id, status);

CREATE TABLE experiment (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  agent_id      uuid NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
  proposal_id   uuid REFERENCES proposal(id) ON DELETE SET NULL,
  control_version_id uuid REFERENCES agent_version(id) ON DELETE SET NULL,
  treatment_version_id uuid REFERENCES agent_version(id) ON DELETE SET NULL,
  design        jsonb NOT NULL,             -- metric, split, horizon_calls, guardrails, pre-registration
  state         text NOT NULL DEFAULT 'running'
                 CHECK (state IN ('running','stopped_guardrail','decided','expired')),
  result        jsonb,
  started_at    timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz,
  expires_at    timestamptz
);

CREATE TABLE shadow_aa (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  agent_id      uuid NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
  runs          integer NOT NULL,
  false_winners integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lesson (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  agent_id      uuid REFERENCES agent(id) ON DELETE CASCADE,
  text          text NOT NULL,
  evidence      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
