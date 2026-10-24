-- VP schema 1101 (channels): the second channel, WhatsApp, on the same contact, consent, meter and log as calls.
-- A connection binds a connected whatsapp_cloud integration (its token and app secret stay in the integrations vault)
-- to one business phone number and a webhook. A thread is one person on one connection: it holds the 24-hour window
-- (the last time they wrote to us) and who answers (the agent or a person). Every message, in or out, is an episode on
-- the contact's one timeline beside their calls. Consent and opt-out stay in consent_record (channel 'whatsapp'): a STOP
-- appends a withdrawal there, so it shows on the contact like any other consent change and imports never undo it.
-- WhatsApp data is the business's alone: nothing here is pooled or trained on across workspaces
-- (rejected.2026-10-17.cross-tenant-pooling).

CREATE TABLE channel_connection (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  channel         text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp')),
  integration_id  uuid NOT NULL REFERENCES integration(id) ON DELETE CASCADE,
  name            text NOT NULL,
  phone_number_id text NOT NULL,                 -- Meta's id for the business number
  waba_id         text,                          -- the WhatsApp Business Account that owns it (templates live there)
  display_number  text,
  verify_token_hash text NOT NULL,               -- sha256 of the token Meta echoes on the GET handshake
  agent_id        uuid REFERENCES agent(id) ON DELETE SET NULL,   -- who answers inbound messages (none = people only)
  webhook_verified_at timestamptz,               -- Meta's GET handshake answered with this connection's token
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','disconnected')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX channel_connection_ws ON channel_connection (workspace_id);
-- One live connection per business number, across every workspace: an inbound event must have exactly one owner.
CREATE UNIQUE INDEX channel_connection_number ON channel_connection (phone_number_id) WHERE status <> 'disconnected';

CREATE TABLE channel_thread (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  connection_id   uuid NOT NULL REFERENCES channel_connection(id) ON DELETE CASCADE,
  contact_id      uuid REFERENCES contact(id) ON DELETE SET NULL,   -- null: a number not on file
  wa_id           text NOT NULL,                                    -- the person's WhatsApp id (digits, country code first)
  last_inbound_at timestamptz,                                      -- opens the 24-hour customer-service window
  last_message_at timestamptz NOT NULL DEFAULT now(),
  mode            text NOT NULL DEFAULT 'agent' CHECK (mode IN ('agent','human')),
  handoff_reason  text,
  handoff_at      timestamptz,
  claimed_by      uuid REFERENCES member(id) ON DELETE SET NULL,
  claimed_at      timestamptz,
  resolved_at     timestamptz,
  opted_out_at    timestamptz,                                      -- STOP from a number not on file (on file: consent_record)
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, wa_id)
);
CREATE INDEX channel_thread_ws ON channel_thread (workspace_id, last_message_at DESC);
CREATE INDEX channel_thread_contact ON channel_thread (contact_id);

CREATE TABLE channel_message (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  connection_id   uuid NOT NULL REFERENCES channel_connection(id) ON DELETE CASCADE,
  thread_id       uuid NOT NULL REFERENCES channel_thread(id) ON DELETE CASCADE,
  contact_id      uuid REFERENCES contact(id) ON DELETE SET NULL,
  direction       text NOT NULL CHECK (direction IN ('inbound','outbound')),
  kind            text NOT NULL CHECK (kind IN ('text','template','other')),
  body            text NOT NULL DEFAULT '',          -- what the person reads (a template rendered with its values)
  template_id     uuid,                              -- set for template sends (the template table arrives in 1102)
  variables       jsonb,
  author          text NOT NULL,                     -- person | agent | member:<id> | system:<what>
  purpose         text,                              -- the consent purpose the send was checked under
  category        text CHECK (category IN ('utility','marketing','authentication','service')),
  conversation_id uuid REFERENCES conversation(id) ON DELETE SET NULL,   -- the call this follows, if any
  provider_id     text,                              -- Meta's message id (wamid)
  status          text NOT NULL CHECK (status IN ('received','blocked','queued','sent','delivered','read','failed','unknown')),
  blocked_by      text[],                            -- every gate reason, when status = 'blocked'
  error           text,
  door            jsonb,                             -- what the reply door did to each sentence
  cost_inr_milli  bigint NOT NULL DEFAULT 0,
  reservation_id  uuid REFERENCES reservation(id) ON DELETE SET NULL,
  reply_state     text CHECK (reply_state IN ('pending','answered','handed_off','skipped')),   -- inbound: has it been answered
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  delivered_at    timestamptz,
  read_at         timestamptz,
  failed_at       timestamptz
);
CREATE INDEX channel_message_thread ON channel_message (thread_id, created_at);
CREATE INDEX channel_message_contact ON channel_message (contact_id, created_at DESC);
CREATE UNIQUE INDEX channel_message_provider ON channel_message (connection_id, provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX channel_message_reply ON channel_message (workspace_id, reply_state) WHERE reply_state = 'pending';

-- Webhook deliveries are applied once (Meta retries for up to 7 days).
CREATE TABLE channel_hook_event (
  connection_id   uuid NOT NULL REFERENCES channel_connection(id) ON DELETE CASCADE,
  event_key       text NOT NULL,
  workspace_id    uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  received_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, event_key)
);

-- What VP pays Meta per message, by category (global, not tenant data; micro-rupees). A new price is a new row.
-- India, effective 2026-10-01 (measure.2026-10-17.whatsapp-india-utility-vs-marketing-message). Service replies inside
-- the customer-service window are free, and so is a utility template sent inside an open window (vendor terms).
CREATE TABLE channel_price (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel         text NOT NULL DEFAULT 'whatsapp',
  category        text NOT NULL CHECK (category IN ('utility','marketing','authentication','service')),
  inr_micro       bigint NOT NULL CHECK (inr_micro >= 0),
  grade           text NOT NULL CHECK (grade IN ('measured','vendor','report')),
  source          text NOT NULL,
  as_of           date NOT NULL,
  active          boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX channel_price_active ON channel_price (channel, category) WHERE active;
INSERT INTO channel_price (category, inr_micro, grade, source, as_of) VALUES
  ('utility', 115000, 'report', 'research/2026-10-17/SYNTHESIS.md (Meta India rate card)', '2026-10-01'),
  ('marketing', 863100, 'report', 'research/2026-10-17/SYNTHESIS.md (Meta India rate card)', '2026-10-01'),
  ('authentication', 115000, 'report', 'research/2026-10-17/SYNTHESIS.md (Meta India rate card; billed as utility)', '2026-10-01'),
  ('service', 0, 'vendor', 'Meta: free-form replies inside the 24-hour customer-service window are not charged', '2026-10-01');

-- The meter records message cost as its own component.
ALTER TABLE cost_line DROP CONSTRAINT IF EXISTS cost_line_component_check;
ALTER TABLE cost_line ADD CONSTRAINT cost_line_component_check
  CHECK (component IN ('telephony','ears','brain','voice','platform','analysis','memory','message'));
