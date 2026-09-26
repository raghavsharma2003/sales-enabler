'use client';

import { ArrowRight, Database, FolderInput, MessagesSquare, Route, Sparkles } from 'lucide-react';
import type { PlatformViewProps } from '../lib/platform/contracts';

export function CompanyOperatingFlow({ records, workspace, navigate }: Pick<PlatformViewProps, 'records' | 'workspace' | 'navigate'>) {
  const imported = records.filter(item => item.kind === 'ingestion_source').length;
  const approved = records.filter(item => item.kind === 'brain_source' && item.status === 'approved').length;
  const offerings = records.filter(item => item.kind === 'offering' && item.status === 'approved').length;
  const signals = records.filter(item => item.kind === 'business_signal' && item.status === 'approved').length;
  const campaigns = records.filter(item => item.kind === 'campaign').length;
  const learning = records.filter(item => item.kind === 'conversation_analysis').length;
  const steps = [
    { name: 'Company sources', hint: imported ? `${imported} imported sources` : 'Connect accounts or bring files', icon: FolderInput, target: 'brain/intake' },
    { name: 'Company model', hint: offerings ? `${offerings} approved ${offerings === 1 ? 'offering' : 'offerings'} · ${signals} reviewed ${signals === 1 ? 'signal' : 'signals'}` : approved ? `${approved} sources ready · identify offerings` : 'Review offerings and signals', icon: Database, target: 'brain' },
    { name: 'Campaigns', hint: campaigns ? `${campaigns} campaign drafts and runs` : 'Give AI a business objective', icon: Route, target: 'campaigns' },
    { name: 'Conversations', hint: workspace.sessions.length ? `${workspace.sessions.length} saved conversations` : 'Test and operate your agents', icon: MessagesSquare, target: 'conversations' },
    { name: 'Review learning', hint: learning ? `${learning} source-backed ${learning === 1 ? 'analysis' : 'analyses'}` : 'Review feedback and next actions', icon: Sparkles, target: 'conversations' },
  ];
  return <section className="company-flow" aria-label="Company operating flow"><div className="company-flow-heading"><div><h2>Your company, from context to action</h2><p>Every stage keeps its sources and decisions attached. Open a stage to continue the work.</p></div><button className="pc-button" onClick={() => navigate('integrations')}>Connect a company system<ArrowRight size={15}/></button></div><ol>{steps.map(({ icon: Icon, ...step }) => <li key={step.name}><button onClick={() => navigate(step.target)}><Icon size={20}/><strong>{step.name}</strong><span>{step.hint}</span><ArrowRight size={15}/></button></li>)}</ol><div className="company-flow-followup"><button className="pc-button" onClick={() => navigate('commitments')}>Open follow-up commitments<ArrowRight size={15}/></button></div></section>;
}
