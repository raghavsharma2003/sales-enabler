-- Agents module: archive and restore, never delete. An archived agent keeps its versions, tests and calls; it is out of
-- the agent list and takes no edits, publishes or calls until it is restored to the status it had.
ALTER TABLE agent ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE agent ADD COLUMN IF NOT EXISTS archived_from text;
ALTER TABLE agent ADD COLUMN IF NOT EXISTS archived_by text;
ALTER TABLE agent ADD COLUMN IF NOT EXISTS archive_reason text;
