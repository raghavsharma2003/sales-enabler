-- Agents module: a version is either published (made from the draft by version.publish: what a campaign, inbound line
-- or memory reads as the agent's live version) or a candidate (made by version.candidate for an experiment arm; it runs
-- only for the contacts an experiment assigns to it). "The newest version" is not "the live version" once candidates exist.
ALTER TABLE agent_version ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'published';
ALTER TABLE agent_version DROP CONSTRAINT IF EXISTS agent_version_kind_check;
ALTER TABLE agent_version ADD CONSTRAINT agent_version_kind_check CHECK (kind IN ('published', 'candidate'));
-- Every experiment's treatment version was made by version.candidate.
UPDATE agent_version SET kind = 'candidate' WHERE id IN (SELECT treatment_version_id FROM experiment WHERE treatment_version_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS agent_version_live ON agent_version (agent_id, number DESC) WHERE kind = 'published';
