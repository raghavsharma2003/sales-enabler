'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Activity, AlertCircle, ArrowUpRight, Bot, CheckCircle2, Clock3, Gauge, RefreshCw, ServerCog } from 'lucide-react';
import type { OperationsQueueSummary, OperationsServiceHealth, OperationsStatus } from '../../lib/operations/status';
import type { PlatformViewProps } from '../../lib/platform/contracts';
import type { UsageSnapshot, VoiceAttemptState } from '../../lib/usage/contracts';
import { workspaceHref } from '../../lib/platform/navigation';
import styles from './usage-view.module.css';

type ResourceState<T> = { data?: T; error?: string; status?: number; loading: boolean };
type RefreshMode = 'initial' | 'manual' | 'poll';

const STATUS_TIMEOUT_MS = 12_000;

class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function read<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', signal });
  let value: Record<string, unknown> = {};
  try { value = await response.json() as Record<string, unknown>; } catch { /* The status remains useful without a JSON body. */ }
  if (!response.ok) throw new RequestError(response.status, typeof value.error === 'string' ? value.error : 'This status is temporarily unavailable. Refresh to try again.');
  return value as T;
}

const nonNegative = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const measure = (value: unknown): string => {
  const safe = nonNegative(value);
  return safe === null ? 'Unknown' : new Intl.NumberFormat().format(safe);
};
const age = (seconds: number | null): string => {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return 'Time unavailable';
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${Math.floor(seconds)} seconds ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
};
const dateTime = (value: string, options: Intl.DateTimeFormatOptions = {}): string => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Intl.DateTimeFormat(undefined, options).format(new Date(parsed)) : 'Time unavailable';
};
const attemptLabel: Record<VoiceAttemptState, string> = {
  reserved: 'Reserved', connecting: 'Connecting', active: 'Live', stopping: 'Ending', closed: 'Closed', uncertain: 'Needs review',
};
const serviceState: Record<OperationsServiceHealth['state'], string> = {
  disabled: 'Disabled', fresh: 'Recently reported', stale: 'Unavailable or stale', unknown: 'No verified report',
};

function activation(access: UsageSnapshot['access']) {
  if (access.mode === 'hosted') return access.allowed ? 'Hosted AI is active' : 'Hosted AI is awaiting platform approval';
  if (access.mode === 'local') return access.allowed ? 'Local development access' : 'Local development access unavailable';
  return access.allowed ? 'Test environment access' : 'Test environment access unavailable';
}

function QuotaRow({ label, value, limit, detail }: { label: string; value: unknown; limit?: unknown; detail: string }) {
  const safeLimit = nonNegative(limit);
  return <div className={styles.quotaRow}>
    <div><strong>{label}</strong><p>{detail}</p></div>
    <span className={styles.measure}>{measure(value)}{safeLimit !== null && <small> of {measure(safeLimit)}</small>}</span>
  </div>;
}

function SectionLink({ destination, navigate, children }: { destination: string; navigate: PlatformViewProps['navigate']; children: ReactNode }) {
  return <a href={workspaceHref(destination)} onClick={event => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate(destination); }}>{children}<ArrowUpRight size={13} aria-hidden="true" /></a>;
}

function ServiceRow({ service, navigate }: { service: OperationsServiceHealth; navigate: PlatformViewProps['navigate'] }) {
  return <article className={styles.serviceRow}>
    <span className={styles.serviceMark} data-state={service.state} aria-hidden="true" />
    <div>
      <div className={styles.serviceTitle}><strong>{service.label}</strong><span data-state={service.state}>{serviceState[service.state]}</span></div>
      <p>{service.id === 'private-voice-supervisor'
        ? 'Closes expired private voice connections. Its heartbeat does not prove that audio connected or played.'
        : service.id === 'automation-worker'
          ? 'Checks explicitly enabled email schedules. A recent report does not prove provider acceptance or delivery.'
          : service.id === 'channel-worker'
            ? 'Processes authorized channel replies. A recent report does not prove message delivery.'
            : 'Prepares reviewable learning proposals. A recent report does not approve or apply them.'}</p>
      <small>{service.state === 'disabled' ? 'Off in platform configuration' : service.lastHeartbeatAt ? `Last verified report ${age(service.ageSeconds)}` : 'No valid heartbeat has been recorded'}</small>
    </div>
    <SectionLink destination={service.destination} navigate={navigate}>Open {service.destination === 'Deployments' ? 'Channels' : service.destination}</SectionLink>
  </article>;
}

function WorkRow({ queue, navigate }: { queue: OperationsQueueSummary; navigate: PlatformViewProps['navigate'] }) {
  return <div className={styles.workRow}>
    <div><strong>{queue.label}</strong><p>{queue.count === 0 ? 'No saved work is waiting in this workspace.' : queue.oldestAgeSeconds === null ? 'Oldest saved time is unavailable.' : `Oldest saved item ${age(queue.oldestAgeSeconds)}.`}</p></div>
    <span className={styles.workCount}>{measure(queue.count)}</span>
    <SectionLink destination={queue.destination} navigate={navigate}>Review</SectionLink>
  </div>;
}

export function UsageView({ workspace, navigate }: PlatformViewProps) {
  const [usage, setUsage] = useState<ResourceState<UsageSnapshot>>({ loading: true });
  const [operations, setOperations] = useState<ResourceState<OperationsStatus>>({ loading: true });
  const controller = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const requestActive = useRef(false);

  const refresh = useCallback(async (mode: RefreshMode = 'manual') => {
    if (requestActive.current && mode === 'poll') return;
    if (requestActive.current) controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    const version = ++requestVersion.current;
    requestActive.current = true;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; current.abort(); }, STATUS_TIMEOUT_MS);
    setUsage(previous => ({ ...previous, loading: true, error: undefined, status: undefined }));
    setOperations(previous => ({ ...previous, loading: true, error: undefined, status: undefined }));
    let nextUsage: PromiseSettledResult<UsageSnapshot>;
    let nextOperations: PromiseSettledResult<OperationsStatus>;
    try {
      [nextUsage, nextOperations] = await Promise.allSettled([
        read<UsageSnapshot>('/api/usage', current.signal),
        read<OperationsStatus>('/api/operations/status', current.signal),
      ]);
    } finally {
      window.clearTimeout(timeout);
      if (version === requestVersion.current) {
        requestActive.current = false;
        if (controller.current === current) controller.current = null;
      }
    }
    if (version !== requestVersion.current || (current.signal.aborted && !timedOut)) return;
    const timeoutMessage = 'Status refresh did not finish within 12 seconds. Try again.';
    setUsage(previous => nextUsage.status === 'fulfilled'
      ? { data: nextUsage.value, loading: false }
      : {
          data: nextUsage.reason instanceof RequestError && nextUsage.reason.status === 503 ? undefined : previous.data,
          loading: false,
          error: timedOut ? timeoutMessage : nextUsage.reason instanceof Error ? nextUsage.reason.message : 'Usage is unavailable.',
          status: nextUsage.reason instanceof RequestError ? nextUsage.reason.status : undefined,
        });
    setOperations(previous => nextOperations.status === 'fulfilled'
      ? { data: nextOperations.value, loading: false }
      : { data: previous.data, loading: false, error: timedOut ? timeoutMessage : nextOperations.reason instanceof Error ? nextOperations.reason.message : 'Service status is unavailable.', status: nextOperations.reason instanceof RequestError ? nextOperations.reason.status : undefined });
  }, []);

  useEffect(() => { void refresh('initial'); return () => controller.current?.abort(); }, [refresh]);
  const shouldPoll = useMemo(() => Boolean(
    usage.data?.voice.live
    || usage.data?.voice.attemptsSummary.some(attempt => !['closed'].includes(attempt.state))
    || operations.data?.queues.some(queue => queue.count > 0),
  ), [operations.data, usage.data]);
  useEffect(() => {
    if (!shouldPoll) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      if (document.visibilityState === 'visible') {
        if (!interval) interval = setInterval(() => void refresh('poll'), 15_000);
      } else if (interval) { clearInterval(interval); interval = undefined; }
    };
    const onVisibility = () => { const wasHidden = !interval; sync(); if (wasHidden && document.visibilityState === 'visible') void refresh('poll'); };
    sync(); document.addEventListener('visibilitychange', onVisibility);
    return () => { if (interval) clearInterval(interval); document.removeEventListener('visibilitychange', onVisibility); };
  }, [refresh, shouldPoll]);

  const issues = useMemo(() => {
    if (!operations.data) return [];
    const services = new Map(operations.data.services.map(service => [service.id, service]));
    const messages: Array<{ id: string; text: string; destination: string; action: string }> = [];
    for (const queue of operations.data.queues) {
      const service = services.get(queue.serviceId);
      if (!queue.count || service?.state === 'fresh') continue;
      const text = queue.id === 'automation-schedules'
        ? `${queue.count} enabled ${queue.count === 1 ? 'schedule is' : 'schedules are'} saved while the scheduled email worker is ${service ? serviceState[service.state].toLowerCase() : 'unavailable'}. Review scheduled times before assuming work is delayed.`
        : `${queue.count} ${queue.id === 'channel-replies' ? 'channel reply' : 'learning job'}${queue.count === 1 ? ' is' : 's are'} waiting while its worker is ${service ? serviceState[service.state].toLowerCase() : 'unavailable'}.`;
      messages.push({ id: queue.id, text, destination: queue.destination, action: queue.destination === 'Deployments' ? 'Open Channels' : 'Open Automations' });
    }
    const supervisor = services.get('private-voice-supervisor');
    if (usage.data?.voice.live && supervisor?.state !== 'fresh') messages.unshift({ id: 'voice-supervision', text: `${usage.data.voice.live} voice ${usage.data.voice.live === 1 ? 'connection is' : 'connections are'} active or unresolved while the private voice supervisor is ${supervisor ? serviceState[supervisor.state].toLowerCase() : 'unavailable'}.`, destination: 'Deployments', action: 'Open Channels' });
    return messages;
  }, [operations.data, usage.data]);

  return <main className={`pc-page ${styles.page}`} aria-labelledby="usage-title">
    <header className={styles.header}>
      <div><h1 id="usage-title">Usage &amp; services</h1><p>Current workspace allowances, active connection state, and recent background service reports.</p></div>
      <div className={styles.headerActions}>{workspace.user.role === 'viewer' && <span className={styles.readOnly}>Read only</span>}<button className="pc-button" type="button" aria-label={usage.loading || operations.loading ? 'Restart status refresh' : 'Refresh status'} onClick={() => void refresh('manual')}><RefreshCw size={15} className={usage.loading || operations.loading ? 'spin' : ''} aria-hidden="true" />Refresh</button></div>
    </header>

    {issues.length > 0 && <section className={styles.attention} aria-labelledby="operations-attention"><AlertCircle size={19} aria-hidden="true" /><div><h2 id="operations-attention">Work needs an operator check</h2>{issues.map(issue => <p key={issue.id}>{issue.text} <SectionLink destination={issue.destination} navigate={navigate}>{issue.action}</SectionLink></p>)}</div></section>}

    <div className={styles.columns}>
      <section className={styles.primaryColumn} aria-labelledby="allowances-title">
        <div className={styles.sectionHeading}><div><h2 id="allowances-title">AI and voice allowances</h2><p>Daily values use UTC. They are admission controls and operational evidence, not charges.</p></div><Gauge size={20} aria-hidden="true" /></div>
        {usage.error && <div className={styles.error} role="alert"><AlertCircle size={17} aria-hidden="true" /><div><strong>{usage.status === 503 ? 'AI access is not active for this workspace' : 'Usage could not be refreshed'}</strong><p>{usage.error}</p></div></div>}
        {!usage.data && usage.loading && <div className={styles.loading} role="status"><RefreshCw size={17} className="spin" aria-hidden="true" />Loading current allowances…</div>}
        {usage.data && <>
          <div className={styles.activation} data-allowed={usage.data.access.allowed}>
            {usage.data.access.allowed ? <CheckCircle2 size={20} aria-hidden="true" /> : <Clock3 size={20} aria-hidden="true" />}
            <div><strong>{activation(usage.data.access)}</strong><p>{usage.data.access.message}</p><small>{usage.data.access.mode === 'local' ? 'Local development state. This does not establish hosted activation.' : 'Managed by the platform operator. Workspace members cannot change this setting.'}</small></div>
          </div>

          <section className={styles.usageGroup} aria-labelledby="voice-usage-title"><div className={styles.groupHeading}><div><h3 id="voice-usage-title">Voice connections</h3><p>{usage.data.date} UTC allowance window</p></div><Activity size={18} aria-hidden="true" /></div>
            <div className={styles.quotaList}>
              <QuotaRow label="Connection attempts · daily UTC" value={usage.data.voice.attempts} limit={usage.data.voice.dailyAttemptLimit} detail="Reserved attempts, including failed or uncertain starts." />
              <QuotaRow label="Reserved voice seconds · daily UTC" value={usage.data.voice.reservedSeconds} limit={usage.data.voice.dailyReservedSecondsLimit} detail="Maximum admitted duration, not measured provider billing." />
              <QuotaRow label="Occupied connection slots" value={usage.data.voice.live} limit={usage.data.voice.organizationLiveLimit} detail={`Includes pending and unresolved attempts. Limit: ${measure(usage.data.voice.userLiveLimit)} per member.`} />
            </div><p className={styles.boundary}>{usage.data.voice.accounting}</p>
          </section>

          <section className={styles.usageGroup} aria-labelledby="ai-usage-title"><div className={styles.groupHeading}><div><h3 id="ai-usage-title">AI tokens</h3><p>{usage.data.date} UTC allowance window</p></div><Bot size={18} aria-hidden="true" /></div>
            <div className={styles.quotaList}>
              <QuotaRow label="Admission budget recorded" value={usage.data.ai.budgetTokensUsed} limit={usage.data.ai.dailyTokenLimit} detail="Tokens counted by the platform admission budget." />
              <QuotaRow label="Reserved for pending or uncertain requests" value={usage.data.ai.reservedTokens} detail="Reservation may remain when a final provider response is unknown." />
              <QuotaRow label="Provider-reported tokens" value={usage.data.ai.reportedTokens} detail="Input and output tokens saved from completed provider responses." />
            </div><p className={styles.boundary}>{usage.data.ai.accounting}</p>
            <p className={styles.evidenceLink}>Usage does not establish response quality. <SectionLink destination="Quality" navigate={navigate}>Review Evaluation lab</SectionLink></p>
          </section>

          <section className={styles.attempts} aria-labelledby="attempts-title"><div className={styles.groupHeading}><div><h3 id="attempts-title">Recent voice attempt status</h3><p>No provider references or infrastructure errors are shown here.</p></div></div>
            {usage.data.voice.attemptsSummary.length === 0 ? <p className={styles.empty}>No saved voice attempts in this allowance window.</p> : <div className={styles.attemptList}>{usage.data.voice.attemptsSummary.slice(0, 12).map((attempt, index) => <div className={styles.attemptRow} key={`${attempt.createdAt}-${index}`}><span data-state={attempt.state}>{attemptLabel[attempt.state] ?? 'Unknown state'}</span><div><strong>{attempt.purpose === 'audio_proof' ? 'Audio proof run' : 'Private browser voice'}</strong><small>Started {dateTime(attempt.createdAt, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC · up to {measure(attempt.maxSeconds)} reserved seconds</small></div></div>)}</div>}
          </section>
        </>}
      </section>

      <aside className={styles.secondaryColumn} aria-labelledby="services-title">
        <div className={styles.sectionHeading}><div><h2 id="services-title">Background services</h2><p>Recent process reports and saved work for this workspace.</p></div><ServerCog size={20} aria-hidden="true" /></div>
        {operations.error && <div className={styles.error} role="alert"><AlertCircle size={17} aria-hidden="true" /><div><strong>Service status could not be refreshed</strong><p>{operations.error}</p></div></div>}
        {!operations.data && operations.loading && <div className={styles.loading} role="status"><RefreshCw size={17} className="spin" aria-hidden="true" />Loading service reports…</div>}
        {operations.data && <>
          <div className={styles.serviceList}>{operations.data.services.map(service => <ServiceRow key={service.id} service={service} navigate={navigate} />)}</div>
          <section className={styles.savedWork} aria-labelledby="saved-work-title"><h3 id="saved-work-title">Saved work</h3><p>Counts are scoped to this workspace. They do not expose recipients, messages, job contents, or global infrastructure details.</p><div>{operations.data.queues.map(queue => <WorkRow key={queue.id} queue={queue} navigate={navigate} />)}</div></section>
          <p className={styles.captured}>Checked {dateTime(operations.data.capturedAt, { dateStyle: 'medium', timeStyle: 'medium' })}</p>
        </>}
      </aside>
    </div>
  </main>;
}
