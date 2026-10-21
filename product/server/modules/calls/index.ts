// The calls module: runtime event ingest (POST /hooks/runtime), the call record and its analysis,
// outcomes and judges, monitors and issues, reports, the campaign funnel, test calls and live control.
import type { Module } from '../../app.ts';
import { hookRoute } from './ingest.ts';
import { registerTools } from './tools.ts';

export const module: Module = {
  name: 'calls',
  register: registerTools,
  routes(router, deps) {
    router.add('POST', '/hooks/runtime', hookRoute(deps));
  },
};
