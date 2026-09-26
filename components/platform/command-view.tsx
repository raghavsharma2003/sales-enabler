'use client';

import { AlertTriangle, ArrowRight, CheckCircle2, CircleDot, Clock3, ExternalLink } from 'lucide-react';
import type { PlatformViewProps, PlatformRecord } from '../../lib/platform/contracts';
import { CompanyOperatingFlow } from '../company-operating-flow';

type Row = PlatformRecord<Record<string, unknown>>;
const text = (value: unknown, fallback = 'Unspecified') => typeof value === 'string' && value.trim() ? value : fallback;
const contactName = (id: unknown, workspace: PlatformViewProps['workspace']) => text(workspace.contacts.find((item) => item.id === id)?.name, 'Customer record');

export function CommandView({ records, workspace, act, busy, navigate }: PlatformViewProps) {
  const testFailures = records.filter((record) => record.kind === 'test_run' && record.status === 'failed') as Row[];
  const openCommitments = records.filter((record) => record.kind === 'commitment' && record.status === 'open') as Row[];
  const pausedRuns = records.filter((record) => record.kind === 'campaign_run' && record.status === 'paused') as Row[];
  const pendingMemories = workspace.memories.filter((memory) => ['pending', 'proposed', 'review'].includes(String(memory.status || '')));
  const pendingFollowups = workspace.actions.filter((action) => ['proposed', 'approved'].includes(String(action.status || '')));
  const decisions = [
    ...pendingFollowups.map((action) => ({ id: action.id, title: 'Follow-up needs review', reason: text(action.title, 'A conversation produced a follow-up request.'), label: 'Commitments', target: 'commitments', tone: 'review' })),
    ...testFailures.map((record) => ({ id: record.id, title: 'Test run blocked', reason: text(record.data.disclaimer, 'Configuration checks failed.'), label: 'Test lab', target: 'tests', tone: 'blocked' })),
    ...openCommitments.map((record) => ({ id: record.id, title: text(record.data.title, 'Open commitment'), reason: `Due ${text(record.data.dueDate, 'date not set')} · ${contactName(record.data.contactId, workspace)}`, label: 'Commitments', target: 'commitments', tone: 'open' })),
    ...pausedRuns.map((record) => ({ id: record.id, title: 'Campaign run paused', reason: text(record.data.name, 'A campaign needs review before it resumes.'), label: 'Campaigns', target: 'campaigns', tone: 'paused' })),
    ...pendingMemories.map((memory) => ({ id: memory.id, title: 'Memory needs review', reason: text(memory.content, 'A relationship memory is waiting for a decision.'), label: 'Customers', target: 'customers', tone: 'review' })),
  ];
  const activeSessions = workspace.sessions;
  const activeRuns = records.filter((record) => record.kind === 'campaign_run' && ['active', 'running'].includes(record.status));

  return <main className="pc-page">
    <header className="pc-pagehead"><div><h1>Command centre</h1><p className="pc-muted">Decisions requiring a person, sourced from saved platform records and workspace history.</p></div><span className="pc-badge">{decisions.length} needing review</span></header>
    <CompanyOperatingFlow records={records} workspace={workspace} navigate={navigate}/>
    <div className="pc-grid">
      <section className="pc-panel"><div className="pc-pagehead"><div><h2>Decision queue</h2><p className="pc-muted">Open the owning record to inspect evidence and take the next action.</p></div></div>
        {decisions.length ? <div className="pc-list">{decisions.map((item) => <article className="pc-row" key={item.id} style={{ alignItems: 'flex-start' }}><span aria-hidden="true"><CircleDot size={17}/></span><span><strong>{item.title}</strong><small className="pc-muted">{item.reason}</small><small className="pc-muted">Source: {item.label}</small></span><button className="pc-button quiet" type="button" onClick={() => navigate(item.target)} disabled={busy}>Review <ArrowRight size={14}/></button></article>)}</div> : <div className="pc-empty"><CheckCircle2 size={22}/><p>No open decisions from the saved records.</p></div>}
      </section>
      <aside className="pc-panel"><h2>Workspace activity</h2><div className="pc-list"><button className="pc-row" type="button" onClick={() => navigate('conversations')}><Clock3 size={16}/><span><strong>{activeSessions.length}</strong><small className="pc-muted">Saved conversations</small></span><ExternalLink size={14}/></button><button className="pc-row" type="button" onClick={() => navigate('campaigns')}><ArrowRight size={16}/><span><strong>{activeRuns.length}</strong><small className="pc-muted">Campaign runs in progress</small></span><ExternalLink size={14}/></button></div><p className="pc-muted">Counts reflect records currently loaded into this workspace. There is no live provider activity implied here.</p><h3>Useful next checks</h3><div className="pc-list"><button className="pc-row" type="button" onClick={() => navigate('tests')}><span>Test lab</span><ArrowRight size={14}/></button><button className="pc-row" type="button" onClick={() => navigate('releases')}><span>Releases</span><ArrowRight size={14}/></button><button className="pc-row" type="button" onClick={() => navigate('integrations')}><span>Integrations</span><ArrowRight size={14}/></button></div></aside>
    </div>
    <section className="pc-panel"><h2>Voice agent preparation</h2><p className="pc-muted">Prepare and check a representative before using it in a campaign.</p><div className="pc-grid"><button className="pc-row" type="button" onClick={() => navigate('brain')}><strong>1. Data</strong><span className="pc-muted">Approve company sources</span></button><button className="pc-row" type="button" onClick={() => navigate('agents')}><strong>2. Agent</strong><span className="pc-muted">Define the representative</span></button><button className="pc-row" type="button" onClick={() => navigate('tests')}><strong>3. Test</strong><span className="pc-muted">Run configuration checks</span></button><button className="pc-row" type="button" onClick={() => navigate('releases')}><strong>4. Release</strong><span className="pc-muted">Publish a passing version</span></button><button className="pc-row" type="button" onClick={() => navigate('conversations')}><strong>5. Call</strong><span className="pc-muted">Review a saved browser session</span></button></div></section>
  </main>;
}
