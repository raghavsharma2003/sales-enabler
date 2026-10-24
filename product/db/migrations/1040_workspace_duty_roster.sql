-- Who is on duty, and when: weekly hours in the roster's timezone plus dated overrides (on duty, or off: leave, a swap).
-- Notifications email the people on shift when a destination lists no addresses; with nobody on shift they fall back to
-- the role rule (active owners, operators and compliance members). Changing the roster is a policy change.
CREATE TABLE duty_roster (
  workspace_id  uuid PRIMARY KEY REFERENCES workspace(id) ON DELETE CASCADE,
  timezone      text NOT NULL DEFAULT 'Asia/Kolkata',
  version       integer NOT NULL DEFAULT 0,
  updated_by    text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE duty_shift (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  member_id     uuid NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  days          smallint[] NOT NULL CHECK (cardinality(days) BETWEEN 1 AND 7 AND days <@ '{1,2,3,4,5,6,7}'::smallint[]),   -- ISO: 1 Monday .. 7 Sunday
  start_min     smallint NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
  end_min       smallint NOT NULL CHECK (end_min BETWEEN 1 AND 1440),
  CHECK (end_min > start_min)                    -- a shift past midnight is two shifts
);
CREATE INDEX duty_shift_ws ON duty_shift (workspace_id);

CREATE TABLE duty_override (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  member_id     uuid NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL CHECK (ends_at > starts_at),
  on_duty       boolean NOT NULL,
  note          text,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX duty_override_ws ON duty_override (workspace_id, ends_at);
