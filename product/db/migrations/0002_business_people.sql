-- VP schema 0002: the business (brand, offering, knowledge) and the people called
-- (contact, consent, suppression, audiences). Industry-neutral: sector is a label, not a fork.

CREATE TABLE brand (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  legal_name    text NOT NULL,
  cnap_name     text,
  dlt_entity_id text,
  sector        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX brand_ws ON brand (workspace_id);

-- What the business offers, as facts with quoted source spans; never_say is a hard list.
CREATE TABLE offering (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  brand_id      uuid REFERENCES brand(id) ON DELETE SET NULL,
  name          text NOT NULL,
  facts         jsonb NOT NULL DEFAULT '[]'::jsonb,
  never_say     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX offering_ws ON offering (workspace_id);

CREATE TABLE knowledge_source (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  brand_id      uuid REFERENCES brand(id) ON DELETE SET NULL,
  kind          text NOT NULL CHECK (kind IN ('file','url','text','drive')),
  uri           text,
  status        text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','indexing','indexed','failed')),
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ks_ws ON knowledge_source (workspace_id);

-- A person we may call. e164 is normalised (default country IN); aliases keep other formats seen.
CREATE TABLE contact (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  e164          text NOT NULL,
  name          text,
  language      text,
  timezone      text NOT NULL DEFAULT 'Asia/Kolkata',
  custom        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, e164)
);

CREATE TABLE contact_identifier (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    uuid NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  raw           text NOT NULL,
  kind          text NOT NULL DEFAULT 'phone'
);
CREATE INDEX cid_contact ON contact_identifier (contact_id);

-- Attributes carry an authority (who wins a conflict) and a max age (freshness at dial time).
CREATE TABLE attribute (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    uuid NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  key           text NOT NULL,
  value         jsonb NOT NULL,
  authority     text NOT NULL DEFAULT 'upload'
                 CHECK (authority IN ('system','crm','upload','agent','person')),
  max_age_s     integer,
  source_id     uuid,
  observed_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attr_contact ON attribute (contact_id, key);

-- Consent is append-only; nothing deletes a consent record.
CREATE TABLE consent_record (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  contact_id    uuid NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  purpose       text NOT NULL,
  channel       text NOT NULL DEFAULT 'voice',
  basis         text NOT NULL,
  source        text,
  evidence      jsonb,
  granted       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consent_contact ON consent_record (contact_id, created_at DESC);

-- Suppression holds on every outbound path; imports never clear it.
CREATE TABLE suppression (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  contact_id    uuid REFERENCES contact(id) ON DELETE CASCADE,
  e164          text,
  scope         text NOT NULL DEFAULT 'workspace' CHECK (scope IN ('workspace','campaign')),
  scope_id      uuid,
  reason        text NOT NULL,
  source        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX supp_ws_e164 ON suppression (workspace_id, e164);

-- DND / NCPR status cache per contact (checked_at bounds its freshness).
CREATE TABLE dnd_status (
  contact_id    uuid PRIMARY KEY REFERENCES contact(id) ON DELETE CASCADE,
  internal      boolean NOT NULL DEFAULT false,
  ncpr_status   text,
  checked_at    timestamptz
);

-- Forget leaves a tombstone so a re-import cannot resurrect a person.
CREATE TABLE tombstone (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  e164_hash     text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, e164_hash)
);

-- A receipt for every import, with the per-row outcome summary.
CREATE TABLE source_receipt (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  kind          text NOT NULL,
  filename      text,
  rows_total    integer NOT NULL DEFAULT 0,
  rows_ok       integer NOT NULL DEFAULT 0,
  summary       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audience (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name          text NOT NULL,
  kind          text NOT NULL DEFAULT 'list' CHECK (kind IN ('list','query')),
  definition    jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_id     uuid REFERENCES source_receipt(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audience_ws ON audience (workspace_id);

CREATE TABLE audience_member (
  audience_id   uuid NOT NULL REFERENCES audience(id) ON DELETE CASCADE,
  contact_id    uuid NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  PRIMARY KEY (audience_id, contact_id)
);
