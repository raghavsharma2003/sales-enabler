'use client';

import type { PlatformRecord } from '@/lib/platform/records';
import type { WorkspaceData } from '@/lib/platform/contracts';
import { VoiceStudio } from './voice-studio';

export function CampaignVoiceStudio({ runId, records, workspace, onRefresh }: {
  runId: string;
  records: PlatformRecord[];
  workspace: WorkspaceData;
  onRefresh?: () => void | Promise<void>;
}) {
  const run = records.find(item => item.kind === 'campaign_run' && item.id === runId);
  const snapshot = run?.data.snapshot as Record<string, unknown> | undefined;
  if (!run || run.status !== 'active' || snapshot?.channel !== 'browser') return null;
  const releaseId = String(snapshot.agentReleaseId || '');
  const release = records.find(item => item.kind === 'release' && item.id === releaseId && item.status === 'active');
  const recipients = Array.isArray(run.data.recipients) ? run.data.recipients as { contactId: string; name: string; status: string }[] : [];
  const contacts = recipients.filter(item => item.status === 'queued').map(item => ({ id: item.contactId, name: item.name }));
  if (!release || !contacts.length) return <section className="pc-panel"><h2>Campaign browser call</h2><p className="pc-muted">This run has no active release or queued browser recipient.</p></section>;
  const releasedAgent = { id: release.id, agentId: String(release.data.agentId), versionId: String(release.data.versionId), label: String(release.data.name || 'Campaign release') };
  return <section className="pc-panel" aria-label="Campaign browser call"><h2>Call a queued campaign recipient</h2><p className="pc-muted">An internal operator chooses the recipient and starts the AI browser conversation. The run brief is checked again when the connection starts.</p><VoiceStudio key={runId} contacts={contacts} releases={[releasedAgent]} contactId={contacts[0]?.id} campaignRunId={runId} onSaved={() => { void onRefresh?.(); }}/></section>;
}
