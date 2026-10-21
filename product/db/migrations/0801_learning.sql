-- VP schema 0801 (learning module): states the propose/probe/compose loop needs beyond 0005.
-- An experiment waits for its shadow A/A ('aa_pending'), can fail it ('aa_failed') or be stopped by a person
-- ('stopped_manual'). A shadow A/A records which experiment and metric it checked, and what it found.
-- Lessons carry a status and the change they are about, so the tenant library can refuse re-proposals.

ALTER TABLE experiment DROP CONSTRAINT IF EXISTS experiment_state_check;
ALTER TABLE experiment ADD CONSTRAINT experiment_state_check
  CHECK (state IN ('aa_pending','aa_failed','running','stopped_guardrail','stopped_manual','decided','expired'));

ALTER TABLE shadow_aa ADD COLUMN experiment_id uuid REFERENCES experiment(id) ON DELETE CASCADE;
ALTER TABLE shadow_aa ADD COLUMN metric text;
ALTER TABLE shadow_aa ADD COLUMN detail jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE shadow_aa ADD COLUMN passed boolean;

ALTER TABLE lesson ADD COLUMN status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','won','lost','null_result','stopped','rejected','expired'));
ALTER TABLE lesson ADD COLUMN change_hash text;
ALTER TABLE lesson ADD COLUMN proposal_id uuid REFERENCES proposal(id) ON DELETE SET NULL;

ALTER TABLE proposal ADD COLUMN change_hash text;
ALTER TABLE proposal ADD COLUMN rationale text;

CREATE INDEX lesson_agent ON lesson (workspace_id, agent_id, created_at DESC);
CREATE INDEX experiment_agent ON experiment (workspace_id, agent_id, state);
CREATE INDEX conv_version ON conversation (agent_version_id, started_at);
