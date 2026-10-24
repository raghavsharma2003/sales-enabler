-- VP schema 0803 (learning module): the arm each contact was placed in, stored at first assignment.
-- The readout counts only these contacts, on the version of their own arm, so calls the experiment did not place
-- (another campaign, inbound) never enter it, and a contact can never be counted in two arms.
CREATE TABLE experiment_assignment (
  experiment_id uuid NOT NULL REFERENCES experiment(id) ON DELETE CASCADE,
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  contact_id    uuid NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  arm           text NOT NULL CHECK (arm IN ('control','treatment')),
  version_id    uuid NOT NULL REFERENCES agent_version(id) ON DELETE CASCADE,
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (experiment_id, contact_id)
);
CREATE INDEX experiment_assignment_ws ON experiment_assignment (workspace_id, experiment_id);
