import type { CompanySettingsSnapshot } from '../company/contracts';
import { deriveAgentReadiness } from './agent-readiness';
import type { PlatformRecord, WorkspaceData, WorkspaceEntity } from './contracts';

type CompanyState =
  | { status: 'loading' }
  | { status: 'unavailable'; error: string }
  | { status: 'ready'; snapshot: CompanySettingsSnapshot };

export type JourneyTarget = {
  section: string;
  focusId?: string;
};

export type RecommendedAction = JourneyTarget & {
  kind: 'navigate' | 'retry' | 'waiting';
  title: string;
  reason: string;
  actionLabel: string;
  evidence: string;
};

export type WorkspaceJourneyStep = JourneyTarget & {
  id: 'knowledge' | 'agent' | 'test_release' | 'channel' | 'conversations';
  label: string;
  state: 'complete' | 'current' | 'attention' | 'available' | 'optional';
  stateLabel: string;
  detail: string;
};

export type AttentionItem = JourneyTarget & {
  id: string;
  kind: 'follow_up' | 'test_failure' | 'commitment' | 'campaign_pause' | 'memory';
  title: string;
  reason: string;
  source: string;
};

export type RecentAgent = JourneyTarget & {
  id: string;
  name: string;
  role: string;
  status: string;
  savedAt: string;
};

export type RecentConversation = JourneyTarget & {
  id: string;
  title: string;
  context: string;
  status: string;
  savedAt: string;
  identityVerified: false;
};

export type WorkspaceJourney = {
  company: {
    name: string;
    detail: string;
    state: 'loading' | 'unavailable' | 'ready' | 'attention';
  };
  recommended: RecommendedAction;
  alternatives: Array<JourneyTarget & { label: string }>;
  steps: WorkspaceJourneyStep[];
  attention: AttentionItem[];
  recentAgents: RecentAgent[];
  recentConversations: RecentConversation[];
  returningWorkspace: boolean;
};

export type WorkspaceJourneyInput = {
  records: PlatformRecord[];
  workspace: WorkspaceData;
  company: CompanyState;
};

const value = (input: unknown, fallback: string) => typeof input === 'string' && input.trim() ? input.trim() : fallback;
const timestamp = (input: WorkspaceEntity | PlatformRecord) => value(input.updatedAt, value(input.createdAt, ''));
const newestFirst = <T extends WorkspaceEntity | PlatformRecord>(items: T[]) => [...items].sort((a, b) => timestamp(b).localeCompare(timestamp(a)));

function buildAttention(records: PlatformRecord[], workspace: WorkspaceData): AttentionItem[] {
  const contacts = new Set(workspace.contacts.map(contact => contact.id));
  const contactName = (id: unknown) => workspace.contacts.find(contact => contact.id === id)?.name;
  const pendingFollowups = workspace.actions.filter(action => ['proposed', 'approved'].includes(String(action.status || '')));
  const testFailures = records.filter(record => record.kind === 'agent_definition').flatMap(agent => {
    const readiness = deriveAgentReadiness({ agent, records, dirty: false, busy: false, viewer: workspace.user.role === 'viewer' });
    return readiness.status === 'failed' && readiness.run ? [readiness.run] : [];
  });
  const openCommitments = records.filter(record => record.kind === 'commitment' && record.status === 'open');
  const pausedRuns = records.filter(record => record.kind === 'campaign_run' && record.status === 'paused');
  const pendingMemories = workspace.memories.filter(memory => ['pending', 'proposed', 'review'].includes(String(memory.status || '')));

  return [
    ...pendingFollowups.map(action => ({
      id: action.id,
      kind: 'follow_up' as const,
      title: 'Follow-up needs review',
      reason: value(action.title, 'A conversation produced a follow-up request.'),
      source: 'Commitments',
      section: 'commitments',
    })),
    ...testFailures.map(record => {
      const agentId = typeof record.data.agentId === 'string' && records.some(candidate => candidate.kind === 'agent_definition' && candidate.id === record.data.agentId) ? record.data.agentId : undefined;
      return {
        id: record.id,
        kind: 'test_failure' as const,
        title: 'Configuration check blocked',
        reason: value(record.data.disclaimer, 'The saved version did not pass its configuration checks.'),
        source: 'Agent Publish',
        section: 'agents',
        ...(agentId ? { focusId: agentId } : {}),
      };
    }),
    ...openCommitments.map(record => {
      const name = contactName(record.data.contactId);
      return {
        id: record.id,
        kind: 'commitment' as const,
        title: value(record.data.title, 'Open commitment'),
        reason: `Due ${value(record.data.dueDate, 'date not set')} · ${value(name, 'Internal work')}`,
        source: 'Commitments',
        section: 'commitments',
        focusId: record.id,
      };
    }),
    ...pausedRuns.map(record => ({
      id: record.id,
      kind: 'campaign_pause' as const,
      title: 'Campaign run paused',
      reason: value(record.data.name, 'A campaign needs review before it resumes.'),
      source: 'Campaigns',
      section: 'campaigns',
    })),
    ...pendingMemories.map(memory => {
      const contactId = typeof memory.contactId === 'string' && contacts.has(memory.contactId) ? memory.contactId : undefined;
      return {
        id: memory.id,
        kind: 'memory' as const,
        title: 'Memory needs review',
        reason: value(memory.content, 'A relationship memory is waiting for a decision.'),
        source: 'Customers',
        section: 'customers',
        ...(contactId ? { focusId: contactId } : {}),
      };
    }),
  ];
}

function conversationTitle(session: WorkspaceEntity, workspace: WorkspaceData) {
  const contact = typeof session.contactId === 'string' ? workspace.contacts.find(item => item.id === session.contactId) : undefined;
  return value(contact?.name, value(session.title, value(session.summary, 'Saved conversation')));
}

function conversationContext(session: WorkspaceEntity, workspace: WorkspaceData) {
  const contact = typeof session.contactId === 'string' ? workspace.contacts.find(item => item.id === session.contactId) : undefined;
  const anonymous = session.callerIdentity === 'anonymous_unverified'
    || session.identity === 'anonymous_unverified'
    || ['public_chat', 'public_voice', 'server_captured_public_channel'].includes(String(session.source || ''));
  if (anonymous) return 'Anonymous visitor · identity unverified';
  if (contact) return `${value(contact.name, 'Linked customer record')} · participant identity unverified`;
  if (session.source === 'browser_preview') return 'Internal agent test · no customer identity';
  return 'No verified participant identity';
}

export function deriveWorkspaceJourney({ records, workspace, company }: WorkspaceJourneyInput): WorkspaceJourney {
  const viewer = workspace.user.role === 'viewer';
  const approvedSources = records.filter(record => record.kind === 'brain_source' && record.status === 'approved');
  const agents = newestFirst(records.filter(record => record.kind === 'agent_definition'));
  const leadAgent = agents[0];
  const leadReadiness = deriveAgentReadiness({ agent: leadAgent, records, dirty: false, busy: false, viewer });
  const activeRelease = leadReadiness.active;
  const publishedDeployment = leadAgent && activeRelease && records.find(record => record.kind === 'agent_deployment'
    && record.status === 'published'
    && record.data.agentId === leadAgent.id
    && record.data.versionId === activeRelease.data.versionId
    && record.data.releaseId === activeRelease.id);
  const attention = buildAttention(records, workspace);
  const recommendedAttention = attention.find(item => item.kind !== 'test_failure');
  const activeRuns = records.filter(record => record.kind === 'campaign_run' && ['active', 'running'].includes(record.status));
  const returningWorkspace = agents.length > 0 || workspace.sessions.length > 0 || attention.length > 0 || activeRuns.length > 0;

  const identity = company.status === 'ready' ? company.snapshot.readiness.find(item => item.id === 'identity') : undefined;
  const identityReady = identity?.state === 'ready';
  const companySummary: WorkspaceJourney['company'] = company.status === 'loading'
    ? { name: workspace.organization.name, detail: 'Checking the saved company record…', state: 'loading' }
    : company.status === 'unavailable'
      ? { name: workspace.organization.name, detail: 'Company readiness could not be loaded. Workspace records below are still available.', state: 'unavailable' }
      : {
          name: company.snapshot.profile.publicDisplayName || company.snapshot.profile.name || workspace.organization.name,
          detail: identity?.detail || 'Company identity status is unavailable.',
          state: identityReady ? 'ready' : 'attention',
        };

  const alternatives = [
    { label: viewer ? 'Inspect agents' : 'Create agent', section: 'agents', ...(!viewer ? { focusId: 'new' } : {}) },
    { label: viewer ? 'Inspect company knowledge' : 'Bring company knowledge', section: 'brain/intake' },
  ];

  let recommended: RecommendedAction;
  if (company.status === 'loading') {
    recommended = { kind: 'waiting', title: 'Checking the company record', reason: 'The next suggestion will use the saved company readiness record before interpreting workspace counts.', actionLabel: 'Checking…', evidence: 'Company settings', section: 'Company' };
  } else if (company.status === 'unavailable') {
    recommended = { kind: 'retry', title: 'Company status is unavailable', reason: company.error, actionLabel: 'Try company check again', evidence: 'Company settings request failed; no empty-state assumption was made.', section: 'Company' };
  } else if (!identityReady) {
    recommended = { kind: 'navigate', title: 'Describe your company', reason: identity?.detail || 'Add the company description and industry before treating the workspace profile as prepared.', actionLabel: viewer ? 'Inspect company record' : 'Review company details', evidence: 'Saved company readiness record', section: 'Company' };
  } else if (recommendedAttention) {
    const first = recommendedAttention;
    recommended = { kind: 'navigate', title: first.title, reason: first.reason, actionLabel: `Open ${first.source}`, evidence: `Saved ${first.source.toLowerCase()} record`, section: first.section, ...(first.focusId ? { focusId: first.focusId } : {}) };
  } else if (!leadAgent && approvedSources.length === 0) {
    recommended = { kind: 'navigate', title: 'Bring in the first company source', reason: 'Add and review one useful source so future agents can cite company context. You can also create a voice-only agent first.', actionLabel: viewer ? 'Inspect company knowledge' : 'Bring company knowledge', evidence: 'No approved Company brain source is saved.', section: 'brain/intake' };
  } else if (!leadAgent) {
    recommended = { kind: 'navigate', title: 'Create the first agent', reason: 'Define the representative’s task, AI disclosure, language, and human handoff behavior.', actionLabel: viewer ? 'Inspect agents' : 'Create agent', evidence: `${approvedSources.length} approved Company brain source${approvedSources.length === 1 ? '' : 's'} available`, section: 'agents' };
  } else if (leadReadiness.status !== 'released') {
    const agentName = value(leadAgent.data.name, 'your agent');
    const reason = leadReadiness.status === 'uncaptured' ? 'Your draft has changes; run checks in Publish.'
      : leadReadiness.status === 'outdated' ? 'Knowledge changed; review the sources, then run checks in Publish.'
        : leadReadiness.status === 'failed' ? 'The latest readiness checks need changes. Review them in Publish.'
          : leadReadiness.status === 'ready' ? 'Readiness checks passed for the current saved version. Publish it from the agent.'
            : 'Run readiness checks in Publish, then make the saved version available.';
    recommended = {
      kind: 'navigate',
      title: `Review and publish ${agentName}`,
      reason: `${reason}${activeRelease ? ' An earlier version remains active.' : ''}`,
      actionLabel: 'Open agent',
      evidence: 'Publish keeps the saved version, readiness checks, and browser activation together.',
      section: 'agents',
      focusId: leadAgent.id,
    };
  } else if (activeRuns.length > 0) {
    recommended = { kind: 'navigate', title: 'Review work already in progress', reason: `${activeRuns.length} campaign run${activeRuns.length === 1 ? ' is' : 's are'} recorded as active or running.`, actionLabel: 'Open campaigns', evidence: 'Saved campaign run state; no live provider activity is implied.', section: 'campaigns' };
  } else if (!publishedDeployment) {
    recommended = { kind: 'navigate', title: 'Choose where the agent should be available', reason: 'A browser release is active, but no public deployment is published for this version. Private browser work can continue without one.', actionLabel: viewer ? 'Inspect channels' : 'Choose a channel', evidence: 'An active browser release is not a public deployment.', section: 'deployments', ...(!viewer && activeRelease ? { focusId: `release:${activeRelease.id}` } : {}) };
  } else if (workspace.sessions.length > 0) {
    const recent = newestFirst(workspace.sessions)[0];
    recommended = { kind: 'navigate', title: 'Review the latest conversation', reason: value(recent.summary, 'Inspect the saved transcript, source, participant scope, and any follow-through.'), actionLabel: 'Open conversation', evidence: conversationContext(recent, workspace), section: 'conversations', focusId: recent.id };
  } else {
    recommended = { kind: 'navigate', title: 'Run and review a first conversation', reason: 'Use the active browser release privately, then inspect the saved transcript and participant scope.', actionLabel: 'Open conversations', evidence: 'The public deployment record does not prove a conversation occurred.', section: 'conversations' };
  }

  const steps: WorkspaceJourneyStep[] = [
    {
      id: 'knowledge', label: 'Bring company knowledge', section: 'brain/intake',
      state: approvedSources.length ? 'complete' : 'optional', stateLabel: approvedSources.length ? 'Recorded' : 'Optional',
      detail: approvedSources.length ? `${approvedSources.length} approved source${approvedSources.length === 1 ? '' : 's'} available.` : 'No approved source. A voice-only draft can still be created.',
    },
    {
      id: 'agent', label: 'Create an agent', section: 'agents', ...(leadAgent ? { focusId: leadAgent.id } : {}),
      state: leadAgent ? 'complete' : 'available', stateLabel: leadAgent ? 'Saved' : 'Available',
      detail: leadAgent ? `${value(leadAgent.data.name, 'Agent')} is saved and can be reviewed.` : 'Start with a task and explicit AI disclosure.',
    },
    {
      id: 'test_release', label: 'Test and publish', section: 'agents', ...(leadAgent ? { focusId: leadAgent.id } : {}),
      state: leadReadiness.status === 'released' ? 'complete' : ['failed', 'outdated'].includes(leadReadiness.status) ? 'attention' : leadAgent ? 'current' : 'optional',
      stateLabel: leadReadiness.status === 'released' ? 'Published' : leadReadiness.status === 'ready' ? 'Ready to publish' : leadReadiness.status === 'failed' ? 'Checks need changes' : leadReadiness.status === 'outdated' ? 'Knowledge changed' : leadAgent ? 'Open Publish' : 'After agent',
      detail: leadReadiness.status === 'released' ? 'The current saved agent version is active.'
        : leadReadiness.status === 'uncaptured' ? `Your draft has changes; run checks in Publish.${activeRelease ? ' An earlier version remains active.' : ''}`
          : leadReadiness.status === 'outdated' ? `Knowledge changed; review sources and run checks again.${activeRelease ? ' An earlier version remains active.' : ''}`
            : leadReadiness.status === 'failed' ? `Review the latest failed checks in Publish.${activeRelease ? ' An earlier version remains active.' : ''}`
              : leadReadiness.status === 'ready' ? 'Current readiness checks passed; publish from the agent.'
                : leadAgent ? 'Run configuration checks in Publish.' : 'Save an agent before running checks.',
    },
    {
      id: 'channel', label: 'Choose a channel', section: 'deployments', ...(!viewer && activeRelease ? { focusId: `release:${activeRelease.id}` } : {}),
      state: publishedDeployment ? 'complete' : activeRelease ? 'available' : 'optional', stateLabel: publishedDeployment ? 'Published' : activeRelease ? 'Available' : 'Optional',
      detail: publishedDeployment ? 'A published deployment exists for this agent version.' : activeRelease ? 'A release exists; public deployment remains a separate owner action.' : 'Private browser testing does not require a public channel.',
    },
    {
      id: 'conversations', label: 'Review conversations', section: 'conversations',
      state: workspace.sessions.length ? 'complete' : 'available', stateLabel: workspace.sessions.length ? 'Saved work' : 'Available',
      detail: workspace.sessions.length ? `${workspace.sessions.length} saved conversation${workspace.sessions.length === 1 ? '' : 's'}; transcript presence never verifies participant identity.` : 'Saved conversations will show source, scope, and follow-through.',
    },
  ];

  const recentAgents: RecentAgent[] = agents.slice(0, 4).map(agent => {
    const readiness = deriveAgentReadiness({ agent, records, dirty: false, busy: false, viewer });
    const activeVersion = readiness.active && records.find(record => record.kind === 'agent_version' && record.id === readiness.active?.data.versionId);
    const deployment = readiness.active && records.find(record => record.kind === 'agent_deployment'
      && record.status === 'published'
      && record.data.agentId === agent.id
      && record.data.versionId === readiness.active?.data.versionId
      && record.data.releaseId === readiness.active?.id);
    const activeSuffix = readiness.active ? ` · version ${String(activeVersion?.data.number || '?')} active` : '';
    const status = readiness.status === 'released' ? deployment ? 'Public deployment published' : 'Browser release active'
      : readiness.status === 'uncaptured' ? `Draft changes pending${activeSuffix}`
        : readiness.status === 'outdated' ? `Knowledge changed${activeSuffix}`
          : readiness.status === 'failed' ? `Checks need changes${activeSuffix}`
            : readiness.status === 'ready' ? `Ready to publish${activeSuffix}`
              : readiness.status === 'unchecked' ? `Publish checks not run${activeSuffix}`
                : 'Draft only';
    return { id: agent.id, name: value(agent.data.name, 'Unnamed agent'), role: value(agent.data.role, 'Role not recorded'), status, savedAt: timestamp(agent), section: 'agents', focusId: agent.id };
  });

  const recentConversations: RecentConversation[] = newestFirst(workspace.sessions).slice(0, 4).map(session => ({
    id: session.id,
    title: conversationTitle(session, workspace),
    context: conversationContext(session, workspace),
    status: value(session.responseState, value(session.outcome, value(session.status, 'Saved'))).replaceAll('_', ' '),
    savedAt: timestamp(session),
    identityVerified: false,
    section: 'conversations',
    focusId: session.id,
  }));

  return {
    company: companySummary,
    recommended,
    alternatives: alternatives.filter(item => item.section !== recommended.section || item.focusId !== recommended.focusId),
    steps,
    attention,
    recentAgents,
    recentConversations,
    returningWorkspace,
  };
}
