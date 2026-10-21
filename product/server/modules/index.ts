// Every module the control plane loads, in order. A module lives in server/modules/<name>/index.ts and
// exports `module: Module`. Add one line here per module; nothing else is wired by hand.
import type { Module } from '../app.ts';
import { module as memory } from './memory/index.ts';
import { module as money } from './money/index.ts';
import { module as operator } from './operator/index.ts';

export const modules: Module[] = [money, memory, operator];
