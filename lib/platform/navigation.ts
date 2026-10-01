import type { PlatformRecord, WorkspaceData } from './contracts';

export const workspaceAreas = [
  { id: 'home', label: 'Overview', destination: 'Command centre', sections: ['Command centre'] },
  { id: 'company', label: 'Company', destination: 'Company', sections: ['Company', 'Company brain', 'Customers', 'Integrations'] },
  { id: 'agents', label: 'Agents', destination: 'Agents', sections: ['Agents', 'Test lab', 'Releases', 'Deployments'] },
  { id: 'campaigns', label: 'Campaigns', destination: 'Campaigns', sections: ['Campaigns', 'Automations'] },
  { id: 'activity', label: 'Activity', destination: 'Conversations', sections: ['Conversations', 'Inbox', 'Commitments', 'Quality', 'GroupAI'] },
  { id: 'settings', label: 'Settings', destination: 'Team & access', sections: ['Team & access', 'Account security'] },
] as const;

export const sectionLabels: Record<string, string> = {
  'Command centre': 'Overview', Company: 'Company profile', 'Company brain': 'Company brain', Customers: 'Customers', Integrations: 'Connections',
  Agents: 'Agent studio', 'Test lab': 'Release checks', Releases: 'Release history', Deployments: 'Channels', Campaigns: 'Campaigns', Automations: 'Automations',
  Conversations: 'Conversations', Inbox: 'Inbox', Commitments: 'Follow-ups', Quality: 'Evaluation lab', GroupAI: 'GroupAI',
  'Team & access': 'Team & access', 'Account security': 'Account security',
};
export type WorkspaceRoute = { section: string; focusId?: string };
const aliases: Record<string, string> = { home: 'Command centre', overview: 'Command centre', command: 'Command centre', brain: 'Company brain', groups: 'GroupAI', tests: 'Test lab', representatives: 'Agents', activity: 'Conversations' };
export function resolveSection(value: string): string {
  const key = value.replace(/[-_]/g, ' ').trim().toLocaleLowerCase();
  return Object.keys(sectionLabels).find(section => section.replace(/[-_]/g, ' ').toLocaleLowerCase() === key)
    || Object.keys(sectionLabels).find(section => sectionLabels[section].replace(/[-_]/g, ' ').toLocaleLowerCase() === key)
    || aliases[key] || 'Command centre';
}
function decode(value: string) { try { return decodeURIComponent(value); } catch { return value; } }
export function readWorkspaceHash(hash: string): WorkspaceRoute {
  const [section, id] = hash.replace(/^#/, '').split('/');
  return { section: resolveSection(decode(section || 'Command centre')), ...(id ? { focusId: decode(id) } : {}) };
}
export function workspaceHref(section: string, focusId?: string): string {
  return `#${encodeURIComponent(resolveSection(section))}${focusId ? `/${encodeURIComponent(focusId)}` : ''}`;
}
export function workspaceArea(section: string) {
  return workspaceAreas.find(area => (area.sections as readonly string[]).includes(section)) || workspaceAreas[0];
}
export function sameWorkspaceRoute(a: WorkspaceRoute, b: WorkspaceRoute) { return a.section === b.section && a.focusId === b.focusId; }

export type WorkspaceSearchResult = { id: string; label: string; detail: string; section: string; focusId?: string };
/** Search only records that have a real owning destination. Never manufacture conversation or release status. */
export function searchWorkspace(query: string, workspace: WorkspaceData, records: PlatformRecord[]): WorkspaceSearchResult[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const results: WorkspaceSearchResult[] = Object.entries(sectionLabels).filter(([key, label]) => `${key} ${label}`.toLocaleLowerCase().includes(needle))
    .map(([section, label]) => ({ id: `page:${section}`, label, detail: `${workspaceArea(section).label} · Page`, section }));
  const names = new Map(records.filter(record => record.kind === 'agent_definition').map(record => [record.id, String(record.data.name || 'Agent')]));
  for (const record of records) {
    const name = String(record.data.name || record.data.title || '');
    const base = { id: `record:${record.id}`, label: name, detail: record.status, focusId: record.id };
    let result: WorkspaceSearchResult | undefined;
    switch (record.kind) {
      case 'agent_definition': result = { ...base, section: 'Agents', detail: `Agent · ${record.status}` }; break;
      case 'agent_version': result = { ...base, section: 'Agents', focusId: String(record.data.agentId), label: `${names.get(String(record.data.agentId)) || 'Agent'} · version ${record.data.number}`, detail: 'Saved version · opens its agent' }; break;
      case 'test_run': result = { ...base, section: 'Test lab', label: `${names.get(String(records.find(v => v.id === record.data.versionId)?.data.agentId)) || 'Agent'} · release check`, detail: `Configuration check · ${record.status}` }; break;
      case 'release': result = { ...base, section: 'Releases', label: `${names.get(String(record.data.agentId)) || 'Agent'} · release`, detail: `Release · ${record.status}` }; break;
      case 'agent_deployment':
      case 'deployment': result = { ...base, section: 'Deployments', detail: `Channel · ${record.status}` }; break;
      case 'brain_source': result = { ...base, section: 'Company brain', detail: `Company source · ${record.status}` }; break;
      case 'campaign': result = { ...base, section: 'Campaigns', detail: `Campaign · ${record.status}` }; break;
      case 'campaign_run': result = { ...base, section: 'Campaigns', focusId: String(record.data.campaignId), label: name || String(records.find(c => c.id === record.data.campaignId)?.data.name || 'Campaign run'), detail: `Campaign run · ${record.status}` }; break;
      case 'group_world': result = { ...base, section: 'GroupAI', detail: `GroupAI space · ${record.status}` }; break;
      case 'commitment': result = { ...base, section: 'Commitments', detail: `Follow-up · ${record.status}` }; break;
    }
    if (result && `${result.label} ${result.detail}`.toLocaleLowerCase().includes(needle)) results.push(result);
  }
  for (const contact of workspace.contacts) {
    const label = String(contact.name || 'Customer');
    if (label.toLocaleLowerCase().includes(needle)) results.push({ id: `contact:${contact.id}`, label, detail: 'Customer', section: 'Customers', focusId: contact.id });
  }
  for (const session of workspace.sessions) {
    const label = String(session.title || `Conversation · ${new Date(session.createdAt).toLocaleDateString('en-IN')}`);
    if (label.toLocaleLowerCase().includes(needle)) results.push({ id: `session:${session.id}`, label, detail: 'Saved conversation', section: 'Conversations', focusId: session.id });
  }
  return results.slice(0, 16);
}
