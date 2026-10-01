'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Ban,
  CheckCircle2,
  Clock3,
  Headphones,
  Mail,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  SkipForward,
} from 'lucide-react';
import type { PlatformViewProps, WorkspaceData } from '@/lib/platform/contracts';
import type { PlatformRecord } from '@/lib/platform/records';
import { CampaignDelivery } from './campaign-delivery';
import { CampaignResults } from './campaign-results';
import { CampaignVoiceStudio } from './campaign-voice-studio';
import styles from './campaign-run-panel.module.css';

type Row = PlatformRecord<Record<string, unknown>>;
type Recipient = {
  contactId: string;
  name?: string;
  email?: string;
  status?: string;
  evidence?: string;
  sessionId?: string;
  completedAt?: string;
  delivery?: {
    receiptId: string;
    state: 'accepted' | 'rejected' | 'uncertain';
    providerReference?: string;
    reason?: string;
    recordedAt: string;
  };
};
type DeliveryItem = {
  contactId: string;
  name: string;
  email: string;
  status: 'ready' | 'sending' | 'accepted' | 'rejected' | 'uncertain';
  receipt?: { reason?: string; providerReference?: string };
};
type DeliveryStatus = { runId: string; runStatus: string; recipients: DeliveryItem[]; runProjectionPending?: boolean };

export interface CampaignRunPanelProps {
  campaign: PlatformRecord;
  records: PlatformRecord[];
  workspace: WorkspaceData;
  act: PlatformViewProps['act'];
  busy: boolean;
  navigate: PlatformViewProps['navigate'];
  onRefresh?: () => Promise<void>;
  onCallActiveChange?: (active: boolean) => void;
  mode?: 'run' | 'results';
  onNavigateRun?: () => void;
}

const text = (value: unknown) => typeof value === 'string' ? value : '';
const sentence = (value: string) => value ? value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ') : 'Unknown';
const shortId = (value: string) => value ? value.slice(0, 8) : 'Unknown';
const timestamp = (value: unknown) => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return 'Time unavailable';
  return new Date(value).toLocaleString();
};
const channelName = (value: unknown) => value === 'browser' ? 'Browser voice' : value === 'email' ? 'Connected email' : value === 'manual_email' ? 'Manual email' : 'Unknown channel';
const recipientTone = (recipient: Recipient) => recipient.status === 'completed' ? 'success' : recipient.delivery?.state === 'accepted' || recipient.status === 'queued' ? 'active' : recipient.status === 'skipped' ? 'muted' : 'warning';
const recipientStatus = (recipient: Recipient) => recipient.status === 'delivery_settled'
  ? recipient.delivery?.state === 'accepted' ? 'Accepted by provider' : recipient.delivery?.state === 'rejected' ? 'Rejected' : recipient.delivery?.state === 'uncertain' ? 'Uncertain' : 'Dispatch state unknown'
  : sentence(recipient.status || '');
const runTone = (status: string) => status === 'active' ? 'success' : status === 'paused' ? 'warning' : status === 'cancelled' ? 'danger' : 'muted';

function canonicalRun(campaignId: string, records: PlatformRecord[]): Row | undefined {
  return (records.filter(record => record.kind === 'campaign_run' && record.data.campaignId === campaignId) as Row[])
    .sort((left, right) => {
      const leftAt = Date.parse(text(left.data.launchedAt) || left.createdAt) || 0;
      const rightAt = Date.parse(text(right.data.launchedAt) || right.createdAt) || 0;
      return rightAt - leftAt || right.revision - left.revision || right.id.localeCompare(left.id);
    })[0];
}

function ReadOnlyDelivery({ runId }: { runId: string }) {
  const [result, setResult] = useState<DeliveryStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/campaign-delivery?runId=${encodeURIComponent(runId)}`, { cache: 'no-store', signal });
      const value = await response.json() as DeliveryStatus & { error?: string };
      if (!response.ok) throw new Error(value.error || 'Could not load email delivery status.');
      setResult(value);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(cause instanceof Error ? cause.message : 'Could not load email delivery status.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [runId]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return <section className={styles.deliverySection} aria-label="Connected email delivery status">
    <div className={styles.sectionHeading}>
      <div><h3>Connected email delivery</h3><p>Read-only status. Provider acceptance does not confirm inbox delivery.</p></div>
      <button type="button" className={styles.iconButton} onClick={() => void load()} disabled={loading} aria-label="Refresh email delivery status"><RefreshCw size={16} aria-hidden="true"/></button>
    </div>
    {loading && !result && <p className={styles.subtle} role="status">Loading delivery status…</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {result?.runProjectionPending && <p className={styles.notice} role="status">Delivery recorded; the run summary is pending reconciliation. Refresh delivery status.</p>}
    {result && <div className={styles.deliveryList}>{result.recipients.map(item => <div className={styles.deliveryRow} key={item.contactId}>
      <span><strong>{item.name || 'Unnamed recipient'}</strong><small>{item.email || 'Email unavailable'}</small>{item.receipt?.reason && <small>{item.receipt.reason}</small>}</span>
      <span className={styles.badge} data-tone={item.status === 'accepted' ? 'success' : item.status === 'uncertain' || item.status === 'rejected' ? 'danger' : 'active'}>{item.status === 'accepted' ? 'Accepted by provider' : item.status === 'uncertain' ? 'Uncertain — inspect mailbox' : sentence(item.status)}</span>
    </div>)}</div>}
  </section>;
}

export function CampaignRunPanel({ campaign, records, workspace, act, busy, navigate, onRefresh, onCallActiveChange, mode = 'run', onNavigateRun }: CampaignRunPanelProps) {
  const campaignRuns = records.filter(record => record.kind === 'campaign_run' && record.data.campaignId === campaign.id);
  const run = useMemo(() => canonicalRun(campaign.id, records), [campaign.id, records]);
  const snapshot = run?.data.snapshot && typeof run.data.snapshot === 'object' ? run.data.snapshot as Record<string, unknown> : undefined;
  const hasRecipientList = Array.isArray(run?.data.recipients);
  const recipients = hasRecipientList ? run!.data.recipients as Recipient[] : [];
  const channel = text(snapshot?.channel);
  const viewer = workspace.user.role === 'viewer';
  const [selectedContactId, setSelectedContactId] = useState('');
  const [evidence, setEvidence] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [callActive, setCallActive] = useState(false);
  const reportCallActive = useCallback((active: boolean) => {
    setCallActive(active);
    onCallActiveChange?.(active);
  }, [onCallActiveChange]);

  const release = records.find(record => record.kind === 'release' && record.id === text(snapshot?.agentReleaseId));
  const version = records.find(record => record.kind === 'agent_version' && record.id === release?.data.versionId);
  const releaseLabel = release ? `${text(release.data.name) || 'Released agent'}${version ? ` · version ${String(version.data.number || '?')}` : ''}` : text(snapshot?.agentReleaseId) ? `Release ${shortId(text(snapshot?.agentReleaseId))}` : 'No release required';
  const matchingSessions = workspace.sessions.filter(session => session.source === 'browser_voice'
    && session.campaignRunId === run?.id
    && session.contactId === selectedContactId
    && session.releaseId === text(snapshot?.agentReleaseId)
    && (!release?.data.versionId || session.agentVersionId === release.data.versionId));
  const selected = recipients.find(recipient => recipient.contactId === selectedContactId);
  const boundSessionId = selected?.sessionId || '';
  const boundSession = workspace.sessions.find(item => item.id === boundSessionId);
  const turns = (Array.isArray(boundSession?.transcript) ? boundSession.transcript : []).flatMap(turn => {
    if (!turn || typeof turn !== 'object') return [];
    const item = turn as Record<string, unknown>;
    if (typeof item.text !== 'string') return [];
    return [{ role: text(item.role) || 'unknown', text: item.text, ...(typeof item.receivedAt === 'string' ? { receivedAt: item.receivedAt } : {}) }];
  });

  useEffect(() => {
    setSelectedContactId(current => recipients.some(recipient => recipient.contactId === current) ? current : recipients.find(recipient => recipient.status === 'queued')?.contactId || recipients[0]?.contactId || '');
  }, [run?.id, recipients.map(recipient => recipient.contactId).join('|')]);
  useEffect(() => { setEvidence(''); setSessionId(''); setError(''); setNotice(''); }, [selectedContactId, run?.id]);

  if (!run) return <section className={styles.panel} aria-label="Campaign run">
    <div className={styles.empty}><Clock3 size={24} aria-hidden="true"/><div><h2>No saved run</h2><p>This campaign has not created an operational run yet. Complete review and launch in the Review stage.</p></div></div>
  </section>;

  const completed = hasRecipientList ? recipients.filter(item => item.status === 'completed').length : undefined;
  const skipped = hasRecipientList ? recipients.filter(item => item.status === 'skipped').length : undefined;
  const queued = hasRecipientList ? recipients.filter(item => item.status === 'queued').length : undefined;
  const deliverySettled = hasRecipientList ? recipients.filter(item => item.status === 'delivery_settled' && ['accepted', 'rejected', 'uncertain'].includes(item.delivery?.state || '')).length : undefined;
  const deliveryAccepted = hasRecipientList ? recipients.filter(item => item.status === 'delivery_settled' && item.delivery?.state === 'accepted').length : undefined;
  const deliveryRejected = hasRecipientList ? recipients.filter(item => item.status === 'delivery_settled' && item.delivery?.state === 'rejected').length : undefined;
  const deliveryUncertain = hasRecipientList ? recipients.filter(item => item.status === 'delivery_settled' && item.delivery?.state === 'uncertain').length : undefined;
  const unknown = hasRecipientList ? recipients.filter(item => !['queued', 'completed', 'skipped', 'delivery_settled'].includes(item.status || '') || (item.status === 'delivery_settled' && !['accepted', 'rejected', 'uncertain'].includes(item.delivery?.state || ''))).length : undefined;
  const settled = channel === 'email' ? deliverySettled ?? 0 : (completed ?? 0) + (skipped ?? 0);
  const resultsRecorded = settled;
  const resultsComplete = hasRecipientList && recipients.length > 0 && resultsRecorded === recipients.length;
  const runCanContinue = run.status === 'active' || run.status === 'paused';
  const lockedRevision = typeof run.data.campaignRevision === 'number' ? run.data.campaignRevision : undefined;
  const sourceCount = Array.isArray(snapshot?.sourceAnchors) ? snapshot.sourceAnchors.length : undefined;
  const lockedName = text(snapshot?.name) || text(campaign.data.name) || 'Campaign run';
  const lockedObjective = text(snapshot?.objective) || 'Objective unavailable in the launch snapshot.';
  const disabled = busy || Boolean(pending) || callActive;

  const refresh = async () => {
    if (disabled) return;
    setPending('refresh'); setError('');
    try { await (onRefresh ? onRefresh() : act('workspace.refresh')); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not refresh this run.'); }
    finally { setPending(''); }
  };
  const perform = async (action: string, body: Record<string, unknown>, success: string) => {
    if (viewer || disabled) return;
    setPending(action); setError(''); setNotice('');
    try {
      await act(action, body);
      setNotice(success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The campaign action could not be completed. Refresh and try again.');
    } finally { setPending(''); }
  };
  const cancel = () => {
    if (!window.confirm(`Cancel the run for “${lockedName}”? Queued recipients will remain unsent and this run cannot resume.`)) return;
    void perform('campaign.cancel', { runId: run.id }, 'Run cancelled. No new recipient work can start from this run.');
  };
  const saveResult = async (outcome: 'completed' | 'skipped') => {
    if (!selected || !evidence.trim()) { setError(outcome === 'completed' ? 'Add concrete evidence before marking this recipient completed.' : 'Add a reason before skipping this recipient.'); return; }
    if (channel === 'browser' && outcome === 'completed' && !sessionId) { setError('Choose the saved conversation issued for this recipient, release and run.'); return; }
    await perform('campaign.result', { runId: run.id, contactId: selected.contactId, outcome, evidence: evidence.trim(), ...(outcome === 'completed' && channel === 'browser' ? { sessionId } : {}) }, outcome === 'completed' ? 'Completion and its evidence were recorded.' : 'Recipient skipped with the recorded reason.');
  };
  const openCallDesk = () => {
    const desk = document.querySelector<HTMLElement>('[aria-label="Campaign browser call"]');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    desk?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    desk?.querySelector<HTMLElement>('button, select, input')?.focus({ preventScroll: true });
  };

  return <div className={styles.stack}>
    <section className={styles.panel} aria-label="Campaign run" aria-busy={Boolean(pending)} hidden={mode === 'results'}>
      <header className={styles.header}>
        <div><div className={styles.titleLine}><h2>{lockedName}</h2><span className={styles.badge} data-tone={runTone(run.status)}>{sentence(run.status)}</span></div><p>{lockedObjective}</p></div>
        <button className={styles.refresh} type="button" disabled={disabled} onClick={() => void refresh()}><RefreshCw size={15} aria-hidden="true"/>{pending === 'refresh' ? 'Refreshing…' : 'Refresh run'}</button>
      </header>

      <div className={styles.runMeta}>
        <span>{channel === 'email' ? <Mail size={16} aria-hidden="true"/> : <Headphones size={16} aria-hidden="true"/>}<strong>{channelName(channel)}</strong></span>
        <span><ShieldCheck size={16} aria-hidden="true"/><strong>Snapshot locked</strong> at campaign revision {lockedRevision ?? 'unknown'}</span>
        <span><Clock3 size={16} aria-hidden="true"/><strong>Launched</strong> {timestamp(run.data.launchedAt || run.createdAt)}</span>
        {campaignRuns.length > 1 && <span><strong>Latest run</strong> of {campaignRuns.length} saved runs</span>}
      </div>

      <div className={styles.progressBlock}>
        <div className={styles.progressHeading}><div><strong>{channel === 'email' ? 'Delivery progress' : 'Run progress'}</strong><span>{hasRecipientList ? channel === 'email' ? `${settled} of ${recipients.length} dispatches finished` : `${settled} of ${recipients.length} recipients settled` : 'Recipient progress unavailable'}</span></div>{hasRecipientList && recipients.length > 0 && <strong>{Math.round((settled / recipients.length) * 100)}%</strong>}</div>
        {hasRecipientList && recipients.length > 0 ? <progress value={settled} max={recipients.length}>{settled} of {recipients.length}</progress> : <div className={styles.unknownBar}>Unknown</div>}
        <dl className={styles.counts}>
          {channel === 'email' ? <><div><dt>Ready</dt><dd>{queued ?? '—'}</dd></div><div><dt>Accepted</dt><dd>{deliveryAccepted ?? '—'}</dd></div><div><dt>Rejected</dt><dd>{deliveryRejected ?? '—'}</dd></div><div><dt>Uncertain</dt><dd>{deliveryUncertain ?? '—'}</dd></div></> : <><div><dt>Queued</dt><dd>{queued ?? '—'}</dd></div><div><dt>Completed</dt><dd>{completed ?? '—'}</dd></div><div><dt>Skipped</dt><dd>{skipped ?? '—'}</dd></div></>}{unknown !== undefined && unknown > 0 && <div><dt>Unknown state</dt><dd>{unknown}</dd></div>}
        </dl>
        {channel === 'email' && <p className={styles.scopeNote}>{resultsComplete ? 'Dispatch finished for every recipient.' : 'Dispatch is still in progress.'} Provider acceptance is not a business outcome or proof of inbox delivery.</p>}
      </div>

      {viewer ? <p className={styles.readOnly}>Read-only access. An owner or operator can pause, resume, cancel, send, call, and record results.</p> : <div className={styles.runActions}>
        {run.status === 'active' && <button type="button" onClick={() => void perform('campaign.pause', { runId: run.id }, 'Run paused. No new recipient work can start until it resumes.')} disabled={disabled}><Pause size={15} aria-hidden="true"/>{pending === 'campaign.pause' ? 'Pausing…' : 'Pause run'}</button>}
        {run.status === 'paused' && <button type="button" onClick={() => void perform('campaign.resume', { runId: run.id }, 'Run resumed. Queued recipient work is available again.')} disabled={disabled}><Play size={15} aria-hidden="true"/>{pending === 'campaign.resume' ? 'Resuming…' : 'Resume run'}</button>}
        {['active', 'paused'].includes(run.status) && <button className={styles.dangerButton} type="button" onClick={cancel} disabled={disabled}><Ban size={15} aria-hidden="true"/>{pending === 'campaign.cancel' ? 'Cancelling…' : 'Cancel run'}</button>}
        {callActive && <p className={styles.callGuard} role="status">End the active browser call before changing the run or recording a result. The End call controls remain available in the call desk.</p>}
      </div>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}

      <details className={styles.snapshot}>
        <summary>Launch snapshot and authority</summary>
        <dl><div><dt>Run</dt><dd>{run.id}</dd></div><div><dt>Campaign revision</dt><dd>{lockedRevision ?? 'Unknown'}</dd></div><div><dt>Released agent</dt><dd>{releaseLabel}</dd></div><div><dt>Release record</dt><dd>{text(snapshot?.agentReleaseId) || 'No release required'}</dd></div><div><dt>Plan authority</dt><dd>{text(snapshot?.planId) || 'Manual campaign · no plan record'}</dd></div><div><dt>Approved source bindings</dt><dd>{sourceCount === undefined ? 'Unknown in snapshot' : `${sourceCount} locked`}</dd></div><div><dt>Audience at launch</dt><dd>{hasRecipientList ? `${recipients.length} recipients` : 'Unknown'}</dd></div><div><dt>Launched by</dt><dd>{text(run.data.launchedBy) === workspace.user.id ? 'You' : text(run.data.launchedBy) || 'Unknown operator'}</dd></div></dl>
        {text(snapshot?.subject) && <div className={styles.savedCopy}><strong>Subject</strong><p>{text(snapshot?.subject)}</p></div>}
        {text(snapshot?.message) && <div className={styles.savedCopy}><strong>{channel === 'browser' ? 'Speaking brief' : 'Message'}</strong><p>{text(snapshot?.message)}</p></div>}
        {text(snapshot?.callBrief) && <div className={styles.savedCopy}><strong>Representative brief</strong><p>{text(snapshot?.callBrief)}</p></div>}
        <p className={styles.scopeNote}>This run keeps the exact reviewed audience, content, source bindings and release captured at launch.</p>
      </details>
    </section>

    <section className={`${styles.panel} ${styles.resultsSummary}`} aria-label="Campaign results summary" hidden={mode !== 'results'}>
      <div><h2>{resultsRecorded === 0 ? channel === 'email' ? 'No dispatch records yet' : 'No recorded results yet' : resultsComplete ? channel === 'email' ? 'Dispatch finished' : 'Recipient results recorded' : channel === 'email' ? 'Dispatch records are partial' : 'Results are partial'}</h2><p>{!hasRecipientList ? 'Recipient results are unavailable. Refresh the run before relying on this view.' : channel === 'email' ? `${resultsRecorded} of ${recipients.length} recipients have a terminal provider state. Accepted means the provider accepted the request; it does not establish delivery, reading, or business success.` : `${resultsRecorded} of ${recipients.length} recipients have a recorded completion or skip reason.`}</p></div>
      <div className={styles.resultsActions}><button type="button" className={styles.refresh} disabled={disabled} onClick={() => void refresh()}><RefreshCw size={15} aria-hidden="true"/>{pending === 'refresh' ? 'Refreshing…' : 'Refresh results'}</button>{runCanContinue && (queued ?? 0) > 0 && <button type="button" className={styles.primaryButton} onClick={onNavigateRun}>Return to Run · {queued} {channel === 'email' ? 'ready' : 'queued'}</button>}</div>
    </section>

    <section className={styles.panel} aria-label="Campaign recipients">
      <div className={styles.sectionHeading}><div><h3>{mode === 'results' ? 'Recipient evidence' : 'Recipients'}</h3><p>{mode === 'results' ? 'Select a person to review recorded evidence, delivery state, and saved conversation results.' : 'Select a person to see the saved evidence, conversation, and next valid action.'}</p></div><span>{hasRecipientList ? `${recipients.length} total` : 'Count unknown'}</span></div>
      {!hasRecipientList ? <p className={styles.emptyText}>Recipient data is unavailable for this run. Refresh before taking action.</p> : recipients.length === 0 ? <p className={styles.emptyText}>No recipients were saved in this run.</p> : <div className={styles.recipientLayout}>
        <div className={styles.recipientList} role="group" aria-label="Campaign recipients">{recipients.map(recipient => <button type="button" disabled={callActive} aria-current={recipient.contactId === selectedContactId ? 'true' : undefined} onClick={() => setSelectedContactId(recipient.contactId)} key={recipient.contactId}>
          <span><strong>{recipient.name || 'Unnamed recipient'}</strong><small>{recipient.email || `Customer ${shortId(recipient.contactId)}`}</small></span>
          <span className={styles.badge} data-tone={recipientTone(recipient)}>{recipientStatus(recipient)}</span>
        </button>)}</div>
        {selected && <div className={styles.recipientDetail}>
          <div className={styles.personHeading}><div><h3>{selected.name || 'Unnamed recipient'}</h3><p>{selected.email || 'Email unavailable'}</p></div><button type="button" className={styles.textButton} onClick={() => navigate('customers', selected.contactId)}>Open customer <ArrowUpRight size={14} aria-hidden="true"/></button></div>
          <div className={styles.nextAction}>
            {selected.status === 'completed' || selected.delivery?.state === 'accepted' ? <CheckCircle2 size={18} aria-hidden="true"/> : selected.status === 'skipped' ? <SkipForward size={18} aria-hidden="true"/> : <Clock3 size={18} aria-hidden="true"/>}
            <div><strong>{selected.status === 'delivery_settled' ? `Dispatch finished · ${recipientStatus(selected).toLowerCase()}` : selected.status === 'completed' ? 'Completion recorded' : selected.status === 'skipped' ? 'Skipped with a reason' : selected.status === 'queued' && mode === 'results' ? runCanContinue ? 'No result recorded yet' : 'No result was recorded before the run ended' : selected.status === 'queued' && run.status === 'active' ? channel === 'browser' ? 'Start the browser conversation below' : channel === 'email' ? 'Review the delivery lane below' : 'Record the manual email result' : selected.status === 'queued' && run.status === 'paused' ? 'Resume the run to continue' : selected.status === 'queued' ? 'This run no longer accepts recipient work' : 'Recipient state is unknown'}</strong>
              <p>{selected.status === 'delivery_settled' ? selected.delivery?.reason || (selected.delivery?.state === 'accepted' ? 'The provider accepted this request. Delivery, reading, and business outcome remain unknown.' : 'The provider returned a terminal dispatch result.') : selected.status === 'queued' && mode === 'results' ? runCanContinue ? `Return to Run to ${channel === 'browser' ? 'start the browser conversation' : channel === 'email' ? 'review and send this email' : 'record this manual email task'}.` : 'The run is no longer active, so this recipient has no recorded result or available next action.' : selected.status === 'queued' && channel === 'browser' ? 'The queue requires an operator to choose this person and press Start. It does not dial a phone or place calls automatically.' : selected.status === 'queued' && channel === 'email' ? 'Each Send email click creates one provider request. Uncertain outcomes are held for inspection and never resent automatically.' : selected.evidence || 'No evidence or reason is saved.'}</p></div>
          </div>
          {selected.delivery?.recordedAt && <p className={styles.completedAt}>Dispatch recorded {timestamp(selected.delivery.recordedAt)}{selected.delivery.receiptId ? ` · receipt ${shortId(selected.delivery.receiptId)}` : ''}</p>}
          {selected.status === 'queued' && mode === 'results' && runCanContinue && <button type="button" className={styles.primaryButton} onClick={onNavigateRun}>Return to Run</button>}
          {selected.status === 'queued' && mode === 'run' && run.status === 'active' && !viewer && channel === 'browser' && <button type="button" className={styles.primaryButton} onClick={openCallDesk}><Headphones size={15} aria-hidden="true"/>Open browser call desk</button>}
          {boundSessionId && <button type="button" className={styles.textButton} onClick={() => navigate('conversations', boundSessionId)}>Open saved conversation <ArrowUpRight size={14} aria-hidden="true"/></button>}
          {selected.completedAt && <p className={styles.completedAt}>Recorded {timestamp(selected.completedAt)}</p>}

          {selected.status === 'queued' && mode === 'run' && run.status === 'active' && channel !== 'email' && !viewer && <div className={styles.resultForm}>
            <label>Evidence or reason<textarea value={evidence} maxLength={1000} onChange={event => setEvidence(event.target.value)} placeholder={channel === 'browser' ? 'What in the saved conversation supports completion, or why should this person be skipped?' : 'What confirms the manual email work, or why should this person be skipped?'} /></label>
            {channel === 'browser' && <label>Saved conversation<select value={sessionId} onChange={event => setSessionId(event.target.value)}><option value="">Choose a matching conversation</option>{matchingSessions.map(session => <option key={session.id} value={session.id}>{timestamp(session.createdAt)} · {text(session.provider) || 'Provider unknown'}</option>)}</select><small>Only conversations issued for this run, recipient, release and agent version are eligible.</small></label>}
            {channel === 'browser' && matchingSessions.length === 0 && <p className={styles.scopeNote}>Complete and save a browser conversation from the call desk before recording completion.</p>}
            <div className={styles.resultActions}><button type="button" className={styles.primaryButton} disabled={disabled || !evidence.trim() || (channel === 'browser' && !sessionId)} onClick={() => void saveResult('completed')}>{pending === 'campaign.result' ? 'Saving…' : 'Mark completed'}</button><button type="button" disabled={disabled || !evidence.trim()} onClick={() => void saveResult('skipped')}>Skip with reason</button></div>
          </div>}
          {boundSession && <CampaignResults key={`campaign-results:${boundSession.id}`} sessionId={boundSession.id} turns={turns}/>}
        </div>}
      </div>}
    </section>

    {channel === 'email' && (viewer ? <div hidden={mode === 'results'}><ReadOnlyDelivery runId={run.id}/></div> : <div className={styles.embedded} hidden={mode === 'results'}><CampaignDelivery runId={run.id} onRefresh={onRefresh}/></div>)}
    {channel === 'browser' && run.status === 'active' && (viewer ? <section id="campaign-call-desk" className={styles.panel} hidden={mode === 'results'}><div className={styles.empty}><Headphones size={24} aria-hidden="true"/><div><h2>Browser call desk</h2><p>Read-only access. An owner or operator must select the recipient and explicitly start the browser conversation.</p></div></div></section> : <div className={styles.embedded} hidden={mode === 'results'}><CampaignVoiceStudio runId={run.id} records={records} workspace={workspace} controlledContactId={selected?.status === 'queued' ? selected.contactId : ''} onRefresh={onRefresh} onActiveChange={reportCallActive}/></div>)}
  </div>;
}
