// The voice stack an agent or a call names, read from stack.list (cached under 'stack-list', shared with the stack picker).
// The web used to bundle the server's stack catalog (shared/stacks.ts and shared/components.ts, about 4 KB gzip) to resolve
// a label; the server already sends every curated stack and every part, so the catalog stays on the server.

export interface StackLite { id: string; label: string; kind: 'cascade' | 's2s'; status: 'available' | 'beta' }
export interface StackCatalog { stacks: StackLite[]; components: { id: string; part: string; label: string }[] }
export type VoiceRef = { stackId?: string | null; components?: { ears?: string; brain?: string; voice?: string; s2s?: string } | null } | null | undefined;

/** A curated stack by id, or a stack built part by part (always beta, labelled by its parts), as shared/stacks.ts resolveStack
 *  does. Undefined when nothing is chosen, the id is not offered, or a built stack is incomplete or mixes speech-to-speech in. */
export function resolveVoiceStack(d: StackCatalog, v: VoiceRef): StackLite | undefined {
  if (!v?.stackId) return undefined;
  if (v.stackId !== 'custom') return d.stacks.find(s => s.id === v.stackId);
  const c = v.components;
  if (!c || (c.s2s && (c.ears || c.brain || c.voice))) return undefined;
  const want: [string, string | undefined][] = c.s2s ? [['s2s', c.s2s]] : [['ears', c.ears], ['brain', c.brain], ['voice', c.voice]];
  const parts = want.map(([part, id]) => (id ? d.components.find(x => x.part === part && x.id === id) : undefined));
  if (parts.some(p => !p)) return undefined;
  return { id: 'custom', kind: c.s2s ? 's2s' : 'cascade', label: parts.map(p => p!.label).join(' + '), status: 'beta' };
}
