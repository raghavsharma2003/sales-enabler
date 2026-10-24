-- The per-call trace for the owner's review (shared/runtime-protocol.ts CallTrace, voice/vpvoice/trace.py): turn by
-- turn timing, ASR confidence, barge-ins, TTS provider and style, door verdicts, judge verdicts, errors and the stack.
-- It holds no words (rows point at the transcript by index), so transcript retention and erasure cover the text.
ALTER TABLE conversation ADD COLUMN IF NOT EXISTS trace jsonb;
