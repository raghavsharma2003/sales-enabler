-- VP schema 0101 (intake): sources, uploaded files, webhook idempotency, tombstone salts, merges,
-- attribute conflicts for review, and the guards that keep consent append-only and suppression
-- matchable after a person is erased.

-- A source is where people come from: a file kind, an API push, a CRM, a form or WhatsApp opt-ins.
-- Authority and max age are per source (per-column overrides live in the mapping).
CREATE TABLE intake_source (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('csv','tsv','sheet','api_push','crm','form','whatsapp')),
  name          text NOT NULL,
  authority     text NOT NULL DEFAULT 'upload' CHECK (authority IN ('system','crm','upload','agent','person')),
  max_age_s     integer,
  mapping       jsonb,
  hook_secret   text,                      -- HMAC key for /hooks/contacts/:id; move to the vault when it exists
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intake_source_ws ON intake_source (workspace_id);

-- The raw file, received in parts of at most 1 MB (the kernel's body limit), 20 MB in total.
CREATE TABLE intake_upload (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  source_id     uuid REFERENCES intake_source(id) ON DELETE SET NULL,
  receipt_id    uuid REFERENCES source_receipt(id) ON DELETE SET NULL,
  filename      text,
  content       text NOT NULL DEFAULT '',
  bytes         integer NOT NULL DEFAULT 0,
  parts         integer NOT NULL DEFAULT 0,
  last_part_sha text,
  sha256        text,
  status        text NOT NULL DEFAULT 'receiving' CHECK (status IN ('receiving','received','committed')),
  mapping       jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  committed_at  timestamptz
);
CREATE INDEX intake_upload_ws ON intake_upload (workspace_id, created_at DESC);

-- Webhook events are applied once per (source, event id).
CREATE TABLE intake_hook_event (
  source_id     uuid NOT NULL REFERENCES intake_source(id) ON DELETE CASCADE,
  event_id      text NOT NULL,
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  result        jsonb,
  received_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, event_id)
);

-- Per-tenant salt for tombstone and suppression hashes (HMAC-SHA256 of the E.164).
CREATE TABLE intake_salt (
  workspace_id  uuid PRIMARY KEY REFERENCES workspace(id) ON DELETE CASCADE,
  salt          text NOT NULL
);

-- A merge is a reversible link: the merged contact's snapshot is kept for 30 days.
CREATE TABLE intake_merge (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  kept_id       uuid NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  merged_e164   text NOT NULL,
  snapshot      jsonb NOT NULL,
  undo_until    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intake_merge_ws ON intake_merge (workspace_id);

-- Equal authorities from different sources with different values go to review; nothing is combined silently.
CREATE TABLE intake_attribute_conflict (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  contact_id    uuid NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  key           text NOT NULL,
  kept          jsonb NOT NULL,
  incoming      jsonb NOT NULL,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intake_conflict_ws ON intake_attribute_conflict (workspace_id, status);

-- One current value per contact and key; history is in the receipts and the audit chain.
CREATE UNIQUE INDEX attribute_current ON attribute (contact_id, key);
CREATE INDEX cid_phone ON contact_identifier (raw) WHERE kind = 'phone_e164';

ALTER TABLE contact ADD COLUMN erased_at timestamptz;

-- Suppression must still match after the person's number is erased, so it also carries the hash.
ALTER TABLE suppression ADD COLUMN e164_hash text;
CREATE INDEX supp_ws_hash ON suppression (workspace_id, e164_hash);

-- Consent is append-only. A merge may re-point contact_id; nothing else may change. Direct deletes are
-- refused; cascades from deleting a whole workspace (trigger depth > 1) are allowed.
CREATE FUNCTION consent_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() < 2 THEN RAISE EXCEPTION 'consent_record is append-only'; END IF;
    RETURN OLD;
  END IF;
  IF (NEW.workspace_id, NEW.purpose, NEW.channel, NEW.basis, NEW.source, NEW.evidence, NEW.granted, NEW.created_at, NEW.id)
     IS DISTINCT FROM (OLD.workspace_id, OLD.purpose, OLD.channel, OLD.basis, OLD.source, OLD.evidence, OLD.granted, OLD.created_at, OLD.id) THEN
    RAISE EXCEPTION 'consent_record is append-only';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER consent_append_only BEFORE UPDATE OR DELETE ON consent_record FOR EACH ROW EXECUTE FUNCTION consent_append_only();
