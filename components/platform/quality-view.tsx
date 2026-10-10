'use client';

import { useState } from 'react';
import { CheckCircle2, MessageSquare, XCircle } from 'lucide-react';
import type { PlatformViewProps } from '../../lib/platform/contracts';
import { VoiceEvidenceLab } from '../voice-evidence-lab';
import { moveTabFocus, VoiceAudioProof } from '../voice-audio-proof';

const qualityTabs = [
  { id: 'audio', label: 'Audio proof' },
  { id: 'transcript', label: 'Transcript evaluations' },
  { id: 'coverage', label: 'Workspace coverage' },
] as const;
type QualityTab = typeof qualityTabs[number]['id'];

export function QualityView({ records, workspace, navigate, focusId }: PlatformViewProps) {
  const [tab, setTab] = useState<QualityTab>('audio');
  const [visited, setVisited] = useState<ReadonlySet<QualityTab>>(() => new Set(['audio']));
  const runs = records.filter((record) => record.kind === 'test_run');
  const feedback = records.filter((record) => record.kind === 'feedback');
  const passed = runs.filter((record) => record.status === 'passed').length;
  const failed = runs.filter((record) => record.status === 'failed').length;
  const sessions = workspace.sessions;
  const providers = Array.from(new Set(sessions.map((session) => String(session.provider || 'Provider not recorded'))));
  const ids = qualityTabs.map(item => item.id);
  const selectTab = (next: QualityTab) => {
    setTab(next);
    setVisited(current => current.has(next) ? current : new Set([...current, next]));
  };

  return <main className="pc-page">
    <header className="pc-pagehead"><div><h1>Quality</h1><p className="pc-muted">Review captured audio, transcript evaluations and saved workspace coverage without turning one run into a benchmark.</p></div></header>
    <div className="pc-tabs" role="tablist" aria-label="Quality evidence sections">
      {qualityTabs.map(item => <button key={item.id} id={`quality-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`quality-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => selectTab(item.id)} onKeyDown={event => moveTabFocus(event, ids, tab, value => selectTab(value as QualityTab))}>{item.label}</button>)}
    </div>

    <div id="quality-panel-audio" role="tabpanel" aria-labelledby="quality-tab-audio" hidden={tab !== 'audio'}>{visited.has('audio') && <VoiceAudioProof records={records} focusId={focusId}/>}</div>
    <div id="quality-panel-transcript" role="tabpanel" aria-labelledby="quality-tab-transcript" hidden={tab !== 'transcript'}>{visited.has('transcript') && <VoiceEvidenceLab records={records} workspace={workspace}/>}</div>
    <div id="quality-panel-coverage" role="tabpanel" aria-labelledby="quality-tab-coverage" hidden={tab !== 'coverage'}>
      {visited.has('coverage') && <><div className="pc-grid"><section className="pc-panel"><h2>Test lab evidence</h2><p className="pc-muted">These are configuration and authority checks against exact agent versions. They do not measure latency, audio quality, model behaviour or customer outcomes.</p><div className="pc-list"><div className="pc-row"><CheckCircle2 size={17}/><span><strong>{passed}</strong><small className="pc-muted">Passing configuration runs</small></span></div><div className="pc-row"><XCircle size={17}/><span><strong>{failed}</strong><small className="pc-muted">Failed configuration runs</small></span></div></div><button className="pc-button primary" type="button" onClick={() => navigate('tests')}>Open Test Lab</button></section>
        <section className="pc-panel"><h2>Human feedback</h2><p className="pc-muted">Feedback is recorded from an operator and linked to the source conversation.</p>{feedback.length ? <div className="pc-list">{feedback.map((item) => <div className="pc-row" key={item.id}><MessageSquare size={16}/><span><strong>{String(item.data.content || 'Operator observation')}</strong><small className="pc-muted">Conversation {String(item.data.sessionId || 'not linked').slice(0, 12)}</small></span></div>)}</div> : <p className="pc-empty">No human feedback has been recorded yet. Open Company brain to add an observation against a saved conversation.</p>}<button className="pc-button quiet" type="button" onClick={() => navigate('brain')}>Open Company brain</button></section></div>
      <section className="pc-panel"><h2>Saved sessions by provider</h2><p className="pc-muted">Session counts come from the workspace records. Provider not recorded is kept separate from named providers.</p>{providers.length ? <div className="pc-table" role="table" aria-label="Saved sessions by provider"><div className="pc-row" role="row"><strong role="columnheader">Provider</strong><strong role="columnheader">Saved sessions</strong><strong role="columnheader">Evidence</strong></div>{providers.map((provider) => <div className="pc-row" role="row" key={provider}><span role="cell">{provider}</span><span role="cell">{sessions.filter((session) => String(session.provider || 'Provider not recorded') === provider).length}</span><span role="cell" className="pc-muted">Transcript/session record</span></div>)}</div> : <p className="pc-empty">No saved sessions yet. A browser conversation must be saved before it can appear here.</p>}<button className="pc-button quiet" type="button" onClick={() => navigate('conversations')}>Open Conversations</button></section></>}
    </div>
  </main>;
}
