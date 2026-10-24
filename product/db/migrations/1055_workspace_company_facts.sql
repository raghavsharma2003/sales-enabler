-- Company data end to end: an offerings sheet is a knowledge source of its own kind (one passage per row), and facts
-- are proposed from every source with the passage they came from, for a person to approve or reject singly or in bulk.
-- Approved facts join an offering; prices and dates are proposed only from sheets, never from prose (HV law 22).
ALTER TABLE knowledge_source DROP CONSTRAINT IF EXISTS knowledge_source_kind_check;
ALTER TABLE knowledge_source ADD CONSTRAINT knowledge_source_kind_check CHECK (kind IN ('file','url','text','drive','sheet'));

CREATE TABLE IF NOT EXISTS knowledge_fact (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq            bigserial,           -- proposal order: a passage's statements and a row's columns, as written
  workspace_id   uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  source_id      uuid NOT NULL REFERENCES knowledge_source(id) ON DELETE CASCADE,
  span_id        uuid NOT NULL REFERENCES knowledge_span(id) ON DELETE CASCADE,
  text           text NOT NULL,
  quote          text NOT NULL,
  purposes       jsonb NOT NULL DEFAULT '[]'::jsonb,
  origin         text NOT NULL CHECK (origin IN ('prose', 'sheet')),
  offering_name  text,                -- a sheet row's offering; prose facts go to the offering chosen when approved
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'excluded')),
  reason         text,                -- why it was excluded (a price or a date in prose)
  offering_id    uuid REFERENCES offering(id) ON DELETE SET NULL,
  decided_by     text,
  decided_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_fact_ws ON knowledge_fact (workspace_id, status, created_at);
CREATE INDEX IF NOT EXISTS knowledge_fact_source ON knowledge_fact (source_id);
