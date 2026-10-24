-- VP schema 0103 (intake): retention policy per workspace, versioned (a change or revert is a new version; the audit
-- keeps both). Intake enforces the classes it owns (raw upload files, import receipts' row issues); other modules read
-- policy.retention.get for theirs. Consent, suppression and tombstones are never subject to retention.
CREATE TABLE intake_retention_policy (
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  version       integer NOT NULL,
  policy        jsonb NOT NULL,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, version)
);
