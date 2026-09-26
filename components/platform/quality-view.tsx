'use client';

import { CheckCircle2, MessageSquare, XCircle } from 'lucide-react';
import type { PlatformViewProps } from '../../lib/platform/contracts';
import { VoiceEvidenceLab } from '../voice-evidence-lab';

export function QualityView({ records, workspace, navigate }: PlatformViewProps) {
  const runs = records.filter((record) => record.kind === 'test_run');
  const feedback = records.filter((record) => record.kind === 'feedback');
  const passed = runs.filter((record) => record.status === 'passed').length;
  const failed = runs.filter((record) => record.status === 'failed').length;
  const sessions = workspace.sessions;
  const providers = Array.from(new Set(sessions.map((session) => String(session.provider || 'Provider not recorded'))));
  return <main className="pc-page"><header className="pc-pagehead"><div><h1>Quality</h1><p className="pc-muted">Review configuration evidence, human observations and saved session coverage without inventing speech metrics.</p></div><span className="pc-badge">{runs.length} recorded tests</span></header><VoiceEvidenceLab records={records} workspace={workspace}/>
    <div className="pc-grid"><section className="pc-panel"><h2>Test lab evidence</h2><p className="pc-muted">These are configuration and authority checks against exact agent versions. They do not measure latency, audio quality, model behaviour or customer outcomes.</p><div className="pc-list"><div className="pc-row"><CheckCircle2 size={17}/><span><strong>{passed}</strong><small className="pc-muted">Passing configuration runs</small></span></div><div className="pc-row"><XCircle size={17}/><span><strong>{failed}</strong><small className="pc-muted">Failed configuration runs</small></span></div></div><button className="pc-button primary" type="button" onClick={() => navigate('tests')}>Open Test Lab</button></section>
      <section className="pc-panel"><h2>Human feedback</h2><p className="pc-muted">Feedback is recorded from an operator and linked to the source conversation.</p>{feedback.length ? <div className="pc-list">{feedback.map((item) => <div className="pc-row" key={item.id}><MessageSquare size={16}/><span><strong>{String(item.data.content || 'Operator observation')}</strong><small className="pc-muted">Conversation {String(item.data.sessionId || 'not linked').slice(0, 12)}</small></span></div>)}</div> : <p className="pc-empty">No human feedback has been recorded yet. Open Company brain to add an observation against a saved conversation.</p>}<button className="pc-button quiet" type="button" onClick={() => navigate('brain')}>Open Company brain</button></section></div>
    <section className="pc-panel"><h2>Saved sessions by provider</h2><p className="pc-muted">Session counts come from the workspace records. Provider not recorded is kept separate from named providers.</p>{providers.length ? <div className="pc-table" role="table" aria-label="Saved sessions by provider"><div className="pc-row" role="row"><strong role="columnheader">Provider</strong><strong role="columnheader">Saved sessions</strong><strong role="columnheader">Evidence</strong></div>{providers.map((provider) => <div className="pc-row" role="row" key={provider}><span role="cell">{provider}</span><span role="cell">{sessions.filter((session) => String(session.provider || 'Provider not recorded') === provider).length}</span><span role="cell" className="pc-muted">Transcript/session record</span></div>)}</div> : <p className="pc-empty">No saved sessions yet. A browser conversation must be saved before it can appear here.</p>}<button className="pc-button quiet" type="button" onClick={() => navigate('conversations')}>Open Conversations</button></section>
  </main>;
}
