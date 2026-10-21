-- VP schema 0105 (intake): consent has an effective time, when it was given or withdrawn, as the source states it, or the
-- insert time when the source states none. "Latest consent" is ordered by (effective_at DESC, created_at DESC); insert
-- order alone let a re-imported old "yes" undo a newer withdrawal (review WGC-06). A source can never post-date its own
-- claim, so effective_at is clamped to the insert time. The append-only guard now covers effective_at too.
ALTER TABLE consent_record ADD COLUMN effective_at timestamptz;
UPDATE consent_record SET effective_at = least(created_at, coalesce(
  CASE WHEN evidence->>'statedAt' ~ '^\d{4}-\d{2}-\d{2}' THEN (evidence->>'statedAt')::timestamptz END, created_at));
ALTER TABLE consent_record ALTER COLUMN effective_at SET NOT NULL;
CREATE INDEX consent_effective ON consent_record (contact_id, purpose, effective_at DESC, created_at DESC);

CREATE FUNCTION consent_effective_clamp() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.effective_at IS NULL OR NEW.effective_at > NEW.created_at THEN NEW.effective_at := NEW.created_at; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER consent_effective_clamp BEFORE INSERT ON consent_record FOR EACH ROW EXECUTE FUNCTION consent_effective_clamp();

CREATE OR REPLACE FUNCTION consent_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() < 2 THEN RAISE EXCEPTION 'consent_record is append-only'; END IF;
    RETURN OLD;
  END IF;
  IF (NEW.workspace_id, NEW.purpose, NEW.channel, NEW.basis, NEW.source, NEW.evidence, NEW.granted, NEW.created_at, NEW.id, NEW.effective_at)
     IS DISTINCT FROM (OLD.workspace_id, OLD.purpose, OLD.channel, OLD.basis, OLD.source, OLD.evidence, OLD.granted, OLD.created_at, OLD.id, OLD.effective_at) THEN
    RAISE EXCEPTION 'consent_record is append-only';
  END IF;
  RETURN NEW;
END $$;
