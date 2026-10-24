-- Transcript retention and erasure (memory/transcript-purge.ts). The words go; the call's metrics stay: turn rows keep
-- their timing and latency with the text blanked, conversation keeps outcome, durations and costs (cost_line cascades on
-- a deleted conversation, so deleting rows would break billing and the audit's object ids). When and why is recorded so
-- the call page can say it.
ALTER TABLE conversation ADD COLUMN IF NOT EXISTS transcript_purged_at timestamptz;
ALTER TABLE conversation ADD COLUMN IF NOT EXISTS transcript_purge_reason text CHECK (transcript_purge_reason IN ('retention','erased'));
CREATE INDEX IF NOT EXISTS conversation_transcript_live ON conversation (workspace_id, ended_at) WHERE transcript_purged_at IS NULL;

-- A recording delete the runtime has not confirmed is a pending erasure, never silent: tries, last try, last error.
ALTER TABLE conversation ADD COLUMN IF NOT EXISTS recording_purge_tries integer NOT NULL DEFAULT 0;
ALTER TABLE conversation ADD COLUMN IF NOT EXISTS recording_purge_tried_at timestamptz;
ALTER TABLE conversation ADD COLUMN IF NOT EXISTS recording_purge_error text;
