'use client';

import { useState } from 'react';
import { Rocket, RotateCcw, Square } from 'lucide-react';
import type { PlatformViewProps } from '../../lib/platform/contracts';

export function ReleasesView({ records, act, busy, navigate, focusId }: PlatformViewProps) {
  const agents = records.filter((r) => r.kind === 'agent_definition');
  const versions = records.filter((r) => r.kind === 'agent_version');
  const runs = records.filter((r) => r.kind === 'test_run');
  const releases = records.filter((r) => r.kind === 'release').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const focusedRelease = releases.find(release => release.id === focusId);
  const [agentId, setAgentId] = useState(String(focusedRelease?.data.agentId || (agents.some(agent => agent.id === focusId) ? focusId : '') || ''));
  const [versionId, setVersionId] = useState(String(focusedRelease?.data.versionId || ''));
  const agent = agents.find((a) => a.id === agentId) || agents[0];
  const agentVersions = versions.filter((v) => v.data.agentId === agent?.id).sort((a, b) => Number(b.data.number) - Number(a.data.number));
  const version = agentVersions.find((v) => v.id === versionId) || agentVersions[0];
  const active = releases.find((r) => r.data.agentId === agent?.id && r.status === 'active');
  const passing = runs.filter((r) => r.data.versionId === version?.id && r.data.passed === true).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const latest = agentVersions[0]?.id === version?.id;
  const agentName = (id: unknown) => String(agents.find((a) => a.id === id)?.data.name || 'Agent');
  const submit = async (action: string, body: Record<string, unknown>) => { try { await act(action, body); } catch { /* Global action banner presents the server error. */ } };
  return <main className="pc-page"><header className="pc-pagehead"><div><h1>Browser releases</h1><p className="pc-muted">Publish a tested version, inspect the active binding or return to a previously tested version.</p></div><button type="button" className="pc-button quiet" onClick={() => navigate('tests')}>Open Test Lab</button></header>
    <div className="pc-grid"><section className="pc-panel"><h2>Release gate</h2>{agents.length ? <><label className="pc-field">Agent<select className="pc-select" value={agent?.id || ''} onChange={(e) => { setAgentId(e.target.value); setVersionId(''); }}>{agents.map((a) => <option key={a.id} value={a.id}>{String(a.data.name)}</option>)}</select></label>{agentVersions.length ? <><label className="pc-field">Version<select className="pc-select" value={version?.id || ''} onChange={(e) => setVersionId(e.target.value)}>{agentVersions.map((v) => <option key={v.id} value={v.id}>Version {String(v.data.number)}</option>)}</select></label><div className="pc-list"><div className="pc-row"><span>Exact-version check</span><span className="pc-badge">{passing ? 'Passed' : 'Required'}</span></div><div className="pc-row"><span>Channel</span><span className="pc-badge">Browser</span></div><div className="pc-row"><span>Active version</span><span className="pc-badge">{active ? `v${String(versions.find((v) => v.id === active.data.versionId)?.data.number || '?')}` : 'None'}</span></div></div><p className="pc-muted">Knowledge authority is rechecked when publishing. Live voice quality has not been evaluated.</p>{!passing && <button type="button" className="pc-button quiet" onClick={() => navigate('tests')}>Run version checks</button>}<div className="pc-row"><button type="button" className="pc-button primary" disabled={busy || !passing || !latest || active?.data.versionId === version?.id} onClick={() => void submit('release.publish', { versionId: version.id, testRunId: passing?.id, currentReleaseId: active?.id || null })}><Rocket size={16}/> Publish latest</button><button type="button" className="pc-button quiet" disabled={busy || !passing || latest || active?.data.versionId === version?.id} onClick={() => void submit('release.rollback', { versionId: version.id, testRunId: passing?.id, currentReleaseId: active?.id || null })}><RotateCcw size={16}/> Roll back</button></div>{active && <button type="button" className="pc-button danger" disabled={busy} onClick={() => void submit('release.stop', { releaseId: active.id, revision: active.revision })}><Square size={16}/> Stop browser release</button>}</> : <div className="pc-empty"><p>Capture a version before releasing this agent.</p><button type="button" className="pc-button" onClick={() => navigate('agents')}>Open agent builder</button></div>}</> : <div className="pc-empty"><p>Create and test an agent before publishing.</p><button type="button" className="pc-button" onClick={() => navigate('agents')}>Create agent</button></div>}</section>
      <section className="pc-panel"><h2>Release history</h2><div className="pc-list">{releases.map((release) => <div className="pc-row" key={release.id}><Rocket size={16}/><span><strong>{agentName(release.data.agentId)} · v{String(versions.find((v) => v.id === release.data.versionId)?.data.number || '?')}</strong><small className="pc-muted">{new Date(release.createdAt).toLocaleString()} · Browser</small></span><span className="pc-badge">{release.status}</span></div>)}</div>{releases.length === 0 && <p className="pc-empty">No releases yet.</p>}</section></div>
  </main>;
}
