// Every module the control plane loads, in order. A module lives in server/modules/<name>/index.ts and
// exports `module: Module`. Add one line here per module; nothing else is wired by hand.
import type { Module } from '../app.ts';
import { module as agents } from './agents/index.ts';
import { module as calls } from './calls/index.ts';
import { module as campaigns } from './campaigns/index.ts';
import { module as channels } from './channels/index.ts';
import { module as intake } from './intake/index.ts';
import { module as learning } from './learning/index.ts';
import { module as memory } from './memory/index.ts';
import { module as money } from './money/index.ts';
import { module as operator } from './operator/index.ts';
import { module as safety } from './safety/index.ts';
import { module as workspace } from './workspace/index.ts';

export const modules: Module[] = [safety, workspace, intake, money, agents, campaigns, calls, channels, memory, learning, operator];
