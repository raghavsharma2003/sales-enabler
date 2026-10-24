-- VP schema 1002 (workspace module): results leave Vyakti. One SQL door (vp_emit) queues an event for every webhook
-- that listens for it; triggers call it for campaign.state_changed, contact.opted_out and hand_off.created, in the same
-- transaction as the change (a rolled-back change emits nothing). call.ended is queued from calls/analysis.ts through
-- the webhook.emit_call tool. Triggers never raise: a failure to queue must not undo a campaign pause or an opt-out.

ALTER TABLE webhook_endpoint ADD COLUMN IF NOT EXISTS contact_number text NOT NULL DEFAULT 'masked' CHECK (contact_number IN ('masked','full'));
ALTER TABLE webhook_endpoint ADD COLUMN IF NOT EXISTS integration_id uuid REFERENCES integration(id) ON DELETE SET NULL;
ALTER TABLE webhook_delivery ADD COLUMN IF NOT EXISTS dedupe_key text;
-- One delivery per endpoint per event per subject: a call analysed twice still reaches the receiver once.
CREATE UNIQUE INDEX IF NOT EXISTS webhook_delivery_once ON webhook_delivery (endpoint_id, event, dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE OR REPLACE FUNCTION vp_emit(ws uuid, ev text, masked jsonb, whole jsonb DEFAULT NULL, dedupe text DEFAULT NULL) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  INSERT INTO webhook_delivery (workspace_id, endpoint_id, event, payload, dedupe_key)
  SELECT ws, e.id, ev, CASE WHEN e.contact_number = 'full' AND whole IS NOT NULL THEN whole ELSE masked END, dedupe
  FROM webhook_endpoint e
  WHERE e.workspace_id = ws AND e.status = 'active'
    AND ('*' = ANY(e.events) OR ev = ANY(e.events)
         OR EXISTS (SELECT 1 FROM unnest(e.events) p WHERE p LIKE '%.*' AND starts_with(ev, left(p, length(p) - 1))))
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION vp_mask_phone(e164 text) RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT CASE WHEN e164 LIKE '+%' THEN left(e164, 3) || '•••••' || right(e164, 4) ELSE '•••' END $$;

CREATE OR REPLACE FUNCTION vp_initials(n text) RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT CASE WHEN n IS NULL OR btrim(n) = '' THEN NULL
  ELSE (SELECT string_agg(upper(left(w, 1)) || '.', ' ') FROM unnest(string_to_array(btrim(n), ' ')) w WHERE w <> '') END $$;

-- A person as the event shows them: number and name masked, or whole for an endpoint that asked for numbers.
CREATE OR REPLACE FUNCTION vp_contact_json(cid uuid, ws uuid, whole boolean) RETURNS jsonb LANGUAGE sql STABLE AS
$$ SELECT CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id', c.id,
     'phone', CASE WHEN whole THEN c.e164 ELSE vp_mask_phone(c.e164) END,
     'name', CASE WHEN whole THEN c.name ELSE vp_initials(c.name) END, 'language', c.language) END
   FROM (SELECT 1) x LEFT JOIN contact c ON c.id = cid AND c.workspace_id = ws AND c.erased_at IS NULL $$;

CREATE OR REPLACE FUNCTION vp_trg_campaign_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    PERFORM vp_emit(NEW.workspace_id, 'campaign.state_changed', jsonb_build_object('schema', 'vp.campaign.state_changed.v1',
      'workspaceId', NEW.workspace_id, 'campaign', jsonb_build_object('id', NEW.id, 'name', NEW.name, 'category', NEW.call_category),
      'from', OLD.state, 'to', NEW.state, 'cause', NEW.pause_cause, 'at', clock_timestamp()));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS vp_campaign_state ON campaign;
CREATE TRIGGER vp_campaign_state AFTER UPDATE OF state ON campaign FOR EACH ROW WHEN (OLD.state IS DISTINCT FROM NEW.state) EXECUTE FUNCTION vp_trg_campaign_state();

CREATE OR REPLACE FUNCTION vp_trg_opted_out() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    IF NEW.reason ~* 'opt.?out' THEN
      PERFORM vp_emit(NEW.workspace_id, 'contact.opted_out',
        jsonb_build_object('schema', 'vp.contact.opted_out.v1', 'workspaceId', NEW.workspace_id, 'contact', vp_contact_json(NEW.contact_id, NEW.workspace_id, false),
          'suppression', jsonb_build_object('id', NEW.id, 'scope', NEW.scope, 'source', NEW.source), 'at', clock_timestamp()),
        jsonb_build_object('schema', 'vp.contact.opted_out.v1', 'workspaceId', NEW.workspace_id, 'contact', vp_contact_json(NEW.contact_id, NEW.workspace_id, true),
          'suppression', jsonb_build_object('id', NEW.id, 'scope', NEW.scope, 'source', NEW.source), 'at', clock_timestamp()),
        NEW.id::text);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS vp_opted_out ON suppression;
CREATE TRIGGER vp_opted_out AFTER INSERT ON suppression FOR EACH ROW EXECUTE FUNCTION vp_trg_opted_out();

-- A hand-off never carries the brief's summary (words about the call, removed when transcripts are purged); test calls emit nothing.
CREATE OR REPLACE FUNCTION vp_trg_hand_off() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cv record; body jsonb;
BEGIN
  BEGIN
    SELECT id, contact_id, channel, agent_version_id INTO cv FROM conversation WHERE id = NEW.conversation_id AND workspace_id = NEW.workspace_id;
    IF FOUND AND cv.channel <> 'test' THEN
      body := jsonb_build_object('schema', 'vp.hand_off.created.v1', 'workspaceId', NEW.workspace_id,
        'handOff', jsonb_build_object('id', NEW.id, 'mode', NEW.mode, 'destination', NEW.destination, 'status', NEW.status, 'reason', NEW.brief->>'reason'),
        'callId', cv.id, 'at', clock_timestamp());
      PERFORM vp_emit(NEW.workspace_id, 'hand_off.created', body || jsonb_build_object('contact', vp_contact_json(cv.contact_id, NEW.workspace_id, false)),
        body || jsonb_build_object('contact', vp_contact_json(cv.contact_id, NEW.workspace_id, true)), NEW.id::text);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS vp_hand_off ON hand_off;
CREATE TRIGGER vp_hand_off AFTER INSERT ON hand_off FOR EACH ROW EXECUTE FUNCTION vp_trg_hand_off();
