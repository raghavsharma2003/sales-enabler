-- VP schema 0109 (intake): a member's own verified phone as a test contact. "Add me as a test contact" on a sample pack
-- puts the member's verified number in the list; when that upload is saved, the contact is marked as that member's test
-- contact, so a campaign on staging can ring the owner once telephony is live (telephony enforces the allowlist and checks
-- verified_test_phone again at dial time). Only the sample flow sets the upload's marker; no file or CRM column can.
ALTER TABLE contact ADD COLUMN test_member_id uuid REFERENCES member(id) ON DELETE SET NULL;
ALTER TABLE intake_upload ADD COLUMN test_member_id uuid REFERENCES member(id) ON DELETE SET NULL;
CREATE INDEX contact_test_member ON contact (workspace_id) WHERE test_member_id IS NOT NULL;
