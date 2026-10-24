-- The judge event names what it judged (shared/judge-event.json): 'crisis' (every row so far) or 'opt_out'. A shadow
-- opt-out row is log-only, like every row here: nothing that flags, suppresses or monitors reads this table.
ALTER TABLE call_judge_event ADD COLUMN label text NOT NULL DEFAULT 'crisis' CHECK (label IN ('crisis','opt_out'));
ALTER TABLE call_judge_event ADD CONSTRAINT call_judge_label_shape CHECK (
  label = 'crisis' OR (outcome IN ('raised','shadow') AND confidence IS NOT NULL AND kind IS NULL AND reason IS NULL));
