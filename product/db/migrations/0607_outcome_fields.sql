-- Typed extraction fields on an outcome definition (must-be brief 7): [{key, label?, type: text|number|date|enum|sentiment,
-- values?}], validated in code (outcome.define). The analysis fills each from what the caller said, quoted from one of
-- their lines, or leaves it empty; a value without a verifiable quote is dropped and counted (analysis.fieldsDropped).
ALTER TABLE outcome_definition ADD COLUMN fields jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(fields) = 'array');
