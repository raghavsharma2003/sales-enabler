-- Model-judge activity reported by the voice runtime (RuntimeEvent 'judge'). Analysis-only: nothing that sets a flag,
-- safety_violation, a monitor or an experiment reads this table. A real raise also arrives as a call_safety_event.
CREATE TABLE call_judge_event (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  seq           integer NOT NULL,
  judge         text NOT NULL CHECK (judge IN ('caller_crisis')),
  mode          text NOT NULL CHECK (mode IN ('shadow','raise')),
  outcome       text NOT NULL CHECK (outcome IN ('raised','shadow','unavailable')),
  kind          text CHECK (kind IN ('direct','indirect')),
  confidence    numeric CHECK (confidence >= 0 AND confidence <= 1),
  reason        text CHECK (reason IN ('timeout','error','bad_output')),
  latency_ms    integer NOT NULL,
  at            timestamptz NOT NULL
);
CREATE INDEX call_judge_conv ON call_judge_event (conversation_id);
