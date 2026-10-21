// Every module the control plane loads, in order. A module lives in server/modules/<name>/index.ts and
// exports `module: Module`. Add one line here per module; nothing else is wired by hand.
import type { Module } from '../app.ts';
import { module as agents } from './agents/index.ts';
import { module as calls } from './calls/index.ts';
import { module as campaignsBase } from './campaigns/index.ts';
import { tick as campaignsTick } from './campaigns/worker.ts';
import { module as learning } from './learning/index.ts';
import { module as memory } from './memory/index.ts';
import { module as money } from './money/index.ts';
import { module as operator } from './operator/index.ts';
import { module as workspace } from './workspace/index.ts';

// The campaigns dispatcher (claim -> dial gate -> ticket -> runtime) runs as a job every 2 s, single-runner via the job lock.
const campaigns: Module = {
  ...campaignsBase,
  jobs: deps => [...(campaignsBase.jobs?.(deps) ?? []),
    { name: 'campaigns.dispatch', everyMs: 2_000, run: async d => { await campaignsTick({ pool: d.pool, registry: d.registry }); } }],
};

export const modules: Module[] = [workspace, money, agents, campaigns, calls, memory, learning, operator];
