-- VP schema 0110 (intake): payment status from the business's payment gateway (Razorpay, Cashfree, PayU), so a call is
-- not made to someone who already paid. Each connected gateway posts signed webhooks to /hooks/payments/:integrationId;
-- a verified successful payment is matched to exactly one contact by a record key the workspace names (a policy, loan or
-- order id kept as a contact detail), never by the payer's phone. The dial gate asks paidSinceImport() at dial time.
-- integration_id is not a foreign key: integration is created by a later migration (1001). Rows go with the workspace.
CREATE TABLE intake_payment_source (
  integration_id      uuid PRIMARY KEY,
  workspace_id        uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  provider            text NOT NULL CHECK (provider IN ('razorpay','cashfree','payu')),
  match_keys          text[] NOT NULL CHECK (cardinality(match_keys) BETWEEN 1 AND 5),
  outcome_definition_id uuid,                -- optional: a verified outcome for a recent call of the person who paid
  outcome_value       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contact_payment (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  integration_id      uuid NOT NULL,
  provider            text NOT NULL CHECK (provider IN ('razorpay','cashfree','payu')),
  ref                 text NOT NULL,                  -- the gateway's own payment id (Razorpay pay_…, Cashfree cf_payment_id, PayU mihpayid)
  status              text NOT NULL CHECK (status IN ('matched','unmatched','ambiguous')),
  contact_id          uuid REFERENCES contact(id) ON DELETE CASCADE,
  reference_key       text,                           -- the contact detail it matched on, e.g. policy_number
  reference           text,                           -- the value it matched, e.g. SH-2026-40110
  amount_inr_milli    bigint,
  paid_at             timestamptz NOT NULL,
  received_at         timestamptz NOT NULL DEFAULT now(),
  outcome             jsonb,                          -- what happened to the verified outcome (recorded, no recent call, refused and why)
  UNIQUE (workspace_id, provider, ref),
  CHECK ((status = 'matched') = (contact_id IS NOT NULL))
);
CREATE INDEX contact_payment_contact ON contact_payment (workspace_id, contact_id, paid_at DESC) WHERE contact_id IS NOT NULL;
