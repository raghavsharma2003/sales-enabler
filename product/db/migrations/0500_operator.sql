-- Operator (the "Talk to VP" chat): messages carry their workspace so every read filters by tenant
-- without a join; per-workspace Operator settings (autonomy can only be lowered below the code ceiling,
-- the chosen brain); presentation preferences the client asked VP to remember, each with its source
-- message, forgettable. Preferences never hold configuration or permissions (workspace.md §12).

ALTER TABLE message ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspace(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS message_ws_thread ON message (workspace_id, thread_id, created_at);

ALTER TABLE thread ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS thread_ws_updated ON thread (workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS operator_setting (
  workspace_id  uuid PRIMARY KEY REFERENCES workspace(id) ON DELETE CASCADE,
  autonomy      text NOT NULL DEFAULT 'A1' CHECK (autonomy IN ('A0','A1')),   -- A0: drafts and tests wait for a tap too
  brain         text,                                                          -- a curated brain id; null = deployment default
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS operator_preference (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  member_id     uuid REFERENCES member(id) ON DELETE CASCADE,
  text          text NOT NULL,
  source_message_id uuid REFERENCES message(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  forgotten_at  timestamptz
);
CREATE INDEX IF NOT EXISTS operator_preference_ws ON operator_preference (workspace_id, member_id) WHERE forgotten_at IS NULL;
