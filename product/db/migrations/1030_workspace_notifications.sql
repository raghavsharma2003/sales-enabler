-- Notifications that reach people: Slack and email destinations, each choosing which events it gets (a crisis, a
-- hand-off, a campaign that paused itself, a low wallet). They are driven by the same outbox as webhooks
-- (1020_workspace_results_out.sql). notified_at is the notifications fan-out's own mark, separate from the webhooks' fanned_at.
ALTER TABLE webhook_outbox ADD COLUMN IF NOT EXISTS notified_at timestamptz;
CREATE INDEX IF NOT EXISTS webhook_outbox_notify_due ON webhook_outbox (id) WHERE notified_at IS NULL;

-- A hand-off's reason travels with the event, so a crisis can be told apart without a read (the crisis path is the urgent one).
CREATE OR REPLACE FUNCTION webhook_outbox_hand_off() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.conversation_id IS NOT NULL AND EXISTS (SELECT 1 FROM conversation c WHERE c.id = NEW.conversation_id
      AND (c.channel = 'test' OR coalesce(c.run_manifest->>'test', 'false') = 'true')) THEN RETURN NULL; END IF;
  INSERT INTO webhook_outbox (workspace_id, event, build, data) VALUES (NEW.workspace_id, 'hand_off.created', 'hand_off.v1',
    jsonb_build_object('handOffId', NEW.id, 'conversationId', NEW.conversation_id, 'reason', coalesce(NEW.reason, NEW.brief->>'reason')));
  RETURN NULL;
END $$;

-- The wallet moving into low, empty or overdrawn (and from one of those to a worse one) is an event.
CREATE FUNCTION webhook_outbox_wallet() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO webhook_outbox (workspace_id, event, data) VALUES (NEW.workspace_id, 'wallet.low',
    jsonb_build_object('from', OLD.state, 'to', NEW.state, 'balanceInrMilli', NEW.balance_inr_milli, 'at', to_jsonb(clock_timestamp())));
  RETURN NULL;
END $$;
CREATE TRIGGER wallet_low_outbox AFTER UPDATE OF state, balance_inr_milli ON wallet
  FOR EACH ROW WHEN (OLD.state IS DISTINCT FROM NEW.state AND NEW.state IN ('low','empty','overdrawn')) EXECUTE FUNCTION webhook_outbox_wallet();

-- Wake the sender at once when an event is written (it also runs on a timer): a crisis reaches people in seconds, not
-- at the next poll. NOTIFY is delivered on commit, so a rolled-back event never wakes anyone.
CREATE FUNCTION webhook_outbox_wake() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('vp_outbox', NEW.workspace_id::text);
  RETURN NULL;
END $$;
CREATE TRIGGER webhook_outbox_wake AFTER INSERT ON webhook_outbox FOR EACH ROW EXECUTE FUNCTION webhook_outbox_wake();

CREATE TABLE notification_destination (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('slack','email')),
  name          text NOT NULL,
  integration_id uuid REFERENCES integration(id) ON DELETE SET NULL,   -- slack: the integration holding the incoming-webhook URL
  recipients    text[] NOT NULL DEFAULT '{}',                           -- email: addresses; empty means the on-duty members
  events        text[] NOT NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX notification_destination_ws ON notification_destination (workspace_id, status);

CREATE TABLE notification_delivery (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  destination_id uuid NOT NULL REFERENCES notification_destination(id) ON DELETE CASCADE,
  event         text NOT NULL,                      -- crisis | hand_off | campaign.paused | wallet.low
  outbox_id     bigint,                             -- null for a test message
  data          jsonb NOT NULL DEFAULT '{}'::jsonb, -- ids and codes only; the words are made when it is sent
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  attempts      integer NOT NULL DEFAULT 0,
  error         text,
  test          boolean NOT NULL DEFAULT false,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  sent_at       timestamptz
);
CREATE UNIQUE INDEX notification_delivery_once ON notification_delivery (destination_id, outbox_id) WHERE outbox_id IS NOT NULL;
CREATE INDEX notification_delivery_due ON notification_delivery (status, next_attempt_at);
CREATE INDEX notification_delivery_ws ON notification_delivery (workspace_id, created_at DESC);
