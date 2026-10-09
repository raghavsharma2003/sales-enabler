'use client';

import { useState } from 'react';
import { Rocket, Square } from 'lucide-react';
import type { PlatformViewProps } from '../../lib/platform/contracts';
import { latestConfigurationRun } from '../../lib/platform/release-review';
import { ReleaseReview } from '../release-review';

export function ReleasesView({ records, workspace, act, busy, navigate, focusId }: PlatformViewProps) {
  const agents = records.filter(record => record.kind === 'agent_definition');
  const versions = records.filter(record => record.kind === 'agent_version');
  const releases = records.filter(record => record.kind === 'release').sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const focusedRelease = releases.find(release => release.id === focusId);
  const focusedAgent = agents.find(agent => agent.id === focusId);
  const [agentId, setAgentId] = useState(String(focusedRelease?.data.agentId || focusedAgent?.id || agents[0]?.id || ''));
  const [versionId, setVersionId] = useState(String(focusedRelease?.data.versionId || ''));
  const [stopError, setStopError] = useState('');
  const agent = agents.find(item => item.id === agentId) || agents[0];
  const agentVersions = versions
    .filter(version => version.data.agentId === agent?.id)
    .sort((left, right) => Number(right.data.number) - Number(left.data.number) || right.createdAt.localeCompare(left.createdAt));
  const version = agentVersions.find(item => item.id === versionId) || agentVersions[0];
  const active = releases.find(release => release.data.agentId === agent?.id && release.status === 'active');
  const configurationRun = latestConfigurationRun(records, agent?.id, version?.id);
  const latest = agentVersions[0]?.id === version?.id;
  const operation = latest ? 'publish' as const : 'rollback' as const;
  const viewer = workspace.user.role === 'viewer';
  const agentName = (id: unknown) => String(agents.find(item => item.id === id)?.data.name || 'Agent');
  const proofLabel = (release: typeof releases[number]) => {
    const evidence = release.data.regressionEvidence;
    if (!evidence || typeof evidence !== 'object') return 'Legacy proof record';
    return (evidence as { mode?: unknown }).mode === 'reviewed_text_regression' ? 'Reviewed text cases' : 'Configuration only';
  };

  const stop = async () => {
    if (!active || viewer) return;
    try {
      setStopError('');
      await act('release.stop', { releaseId: active.id, revision: active.revision });
    } catch (cause) {
      setStopError(cause instanceof Error ? cause.message : 'The active release could not be stopped. Refresh and try again.');
    }
  };

  return <main className="pc-page">
    <header className="pc-pagehead"><div><h1>Release history</h1><p className="pc-muted">Review the same current proof used in the agent builder, publish the latest version, or safely return to an earlier one.</p></div><button type="button" className="pc-button quiet" onClick={() => navigate('tests', version?.id)}>Open Test Lab</button></header>
    <section className="pc-panel">
      <div className="pc-pagehead"><div><h2>Choose a version</h2><p className="pc-muted">A historical passing result never overrides the latest exact-version check.</p></div>{active && <button type="button" className="pc-button danger" disabled={busy || viewer} onClick={() => void stop()}><Square size={16} aria-hidden="true"/> Stop active release</button>}</div>
      {stopError && <p className="pc-error-text" role="alert">{stopError}</p>}
      {agents.length ? <>
        <div className="pc-grid">
          <label className="pc-field">Agent<select className="pc-select" value={agent?.id || ''} onChange={event => { setAgentId(event.target.value); setVersionId(''); setStopError(''); }}>{agents.map(item => <option key={item.id} value={item.id}>{String(item.data.name)}</option>)}</select></label>
          <label className="pc-field">Version<select className="pc-select" value={version?.id || ''} onChange={event => { setVersionId(event.target.value); setStopError(''); }}>{agentVersions.map(item => <option key={item.id} value={item.id}>Version {String(item.data.number)}{item.id === active?.data.versionId ? ' · active' : item.id === agentVersions[0]?.id ? ' · latest' : ''}</option>)}</select></label>
        </div>
        <div style={{ marginTop: 24 }}><ReleaseReview
          agent={agent}
          version={version}
          configurationRun={configurationRun}
          activeRelease={active}
          records={records}
          operation={operation}
          busy={busy}
          viewer={viewer}
          act={act}
          navigate={navigate}
        /></div>
      </> : <div className="pc-empty"><p>Create and test an agent before reviewing a release.</p><button type="button" className="pc-button" onClick={() => navigate('agents')}>Create agent</button></div>}
    </section>

    <section className="pc-panel">
      <h2>Saved release record</h2>
      <div className="pc-list">{releases.map(release => {
        const releaseVersion = versions.find(item => item.id === release.data.versionId);
        return <button type="button" className="pc-row" key={release.id} aria-current={release.id === focusId ? 'true' : undefined} onClick={() => { setAgentId(String(release.data.agentId)); setVersionId(String(release.data.versionId)); }}>
          <Rocket size={16} aria-hidden="true"/>
          <span><strong>{agentName(release.data.agentId)} · version {String(releaseVersion?.data.number || 'unknown')}</strong><small className="pc-muted">{new Date(release.createdAt).toLocaleString()} · Browser · {proofLabel(release)}</small></span>
          <span className="pc-badge" data-status={release.status}>{release.status}</span>
        </button>;
      })}</div>
      {releases.length === 0 && <p className="pc-empty">No releases yet. Review a tested version above to publish the first one.</p>}
    </section>
  </main>;
}
