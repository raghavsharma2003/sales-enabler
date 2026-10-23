-- Which model analyses a workspace's calls. single: one model (model, or the deployment default when null).
-- tiered: model first; escalate_model re-runs the call when the first pass fails, finds no outcome, or is below threshold.
CREATE TABLE call_analysis_setting (
  workspace_id  uuid PRIMARY KEY REFERENCES workspace(id) ON DELETE CASCADE,
  mode          text NOT NULL DEFAULT 'single' CHECK (mode IN ('single','tiered')),
  model         text,
  escalate_model text,
  threshold     numeric NOT NULL DEFAULT 0.6 CHECK (threshold >= 0 AND threshold <= 1),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (mode = 'single' OR escalate_model IS NOT NULL)
);
