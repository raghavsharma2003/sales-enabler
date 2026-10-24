-- VP schema 0806 (learning module): the owner's review and how she changed.
-- review_flag: a member marks one turn of a call as wrong, in their own words (review.flag_turn). The turn is quoted from
-- the call's own transcript, never from the caller of the tool. It becomes a lesson and, when the gates allow, a proposal.
-- Test calls may be flagged: the owner's review mostly runs on them.
CREATE TABLE IF NOT EXISTS review_flag (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  agent_id          uuid NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
  conversation_id   uuid NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  agent_version_id  uuid REFERENCES agent_version(id) ON DELETE SET NULL,
  turn              integer NOT NULL CHECK (turn >= 0),
  speaker           text NOT NULL CHECK (speaker IN ('agent','caller')),
  quote             text NOT NULL,
  note              text NOT NULL,
  flagged_by        text NOT NULL,
  lesson_id         uuid REFERENCES lesson(id) ON DELETE SET NULL,
  proposal_id       uuid REFERENCES proposal(id) ON DELETE SET NULL,
  detail            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, turn, flagged_by)
);
CREATE INDEX IF NOT EXISTS review_flag_agent ON review_flag (workspace_id, agent_id, created_at DESC);

-- A lesson can come from the owner's review, and a change can be reverted.
ALTER TABLE lesson DROP CONSTRAINT IF EXISTS lesson_status_check;
ALTER TABLE lesson ADD CONSTRAINT lesson_status_check
  CHECK (status IN ('active','won','lost','null_result','stopped','rejected','expired','owner_flag','adopted','reverted'));

-- A proposal a person adopted without a live test is 'promoted' with proposal.adopted (the version and the approver);
-- one taken back out is 'reverted'.
ALTER TABLE proposal DROP CONSTRAINT IF EXISTS proposal_status_check;
ALTER TABLE proposal ADD CONSTRAINT proposal_status_check
  CHECK (status IN ('drafted','gated_out','awaiting_approval','testing','promoted','rejected','expired','reverted'));
ALTER TABLE proposal ADD COLUMN IF NOT EXISTS adopted jsonb;
