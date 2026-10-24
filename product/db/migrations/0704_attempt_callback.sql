-- A callback the caller asked for (campaigns/retry.ts, memory brief): on the attempt that calls them back, the time they
-- stated, their exact words, where it was said, and the time it is clamped to; on the attempt that ended, a note when
-- they asked for a callback without a clear time (nothing was scheduled, nothing was guessed).
ALTER TABLE attempt ADD COLUMN IF NOT EXISTS callback jsonb;
