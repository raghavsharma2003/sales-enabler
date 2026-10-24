-- Agents module: a language variant is an immutable version of the same agent in another primary language (same facts
-- and agenda, possibly another voice stack). Campaigns route contacts who prefer that language to it; it is never the
-- agent's live version, so every "live version" query (kind = 'published') keeps ignoring it.
ALTER TABLE agent_version DROP CONSTRAINT IF EXISTS agent_version_kind_check;
ALTER TABLE agent_version ADD CONSTRAINT agent_version_kind_check CHECK (kind IN ('published', 'candidate', 'variant'));
CREATE INDEX IF NOT EXISTS agent_version_variant ON agent_version (agent_id, number DESC) WHERE kind = 'variant';
