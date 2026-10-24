-- Hand-offs that land (must-be brief 6, the calls half): a queue people can claim, a callback task due at the time the
-- caller stated, and an in-app alert to on-duty members for a crisis hand-off.
ALTER TABLE hand_off ADD COLUMN reason text;                   -- the runtime's reason: crisis, asks_for_human, complaint, takeover, ...
ALTER TABLE hand_off ADD COLUMN target_kind text CHECK (target_kind IN ('phone','queue','callback','member','other'));
ALTER TABLE hand_off ADD COLUMN due_at timestamptz;            -- a callback: when the caller asked to be called (else as soon as possible)
ALTER TABLE hand_off ADD COLUMN due_stated text;               -- the caller's own words for that time, when they said one
ALTER TABLE hand_off ADD COLUMN claimed_by uuid REFERENCES member(id) ON DELETE SET NULL;
ALTER TABLE hand_off ADD COLUMN claimed_at timestamptz;
ALTER TABLE hand_off ADD COLUMN resolved_at timestamptz;
ALTER TABLE hand_off ADD COLUMN resolution text CHECK (resolution IN ('reached','no_answer','not_needed'));
ALTER TABLE hand_off DROP CONSTRAINT IF EXISTS hand_off_status_check;
ALTER TABLE hand_off ADD CONSTRAINT hand_off_status_check CHECK (status IN ('queued','claimed','connected','missed','done'));
CREATE INDEX hand_off_open ON hand_off (workspace_id, status, created_at) WHERE status IN ('queued','claimed');

-- In-app alerts for members (a crisis hand-off today; others later). Written in the same transaction as the event that
-- raises them, so they exist the moment ingest commits; the web shell polls every 5 s.
CREATE TABLE member_alert (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  member_id     uuid NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('crisis_hand_off')),
  hand_off_id   uuid REFERENCES hand_off(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversation(id) ON DELETE CASCADE,
  text          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  acked_at      timestamptz,
  UNIQUE (member_id, hand_off_id)
);
CREATE INDEX member_alert_open ON member_alert (member_id, created_at) WHERE acked_at IS NULL;
