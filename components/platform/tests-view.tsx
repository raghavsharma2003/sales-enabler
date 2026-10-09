'use client';

import { useState } from 'react';
import { FlaskConical, CheckCircle2, XCircle } from 'lucide-react';
import type { PlatformViewProps } from '../../lib/platform/contracts';
import { RegressionWorkbench } from '../regression-workbench';

export function TestsView({ records, workspace, act, busy, navigate, focusId }: PlatformViewProps) {
  const versions = records.filter((r) => r.kind === 'agent_version').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const runs = records.filter((r) => r.kind === 'test_run').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const focusedVersionId = versions.find(version => version.id === focusId)?.id || runs.find(run => run.id === focusId)?.data.versionId;
  const [versionId, setVersionId] = useState(typeof focusedVersionId === 'string' ? focusedVersionId : '');
  const selected = versions.find((v) => v.id === versionId) || versions[0];
  const selectedRuns = runs.filter((r) => r.data.versionId === selected?.id);
  const agents = records.filter((r) => r.kind === 'agent_definition');
  const agentName = (id: unknown) => String(agents.find((a) => a.id === id)?.data.name || 'Agent');
  const run = async (id: string) => { try { await act('test.run', { versionId: id }); } catch { /* Global action banner presents the server error. */ } };
  return <main className="pc-page"><header className="pc-pagehead"><div><h1>Test lab</h1><p className="pc-muted">Check exact agent versions, then rehearse a new text reply against reviewed conversation cases.</p></div><button type="button" className="pc-button quiet" onClick={() => navigate('agents')}>Edit agents</button></header>
    <div className="pc-grid"><section className="pc-panel"><h2>Configuration checks</h2>{versions.length ? <><label className="pc-field">Candidate version<select className="pc-select" value={selected?.id || ''} onChange={(e) => setVersionId(e.target.value)}>{versions.map((v) => <option value={v.id} key={v.id}>{agentName(v.data.agentId)} · v{String(v.data.number)}</option>)}</select></label><button type="button" className="pc-button primary" disabled={busy} onClick={() => void run(selected.id)}><FlaskConical size={16}/> Run configuration checks</button></> : <div className="pc-empty"><p>Capture an agent version to begin testing.</p><button type="button" className="pc-button" onClick={() => navigate('agents')}>Open agent builder</button></div>}
      <p className="pc-muted">These checks validate disclosure, essential instructions, language settings and current knowledge authority. They do not measure speech, model responses, audio quality or customer outcomes.</p></section>
      <section className="pc-panel"><h2>Configuration results</h2>{selectedRuns.map((run) => <article className="pc-result" key={run.id}><div className="pc-row">{run.data.passed ? <CheckCircle2 size={18}/> : <XCircle size={18}/>}<strong>{run.data.passed ? 'Passed' : 'Blocked'}</strong><span className="pc-muted">{new Date(run.createdAt).toLocaleString()}</span></div><ul className="pc-list">{(run.data.checks as {label: string;passed: boolean;detail: string}[]).map((check) => <li className="pc-row" key={check.label}>{check.passed ? <CheckCircle2 size={16}/> : <XCircle size={16}/>}<span><strong>{check.label}</strong><small className="pc-muted">{check.detail}</small></span></li>)}</ul><p className="pc-muted">{String(run.data.disclaimer)}</p></article>)}{selectedRuns.length === 0 && <p className="pc-empty">No checks have been run for this version.</p>}</section></div>
    <RegressionWorkbench records={records} workspace={workspace} focusId={focusId}/>
  </main>;
}
