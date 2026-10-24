-- Results out: what leaves Vyakti when a call ends, a campaign changes state, a person opts out or a hand-off is made.
--
-- webhook_delivery.build names the record built AT SEND TIME from `payload` (which then holds only ids). The full record
-- (contact number, transcript, recording link) is never stored here: a delivery list stays free of personal data, an
-- erasure or the transcripts retention that lands before a send or a replay is respected, and the recording link is
-- signed fresh for each send. dedupe_key makes an event's delivery to one endpoint happen once (a call analysed twice
-- by the queue and the sweep still sends one call.ended). A replay has no key.
ALTER TABLE webhook_delivery ADD COLUMN IF NOT EXISTS build text CHECK (build IN ('call.v1','contact_opt_out.v1','hand_off.v1','test.v1'));
ALTER TABLE webhook_delivery ADD COLUMN IF NOT EXISTS dedupe_key text;
ALTER TABLE webhook_delivery ADD COLUMN IF NOT EXISTS test boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS webhook_delivery_dedupe ON webhook_delivery (endpoint_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- Per endpoint: whether contact numbers go out in full or masked (+91•••••1234), and an optional custom HTTP integration
-- whose bearer token is sent as Authorization on every delivery (the signature header is sent either way).
ALTER TABLE webhook_endpoint ADD COLUMN IF NOT EXISTS contact_number text NOT NULL DEFAULT 'masked' CHECK (contact_number IN ('masked','full'));
ALTER TABLE webhook_endpoint ADD COLUMN IF NOT EXISTS auth_integration_id uuid REFERENCES integration(id) ON DELETE SET NULL;

-- Events other modules cause, captured in the same transaction as the change (a transactional outbox), so no code path
-- that changes a campaign's state, adds a suppression or makes a hand-off can forget to announce it. The workspace
-- module fans each row out to the endpoints that listen (webhooks.ts fanOut), once.
CREATE TABLE webhook_outbox (
  id            bigserial PRIMARY KEY,
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  event         text NOT NULL,
  build         text,
  data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  fanned_at     timestamptz
);
CREATE INDEX webhook_outbox_due ON webhook_outbox (id) WHERE fanned_at IS NULL;

CREATE FUNCTION webhook_outbox_campaign() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO webhook_outbox (workspace_id, event, data) VALUES (NEW.workspace_id, 'campaign.state_changed',
    jsonb_build_object('campaignId', NEW.id, 'name', NEW.name, 'from', OLD.state, 'to', NEW.state, 'cause', NEW.pause_cause, 'at', to_jsonb(clock_timestamp())));
  RETURN NULL;
END $$;
CREATE TRIGGER campaign_state_outbox AFTER UPDATE OF state ON campaign
  FOR EACH ROW WHEN (OLD.state IS DISTINCT FROM NEW.state) EXECUTE FUNCTION webhook_outbox_campaign();

-- A new suppression is an opt-out, whichever way it came (said on a call, marked in an imported file, added by staff).
-- An erasure's suppression is not announced: the person asked for their data to go, not to travel further.
CREATE FUNCTION webhook_outbox_suppression() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.reason = 'erased' THEN RETURN NULL; END IF;
  INSERT INTO webhook_outbox (workspace_id, event, build, data) VALUES (NEW.workspace_id, 'contact.opted_out', 'contact_opt_out.v1',
    jsonb_build_object('suppressionId', NEW.id));
  RETURN NULL;
END $$;
CREATE TRIGGER suppression_outbox AFTER INSERT ON suppression FOR EACH ROW EXECUTE FUNCTION webhook_outbox_suppression();

-- A hand-off on a test call is never announced.
CREATE FUNCTION webhook_outbox_hand_off() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.conversation_id IS NOT NULL AND EXISTS (SELECT 1 FROM conversation c WHERE c.id = NEW.conversation_id
      AND (c.channel = 'test' OR coalesce(c.run_manifest->>'test', 'false') = 'true')) THEN RETURN NULL; END IF;
  INSERT INTO webhook_outbox (workspace_id, event, build, data) VALUES (NEW.workspace_id, 'hand_off.created', 'hand_off.v1',
    jsonb_build_object('handOffId', NEW.id));
  RETURN NULL;
END $$;
CREATE TRIGGER hand_off_outbox AFTER INSERT ON hand_off FOR EACH ROW EXECUTE FUNCTION webhook_outbox_hand_off();

-- call.export: an approved export of the calls list for a filter. The file is not stored: each download streams it from
-- the database at that moment (suppressed and erased people left out as of then), for 24 hours, each download audited.
CREATE TABLE call_export (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  filters       jsonb NOT NULL,
  requested_by  text,
  approved_by   uuid,
  downloads     integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);
CREATE INDEX call_export_ws ON call_export (workspace_id, created_at DESC);
