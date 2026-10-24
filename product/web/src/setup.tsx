// Where a workspace is on the way to its first calls (agents, a test, contacts, a campaign), shared by Today's Get started and
// every page's empty state, so a fresh workspace always shows one next action that leads somewhere real (owner directive
// 2026-10-24: the owner's account starts empty).
import { run } from './api.ts';
import { agentList, campaignList } from './data.ts';
import { useData } from './store.tsx';

export interface Progress { agents: { id: string; name: string; published: boolean }[]; heard: boolean; contacts: number; campaigns: number; launched: number; draft: { id: string; name: string } | null }
export async function progress(): Promise<Progress> {
  const [agents, calls, contacts, camps] = await Promise.all([
    agentList(),
    run<{ calls: { channel: string }[] }>('call.search', { includeTest: true, limit: 50 }).catch(() => ({ calls: [] })),
    run<{ contacts: unknown[] }>('contact.list', { limit: 1 }).catch(() => ({ contacts: [] })),
    campaignList(),
  ]);
  const draft = camps.find(c => c.state === 'draft');
  return { agents: agents.map(a => ({ id: a.id, name: a.name, published: !!a.latestVersion })), heard: calls.calls.some(c => c.channel === 'test'), contacts: contacts.contacts.length, campaigns: camps.length, launched: camps.filter(c => c.state !== 'draft').length, draft: draft ? { id: draft.id, name: draft.name } : null };
}

/** The workspace's progress (cached with Today's Get started, so pages do not ask twice). */
export const useSetup = () => useData<Progress>('getting-started', progress).data;

export type Need = 'agent' | 'published' | 'heard' | 'contacts' | 'campaign';
export interface NextStep { need: Need; title: string; label: string; to: string }
/** The first of `needs` this workspace has not done, as a page's one primary action; null when all are done. */
export function nextStep(p: Progress, needs: Need[]): NextStep | null {
  const first = p.agents[0], unpublished = p.agents.find(a => !a.published);
  for (const n of needs) {
    if (n === 'agent' && !p.agents.length) return { need: n, title: 'Start with an agent', label: 'Make the first agent', to: '/' };
    if (n === 'published' && p.agents.length && !p.agents.some(a => a.published)) return { need: n, title: `Publish ${unpublished!.name}`, label: `Open ${unpublished!.name}`, to: `/agents/${unpublished!.id}` };
    if (n === 'heard' && first && !p.heard) return { need: n, title: `Hear ${first.name} first`, label: `Hear ${first.name}`, to: `/agents/${first.id}?test=1` };
    if (n === 'contacts' && !p.contacts) return { need: n, title: 'Add the people to call', label: 'Import contacts', to: '/contacts/import' };
    if (n === 'campaign' && !p.campaigns) return { need: n, title: 'Start a campaign', label: 'Start a campaign', to: '/campaigns/new' };
  }
  return null;
}
