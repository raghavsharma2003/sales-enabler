// Background jobs. A module returns jobs from `jobs(deps)`; main.ts runs them. Each job runs on an interval or once a
// day at an Asia/Kolkata wall-clock time, never overlaps itself, and takes a Postgres advisory lock for its name so
// only one replica runs it at a time. A failing job logs and waits for its next turn; it never takes the process down.
import type { Deps } from './app.ts';

export interface Job {
  name: string;                 // 'campaigns.dispatch', 'money.nightly'
  everyMs?: number;             // run every N ms ...
  dailyAtIst?: string;          // ... or once a day at 'HH:MM' Asia/Kolkata
  run(deps: Deps): Promise<void>;
}

const IST_OFFSET_MS = 330 * 60_000;

/** ms from `now` until the next HH:MM in Asia/Kolkata (IST has no DST). */
export function msUntilIst(hhmm: string, now: number = Date.now()): number {
  const [h, m] = hhmm.split(':').map(Number);
  const ist = new Date(now + IST_OFFSET_MS);
  let target = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), h, m) - IST_OFFSET_MS;
  if (target <= now) target += 24 * 3600_000;
  return target - now;
}

export async function runOnce(job: Job, deps: Deps): Promise<'ran' | 'locked' | 'failed'> {
  const c = await deps.pool.connect();
  try {
    const got = await c.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', ['job:' + job.name]);
    if (!got.rows[0].ok) return 'locked';
    try { await job.run(deps); return 'ran'; }
    catch (e) { console.error(`[vp] job ${job.name} failed`, e); return 'failed'; }
    finally { await c.query('SELECT pg_advisory_unlock(hashtext($1))', ['job:' + job.name]); }
  } finally { c.release(); }
}

/** Start every job; returns a stop function. */
export function startJobs(jobs: Job[], deps: Deps): () => void {
  const timers: NodeJS.Timeout[] = [];
  let stopped = false;
  for (const job of jobs) {
    let running = false;
    const tick = async () => {
      if (running || stopped) return;
      running = true;
      try { await runOnce(job, deps); } finally { running = false; }
    };
    if (job.everyMs) timers.push(setInterval(tick, job.everyMs));
    else if (job.dailyAtIst) {
      const arm = () => { if (!stopped) timers.push(setTimeout(async () => { await tick(); arm(); }, msUntilIst(job.dailyAtIst!))); };
      arm();
    }
  }
  return () => { stopped = true; for (const t of timers) clearTimeout(t); };
}
