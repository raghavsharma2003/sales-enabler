-- Inbound calls (must-be brief 8, the control-plane half). A workspace number is bound to a published agent version
-- (and optionally an inbound deployment, whose split then picks the version); POST /hooks/telephony/inbound answers it.
ALTER TABLE inbound_route ADD COLUMN agent_version_id uuid REFERENCES agent_version(id) ON DELETE SET NULL;
ALTER TABLE inbound_route ADD COLUMN created_by text;
ALTER TABLE inbound_route ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX inbound_route_number ON inbound_route (number_id);

-- An inbound conversation: the carrier's call id (a retried webhook answers the same call, never a second one), the
-- number that was called, the caller's number only when they are not erased, and why there is no memory or marketing.
ALTER TABLE conversation ADD COLUMN carrier_call_id text;
ALTER TABLE conversation ADD COLUMN called_number_id uuid REFERENCES phone_number(id) ON DELETE SET NULL;
ALTER TABLE conversation ADD COLUMN caller_e164 text;
ALTER TABLE conversation ADD COLUMN inbound_note text CHECK (inbound_note IN ('known','unknown_caller','suppressed','erased'));
CREATE UNIQUE INDEX conversation_carrier_call ON conversation (workspace_id, carrier_call_id) WHERE carrier_call_id IS NOT NULL;

-- A hold for a call with no attempt (inbound) is found by its conversation at call.ended.
ALTER TABLE reservation ADD COLUMN conversation_id uuid REFERENCES conversation(id) ON DELETE SET NULL;
CREATE INDEX reservation_conversation ON reservation (conversation_id) WHERE conversation_id IS NOT NULL;
