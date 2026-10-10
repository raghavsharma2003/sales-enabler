import { createHash } from 'node:crypto';
import type { AuthUser } from '../server/auth';
import { HttpError } from '../server/http';
import { getRecord, listRecords } from '../platform/records';
import type { AgentConfig } from '../platform/agents';
import { compileAgentContext } from './context';
import { LIVE_VOICE_PUBLICATION_BLOCKER } from './live-voice';

type Version = { agentId: string; config: AgentConfig; knowledgeDigests: Record<string, string> };
type Release = { agentId: string; versionId: string; channel: string };

/** Resolve an explicit, still-active browser release before exposing any context. */
export async function releasedVoiceContext(user: AuthUser, ids: { agentId: string; versionId: string; releaseId: string; contactId?: string }) {
  const [release, version] = await Promise.all([
    getRecord(user.organizationId, 'release', ids.releaseId),
    getRecord(user.organizationId, 'agent_version', ids.versionId),
  ]);
  const releaseData = release.data as Release;
  const versionData = version.data as Version;
  if (release.status !== 'active' || releaseData.channel !== 'browser' || releaseData.agentId !== ids.agentId || releaseData.versionId !== ids.versionId || versionData.agentId !== ids.agentId) throw new HttpError(409, 'The selected agent release is no longer active. Refresh and choose an active version.');
  const active = (await listRecords(user.organizationId, 'release')).filter(r => r.status === 'active' && r.data.agentId === ids.agentId);
  if (active.length !== 1 || active[0].id !== release.id) throw new HttpError(409, 'Agent release state changed. Refresh before starting a call.');
  const c = versionData.config;
  if (c.liveVoice?.engine === 'azure-voice-live') throw new HttpError(409, LIVE_VOICE_PUBLICATION_BLOCKER);
  const knowledge = await Promise.all(c.knowledgeIds.map(id => getRecord(user.organizationId, 'brain_source', id)));
  for (const item of knowledge) {
    if (item.status !== 'approved') throw new HttpError(409, 'A released knowledge source is no longer approved. Test and publish a new version before calling.');
    const digest = createHash('sha256').update(JSON.stringify({ title: item.data.title, content: item.data.content, sourceLabel: item.data.sourceLabel, revision: item.revision, approvedAt: item.data.approvedAt, status: item.status })).digest('hex');
    if (digest !== versionData.knowledgeDigests[item.id]) throw new HttpError(409, 'A released knowledge source changed. Test and publish a new version before calling.');
  }
  return compileAgentContext(user, c, knowledge, ids.contactId);
}
