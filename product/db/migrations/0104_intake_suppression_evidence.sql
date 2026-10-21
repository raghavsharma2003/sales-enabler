-- VP schema 0104 (intake): suppression.source is a stable code (the dial gate reports it as suppressed:<source>):
-- in_call, manual, upload, crm, api_push, form, whatsapp, dpdp. Ids that explain it (conversation, member, source,
-- receipt) go in evidence instead.
ALTER TABLE suppression ADD COLUMN evidence jsonb;
