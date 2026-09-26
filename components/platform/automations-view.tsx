'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, RefreshCw, Pause, X } from 'lucide-react';
import type { AutomationDashboard, AutomationPreview, ScheduleView } from '../../lib/automation/contracts';
import '../../app/automations.css';

async function request<T>(body?: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/automations', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Could not load schedules. Try refreshing.');
  return value as T;
}
function formatDate(value: string, timezone?: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', ...(timezone ? { timeZone: timezone } : {}) }).format(new Date(value));
}
const label = (state: string) => ({ enabled: 'Enabled · waiting', paused: 'Paused', cancelled: 'Cancelled', completed: 'Provider accepted', attention: 'Needs review', pending: 'Pending', accepted: 'Provider accepted', rejected: 'Rejected', blocked: 'Blocked', uncertain: 'Uncertain', interrupted: 'Interrupted before dispatch' }[state] || state);

export function AutomationsView() {
  const [dashboard, setDashboard] = useState<AutomationDashboard>();
  const [runId, setRunId] = useState('');
  const [preview, setPreview] = useState<AutomationPreview>();
  const [resumeId, setResumeId] = useState('');
  const [when, setWhen] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const refresh = useCallback(async () => { setDashboard(await request<AutomationDashboard>()); }, []);
  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    void refresh().catch(reason => setError(reason.message));
    const interval = setInterval(() => { void refresh().catch(() => {}); }, 15_000);
    return () => clearInterval(interval);
  }, [refresh]);
  const review = async (id: string, scheduleId = '') => {
    setBusy('review'); setError(''); setNotice(''); setPreview(undefined); setAcknowledged(false); setResumeId(scheduleId); setRunId(id);
    try { setPreview(await request<AutomationPreview>({ action: 'preview', runId: id })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Review failed. Refresh and try again.'); }
    finally { setBusy(''); }
  };
  const enable = async () => {
    if (!preview || !acknowledged || !when) return;
    setBusy('enable'); setError('');
    try {
      const date = new Date(when);
      if (!Number.isFinite(date.getTime())) throw new Error('Choose a valid future date and time.');
      await request({ action: resumeId ? 'resume' : 'enable', ...(resumeId ? { id: resumeId } : { runId }), reviewToken: preview.reviewToken, scheduledAt: date.toISOString(), timezone });
      setPreview(undefined); setAcknowledged(false); setResumeId(''); setWhen('');
      setNotice('Schedule enabled. Delivery waits for the local worker and rechecks current permissions.'); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not enable the schedule. Review again.'); }
    finally { setBusy(''); }
  };
  const control = async (schedule: ScheduleView, action: 'pause' | 'cancel') => {
    setBusy(schedule.id); setError(''); setNotice('');
    try { await request({ action, id: schedule.id }); await refresh(); setNotice(action === 'pause' ? 'Schedule paused. A provider request already started may finish.' : 'Schedule cancelled. A provider request already started may finish.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Schedule changed. Refresh and try again.'); }
    finally { setBusy(''); }
  };
  return <section className="pc-page automation-view" aria-labelledby="automation-title">
    <header className="automation-heading"><div><h1 id="automation-title">Automations</h1><p>Schedule reviewed campaign emails and inspect each execution.</p></div><button type="button" className="automation-button" disabled={!!busy} onClick={() => { setError(''); void refresh().catch(reason => setError(reason.message)); }}><RefreshCw size={15} aria-hidden="true" />Refresh</button></header>
    {error && <p className="automation-error" role="alert">{error}</p>}
    {notice && <p className="automation-notice" role="status">{notice}</p>}
    {!dashboard ? <p className="automation-loading" role="status">Loading schedules and worker status…</p> : <>
      <div className="automation-worker"><CalendarClock size={19} aria-hidden="true"/><div><strong>{dashboard.worker.running ? 'Worker recently reported' : 'No running worker reported'}</strong><p>{dashboard.worker.explanation}</p>{dashboard.worker.lastSeenAt && <small>Last report: {formatDate(dashboard.worker.lastSeenAt)}</small>}</div></div>
      {!dashboard.canManage && <p className="automation-notice">Your access is read-only. An operator who launched the campaign can review and enable its schedule.</p>}
      {dashboard.canManage && <div className="automation-compose">
        <h2>{resumeId ? 'Review remaining recipients' : 'Schedule an email run'}</h2>
        <p>Choose an already launched email campaign. Only the eligible, unsent recipients you review here will be scheduled.</p>
        {!dashboard.runs.length ? <div className="automation-empty"><strong>No launched email runs to schedule</strong><p>In Campaigns, review and launch a connected-email campaign with a checked Gmail or Microsoft mailbox and recorded customer consent. Return here to choose its send time.</p></div> : <div className="automation-picker"><label htmlFor="automation-run">Launched campaign<select id="automation-run" value={runId} disabled={!!busy} onChange={event => { setRunId(event.target.value); setPreview(undefined); setResumeId(''); setAcknowledged(false); }}><option value="">Choose a campaign run</option>{dashboard.runs.map(run => <option key={run.id} value={run.id}>{run.name}</option>)}</select></label><button type="button" className="automation-button" disabled={!runId || !!busy} onClick={() => void review(runId)}>{busy === 'review' ? 'Checking eligibility…' : 'Review recipients'}</button></div>}
        {preview && <div className="automation-review">
          <div className="automation-review-heading"><h3>{preview.name}</h3><span>{preview.recipients.filter(item => item.eligible).length} eligible of {preview.recipients.length}</span></div>
          {preview.blockers.length > 0 && <ul className="automation-blockers">{preview.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul>}
          <details><summary>Review message template</summary><p><strong>{preview.subject}</strong></p><p className="automation-message">{preview.message}</p><small>Names and email fields are personalized from the launched run.</small></details>
          <ul className="automation-recipients">{preview.recipients.map(recipient => <li key={recipient.contactId}><div><strong>{recipient.name}</strong><span>{recipient.email}</span></div><div><span className={`automation-state ${recipient.eligible ? '' : 'attention'}`}>{recipient.eligible ? 'Eligible' : 'Excluded'}</span>{recipient.reason && <small>{recipient.reason}</small>}</div></li>)}</ul>
          <div className="automation-picker"><label htmlFor="automation-when">Send date and time<input id="automation-when" type="datetime-local" value={when} disabled={!!busy} onChange={event => setWhen(event.target.value)}/><small>Your browser timezone: {timezone}. Saved as an exact instant.</small></label></div>
          {when && Number.isFinite(new Date(when).getTime()) && <p className="automation-time-confirm">Scheduled for {formatDate(new Date(when).toISOString(), timezone)} ({timezone}).</p>}
          <label className="automation-ack"><input type="checkbox" checked={acknowledged} disabled={!!busy || !preview.ready} onChange={event => setAcknowledged(event.target.checked)}/><span>I authorize one email per eligible recipient at this time. Current consent, mailbox access and approved sources will be checked again before sending.</span></label>
          <button type="button" className="automation-button primary" disabled={!preview.ready || !acknowledged || !when || !!busy} onClick={() => void enable()}>{busy === 'enable' ? 'Enabling…' : resumeId ? 'Enable remaining schedule' : 'Enable schedule'}</button>
        </div>}
      </div>}
      <section className="automation-schedules" aria-labelledby="automation-history-title"><h2 id="automation-history-title">Schedules and execution history</h2>
        {!dashboard.schedules.length ? <div className="automation-empty"><strong>No schedules enabled</strong><p>Existing campaigns stay unscheduled until you review a run and explicitly enable its schedule.</p></div> : dashboard.schedules.map(schedule => <article key={schedule.id} className="automation-schedule">
          <div className="automation-schedule-heading"><div><h3>{schedule.data.name}</h3><p>{formatDate(schedule.data.scheduledAt, schedule.data.timezone)} · {schedule.data.timezone}</p></div><span className={`automation-state ${schedule.status}`}>{schedule.data.claim ? schedule.data.claim.phase === 'egress' ? 'Dispatch started' : 'Preparing recipient' : schedule.overdue ? 'Overdue · waiting for worker' : label(schedule.status)}</span></div>
          <p>{schedule.data.tasks.filter(task => task.state === 'accepted').length} provider accepted · {schedule.data.tasks.filter(task => task.state === 'pending').length} pending · {schedule.data.tasks.filter(task => !['accepted', 'pending'].includes(task.state)).length} need review</p>
          {schedule.status === 'attention' && <p className="automation-recovery">Inspect the recipient result and connected mailbox. Interrupted and uncertain attempts are never resent automatically. To continue untouched recipients, pause, review, then enable the remaining schedule.</p>}
          {schedule.data.claim && ['paused', 'cancelled'].includes(schedule.status) && <p>Schedule {schedule.status}. A request already sent to the provider may finish; no remaining recipient will start.</p>}
          {schedule.canManage && <div className="automation-actions">{['enabled', 'attention'].includes(schedule.status) && <button type="button" className="automation-button" disabled={!!busy} onClick={() => void control(schedule, 'pause')}><Pause size={14} aria-hidden="true"/>Pause</button>}{schedule.status === 'paused' && !schedule.data.claim && schedule.data.tasks.some(task => task.state === 'pending') && <button type="button" className="automation-button" disabled={!!busy} onClick={() => void review(schedule.data.runId, schedule.id)}>Review to resume</button>}{!['completed', 'cancelled'].includes(schedule.status) && <button type="button" className="automation-button" disabled={!!busy} onClick={() => void control(schedule, 'cancel')}><X size={14} aria-hidden="true"/>Cancel schedule</button>}</div>}
          <details><summary>Execution details and history</summary><ul className="automation-results">{schedule.data.tasks.map((task, index) => <li key={task.contactId}><strong>Recipient {index + 1}: {label(task.state)}</strong>{task.reason && <p>{task.reason}</p>}{task.receiptId && <small>Delivery receipt recorded. Review the campaign delivery list for provider details.</small>}</li>)}</ul><ol className="automation-events">{schedule.data.history.slice().reverse().map((event, index) => <li key={`${event.at}-${index}`}><time dateTime={event.at}>{formatDate(event.at)}</time><span>{event.event}</span></li>)}</ol></details>
        </article>)}
      </section>
      <details className="automation-help"><summary>How the local worker runs</summary><p>Schedules are one-time email authorizations. The local worker must run against this workspace database with <code>AUTOMATION_WORKER_ENABLED=1</code>. Start it with <code>npm run automation:worker</code>, or use <code>npm run automation:worker -- --once</code> for one bounded pass. The worker processes up to five recipients per pass, one at a time.</p><p>Provider acceptance does not prove inbox delivery. Pausing or cancelling cannot recall a request already sent. Scheduled integration sync and telephone calls are not available.</p></details>
    </>}
  </section>;
}
