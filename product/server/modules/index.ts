// Every module the control plane loads, in order. A module lives in server/modules/<name>/index.ts and
// exports `module: Module`. Add one line here per module; nothing else is wired by hand.
import type { Module } from '../app.ts';

export const modules: Module[] = [];
