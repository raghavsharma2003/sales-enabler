-- VP schema 0003: agents, immutable versions, deployments, tools, simulated callers.
-- An edit never publishes: drafts live on agent.draft; publishing writes an immutable
-- agent_version whose config is fully materialised (every default stored, so the record is what runs).

CREATE TABLE agent (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name          text NOT NULL,
  job           text,                       -- industry-neutral job preset, e.g. 'reminder', 'follow_up'
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','live','archived')),
  draft         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_ws ON agent (workspace_id);

CREATE TABLE agent_version (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      uuid NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
  number        integer NOT NULL,
  hash          text NOT NULL,              -- sha256 of the canonical config
  parent_id     uuid REFERENCES agent_version(id) ON DELETE SET NULL,
  author_type   text NOT NULL DEFAULT 'member' CHECK (author_type IN ('member','agent','system')),
  author_id     text,
  note          text,
  config        jsonb NOT NULL,             -- materialised: brief, stack, turn policy, tools, compliance
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, number)
);

-- Where a version runs, and how traffic splits between versions (for tests and reverts).
CREATE TABLE deployment (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  agent_id      uuid NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
  binding       text NOT NULL CHECK (binding IN ('campaign','inbound','web','test')),
  split         jsonb NOT NULL,             -- [{version_id, percent}], sums to 100
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deployment_agent ON deployment (agent_id);

CREATE TABLE tool (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name          text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('http','transfer','end_call','sms','whatsapp','kb_query')),
  stage         text NOT NULL DEFAULT 'in_call' CHECK (stage IN ('pre_call','in_call','post_call')),
  risk_class    text NOT NULL DEFAULT 'read' CHECK (risk_class IN ('read','draft','test','external','spend','destructive','policy')),
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tool_ws ON tool (workspace_id);

-- Simulated callers for tests: a persona, a scenario and hidden pass keys the agent never sees.
CREATE TABLE sim_caller (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  agent_id      uuid REFERENCES agent(id) ON DELETE CASCADE,
  persona       text NOT NULL,
  scenario      text NOT NULL,
  hidden_keys   jsonb NOT NULL DEFAULT '{}'::jsonb,
  pass_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
