-- Memory from WhatsApp (memory/whatsapp.ts): a fact can come from a message as well as a call. The message is the
-- episode; span holds {messageId, start, end} into its text. No foreign key to channel_message: that table is created by
-- a later migration (1101), and erasure removes facts by contact anyway (forgetContactMemory).
ALTER TABLE memory_fact ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'call' CHECK (channel IN ('call','whatsapp'));
ALTER TABLE memory_fact ADD COLUMN IF NOT EXISTS channel_message_id uuid;

-- How far memory has read each WhatsApp thread, and what the last run did (counts only, never the words).
CREATE TABLE IF NOT EXISTS memory_thread_cursor (
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  thread_id     uuid NOT NULL,
  through_at    timestamptz NOT NULL,
  status        text NOT NULL CHECK (status IN ('done','skipped','failed')),
  reason        text,
  counts        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, thread_id)
);
