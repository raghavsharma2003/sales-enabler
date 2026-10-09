'use client';

import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  BookOpen,
  Building2,
  Check,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Clock3,
  LoaderCircle,
  MessageSquare,
  PauseCircle,
  RefreshCw,
  Rocket,
} from 'lucide-react';
import type { CompanySettingsSnapshot } from '../../lib/company/contracts';
import type { PlatformViewProps } from '../../lib/platform/contracts';
import {
  deriveWorkspaceJourney,
  type AttentionItem,
  type WorkspaceJourneyInput,
  type WorkspaceJourneyStep,
} from '../../lib/platform/workspace-journey';
import styles from './command-view.module.css';

type CompanyState = WorkspaceJourneyInput['company'];

const attentionIcons: Record<AttentionItem['kind'], ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  follow_up: MessageSquare,
  test_failure: AlertTriangle,
  commitment: Clock3,
  campaign_pause: PauseCircle,
  memory: BookOpen,
};

const stepIcons: Record<WorkspaceJourneyStep['id'], ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  knowledge: BookOpen,
  agent: Bot,
  test_release: CheckCircle2,
  channel: Rocket,
  conversations: MessageSquare,
};

function savedTime(value: string) {
  if (!value) return 'Save time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return 'Save time unavailable';
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export function CommandView({ records, workspace, busy, navigate }: PlatformViewProps) {
  const [company, setCompany] = useState<CompanyState>({ status: 'loading' });
  const [companyAttempt, setCompanyAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setCompany({ status: 'loading' });
    void fetch('/api/company', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const body = await response.json() as CompanySettingsSnapshot & { error?: string };
        if (!response.ok) throw new Error(body.error || 'The company record could not be loaded.');
        return body;
      })
      .then(snapshot => setCompany({ status: 'ready', snapshot }))
      .catch(error => {
        if (controller.signal.aborted) return;
        setCompany({ status: 'unavailable', error: error instanceof Error ? error.message : 'The company record could not be loaded.' });
      });
    return () => controller.abort();
  }, [companyAttempt, records, workspace.organization.id]);

  const journey = useMemo(() => deriveWorkspaceJourney({ records, workspace, company }), [company, records, workspace]);
  const open = (section: string, focusId?: string) => navigate(section, focusId);
  const runRecommended = () => {
    if (journey.recommended.kind === 'retry') setCompanyAttempt(value => value + 1);
    else if (journey.recommended.kind === 'navigate') open(journey.recommended.section, journey.recommended.focusId);
  };

  return <main className={`pc-page ${styles.page}`}>
    <header className={styles.header}>
      <div>
        <h1>Overview</h1>
        <p>{journey.returningWorkspace ? 'Continue active company work and review the records that need a person.' : 'Set up the company context, then take the path that fits the first agent.'}</p>
      </div>
      <div className={styles.companyContext} data-state={journey.company.state}>
        <span className={styles.companyMark} aria-hidden="true"><Building2 size={17}/></span>
        <span><strong>{journey.company.name}</strong><small>{journey.company.detail}</small></span>
        {journey.company.state === 'loading' ? <LoaderCircle className={styles.spin} size={16} aria-hidden="true"/> : journey.company.state === 'ready' ? <Check size={16} aria-hidden="true"/> : <CircleAlert size={16} aria-hidden="true"/>}
      </div>
    </header>

    <div className={styles.layout}>
      <div className={styles.primary}>
        <section className={styles.recommendation} aria-labelledby="recommended-heading">
          <div className={styles.recommendationIcon} aria-hidden="true">{journey.recommended.kind === 'waiting' ? <LoaderCircle className={styles.spin} size={22}/> : journey.recommended.kind === 'retry' ? <RefreshCw size={22}/> : <ArrowRight size={22}/>}</div>
          <div className={styles.recommendationBody}>
            <h2 id="recommended-heading">{journey.recommended.title}</h2>
            <p>{journey.recommended.reason}</p>
            <small>{journey.recommended.evidence}</small>
            <div className={styles.recommendationActions}>
              <button className={styles.primaryAction} type="button" disabled={busy || journey.recommended.kind === 'waiting'} onClick={runRecommended}>
                {journey.recommended.kind === 'waiting' && <LoaderCircle className={styles.spin} size={15} aria-hidden="true"/>}
                {journey.recommended.actionLabel}
                {journey.recommended.kind === 'navigate' && <ArrowRight size={15} aria-hidden="true"/>}
              </button>
              {journey.alternatives.map(item => <button className={styles.textAction} type="button" key={`${item.section}:${item.focusId || ''}`} onClick={() => open(item.section, item.focusId)}>{item.label}<ArrowRight size={13} aria-hidden="true"/></button>)}
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="campaigns-heading">
          <div className={styles.sectionHeading}>
            <div><h2 id="campaigns-heading">Campaigns in progress</h2><p>Saved outcomes and the exact stage to continue.</p></div>
            {workspace.user.role !== 'viewer' && <button className={styles.sectionAction} type="button" onClick={() => open('campaigns', 'new')}>New campaign<ArrowRight size={14} aria-hidden="true"/></button>}
          </div>
          {journey.campaignsInProgress.length > 0 ? <div className={styles.flatList}>{journey.campaignsInProgress.map(campaign => <button className={styles.campaignRow} type="button" key={campaign.id} onClick={() => open(campaign.section, campaign.focusId)}>
            <span className={styles.campaignCopy}><strong>{campaign.name}</strong><small><b>Goal:</b> {campaign.goal}</small>{campaign.offering && <em>Offering · {campaign.offering}</em>}</span>
            <span className={styles.campaignMeta}><span>{campaign.phaseLabel}</span><strong>{campaign.nextAction}</strong></span>
            <ArrowRight size={15} aria-hidden="true"/>
          </button>)}</div> : <div className={styles.smallEmpty}><CircleDashed size={17} aria-hidden="true"/><span>{workspace.user.role === 'viewer' ? 'No saved campaign is in progress.' : 'No saved campaign is in progress. Start one when there is a customer outcome to prepare.'}</span></div>}
        </section>

        <section className={styles.section} aria-labelledby="attention-heading">
          <div className={styles.sectionHeading}>
            <div><h2 id="attention-heading">Needs attention</h2><p>Items with a saved reason and an owning record.</p></div>
            {journey.attention.length > 0 && <span>{journey.attention.length} open</span>}
          </div>
          {journey.attention.length > 0 ? <div className={styles.flatList}>{journey.attention.map(item => {
            const Icon = attentionIcons[item.kind];
            return <article className={styles.attentionRow} key={`${item.kind}:${item.id}`}>
              <span className={styles.rowIcon} data-kind={item.kind} aria-hidden="true"><Icon size={17}/></span>
              <span className={styles.rowCopy}><strong>{item.title}</strong><small>{item.reason}</small><em>Source: {item.source}</em></span>
              <button type="button" onClick={() => open(item.section, item.focusId)}>Review<span className={styles.srOnly}> {item.title}</span><ArrowRight size={14} aria-hidden="true"/></button>
            </article>;
          })}</div> : <div className={styles.calmState}><CheckCircle2 size={18} aria-hidden="true"/><span><strong>No saved item is waiting for review.</strong><small>New failures, pauses, follow-ups, commitments, and memory proposals will appear here.</small></span></div>}
        </section>

        <div className={styles.recentGrid}>
          <section className={styles.section} aria-labelledby="recent-agents-heading">
            <div className={styles.sectionHeading}><div><h2 id="recent-agents-heading">Recent agents</h2><p>Latest saved draft and release state.</p></div><Bot size={18} aria-hidden="true"/></div>
            {journey.recentAgents.length ? <div className={styles.flatList}>{journey.recentAgents.map(agent => <button className={styles.recentRow} type="button" key={agent.id} onClick={() => open(agent.section, agent.focusId)}>
              <span><strong>{agent.name}</strong><small>{agent.role}</small><em>Last saved {savedTime(agent.savedAt)}</em></span>
              <span className={styles.status}>{agent.status}</span><ArrowRight size={14} aria-hidden="true"/>
            </button>)}</div> : <div className={styles.smallEmpty}><CircleDashed size={17} aria-hidden="true"/><span>No saved agents yet.</span></div>}
          </section>

          <section className={styles.section} aria-labelledby="recent-conversations-heading">
            <div className={styles.sectionHeading}><div><h2 id="recent-conversations-heading">Recent conversations</h2><p>Saved source and participant scope.</p></div><MessageSquare size={18} aria-hidden="true"/></div>
            {journey.recentConversations.length ? <div className={styles.flatList}>{journey.recentConversations.map(conversation => <button className={styles.recentRow} type="button" key={conversation.id} onClick={() => open(conversation.section, conversation.focusId)}>
              <span><strong>{conversation.title}</strong><small>{conversation.context}</small><em>Last saved {savedTime(conversation.savedAt)}</em></span>
              <span className={styles.status}>{conversation.status}</span><ArrowRight size={14} aria-hidden="true"/>
            </button>)}</div> : <div className={styles.smallEmpty}><CircleDashed size={17} aria-hidden="true"/><span>No saved conversations yet.</span></div>}
          </section>
        </div>
      </div>

      <aside className={styles.journey} aria-labelledby="journey-heading">
        <div className={styles.journeyHeading}><h2 id="journey-heading">Workspace journey</h2><p>Use the order that fits the work. Knowledge and public channels remain optional.</p></div>
        <ol>{journey.steps.map(step => {
          const Icon = stepIcons[step.id];
          return <li key={step.id} data-state={step.state}>
            <button type="button" onClick={() => open(step.section, step.focusId)}>
              <span className={styles.stepIcon} aria-hidden="true">{step.state === 'complete' ? <Check size={15}/> : <Icon size={16}/>}</span>
              <span className={styles.stepCopy}><strong>{step.label}</strong><small>{step.detail}</small></span>
              <span className={styles.stepState}>{step.stateLabel}</span>
            </button>
          </li>;
        })}</ol>
        <p className={styles.journeyNote}>Configuration checks prove saved settings only. A release enables private browser use; a deployment is the separate public boundary.</p>
      </aside>
    </div>
  </main>;
}
