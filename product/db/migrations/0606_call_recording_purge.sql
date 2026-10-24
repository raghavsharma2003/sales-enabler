-- A recording deleted on the voice runtime (calls.recording_purge): when, and why. recording_uri is cleared in the same
-- update, and only after the runtime confirmed the file is gone, so a purge that failed is tried again on the next run.
ALTER TABLE conversation ADD COLUMN recording_purged_at timestamptz;
ALTER TABLE conversation ADD COLUMN recording_purge_reason text CHECK (recording_purge_reason IN ('retention','erased'));
CREATE INDEX conversation_recording_live ON conversation (workspace_id, ended_at) WHERE recording_uri IS NOT NULL;
