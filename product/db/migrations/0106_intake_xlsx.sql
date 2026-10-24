-- VP schema 0106 (intake): Excel files. An .xlsx is read server-side (first sheet) into the same delimited text the rest
-- of intake reads; the upload keeps what the conversion found (sheet, formula cells read from cached values, errors).
ALTER TABLE intake_source DROP CONSTRAINT IF EXISTS intake_source_kind_check;
ALTER TABLE intake_source ADD CONSTRAINT intake_source_kind_check
  CHECK (kind IN ('csv','tsv','xlsx','sheet','api_push','crm','form','whatsapp'));
ALTER TABLE intake_upload ADD COLUMN converted jsonb;
