// The calls module: runtime event ingest (POST /hooks/runtime), the call record and its analysis,
// outcomes and judges, monitors and issues, reports, the campaign funnel, test calls and live control.
import type { Module } from '../../app.ts';
import { sweep } from './analysis.ts';
import { runNightlyInsights } from './insights.ts';
import { hookRoute } from './ingest.ts';
import { registerTools } from './tools.ts';
import { registerOutcomeImport } from './outcome-import.ts';
import { purgeRecordings } from './recording-purge.ts';

export const module: Module = {
  name: 'calls',
  register: r => { registerTools(r); registerOutcomeImport(r); },
  routes(router, deps) {
    router.add('POST', '/hooks/runtime', hookRoute(deps), { rawBody: true, limit: 5_000_000 });   // call.ended carries the transcript
  },
  // The in-process queue analyses each call as it ends; the sweep picks up any lost to a restart, and retries opt-outs.
  jobs: deps => [
    { name: 'calls.analysis_sweep', everyMs: 60_000, run: async () => { await sweep(deps.pool, deps.registry); } },
    // Cross-call insight, nightly in IST; skipped per scope when no call has ended since the last one.
    // Erasure and retention reach the audio on the voice runtime (recording-purge.ts); a failed purge is retried next run.
    { name: 'calls.recording_purge', everyMs: 10 * 60_000, run: async () => { await purgeRecordings(deps.pool); } },
    { name: 'calls.insight_nightly', dailyAtIst: '02:40', run: async () => { await runNightlyInsights(deps.pool); } },
  ],
};
