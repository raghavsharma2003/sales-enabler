'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Headphones, Plus, Save } from 'lucide-react';
import type { PlatformViewProps, PlatformRecord } from '../../lib/platform/contracts';
import type { ConnectionView } from '../../lib/integrations/vault';
import type { CampaignPlan } from '../../lib/campaign-planning/engine';
import { campaignDisplayName, campaignSetupReadiness, readCampaignSetup, type CampaignPhase, type CampaignSetupFields, type CampaignSetupPhase } from '../../lib/platform/campaign-workflow';
import { campaignEditorFields, campaignEditorPatch, campaignFocus, campaignNavigationNeedsSave, campaignPhases, initialCampaignPhase, legacyCampaignPatch, newCampaignFields, parseCampaignRoute } from '../../lib/platform/campaign-workspace-view';
import { CampaignPlanningAssist } from '../campaign-planning-assist';
import { CampaignBriefAssist } from '../campaign-brief-assist';
import { CampaignRunPanel } from '../campaign-run-panel';
import styles from './campaigns-workspace.module.css';

const text = (value: unknown) => typeof value === 'string' ? value : '';
type Review = { ready: boolean; blockers: string[]; reachable: number; audience: { contactId: string; name: string; eligible: boolean; reasons: string[] }[]; previews: { contactId: string; name: string; subject: string; message: string }[] };
const channelLabel = (channel?: string) => channel === 'email' ? 'Connected email' : channel === 'manual_email' ? 'Manual email task' : 'Browser voice';

export function CampaignsView({ records, workspace, act, busy, navigate, focusId }: PlatformViewProps) {
  const campaigns = records.filter(record => record.kind === 'campaign');
  const route = parseCampaignRoute(focusId);
  const viewer = workspace.user.role === 'viewer';
  const [selectedId, setSelectedId] = useState(route.campaignId || (!route.newDraft && !route.planId ? campaigns[0]?.id : '') || '');
  const [receipt, setReceipt] = useState<PlatformRecord>();
  const stored = campaigns.find(record => record.id === selectedId);
  const selected = receipt?.id === selectedId && (!stored || receipt.revision > stored.revision) ? receipt : stored;
  const [fields, setFields] = useState<CampaignSetupFields>(() => selected ? campaignEditorFields(selected) : newCampaignFields(route.offeringId));
  const [baseline, setBaseline] = useState(() => JSON.stringify(fields));
  const [phase, setPhase] = useState<CampaignPhase>(() => initialCampaignPhase(selected, route.phase));
  const [pending, setPending] = useState(false);
  const [assistBusy, setAssistBusy] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [review, setReview] = useState<{ result: Review; id: string; revision: number }>();
  const [mailboxes, setMailboxes] = useState<ConnectionView[]>([]);
  const [mailboxError, setMailboxError] = useState('');
  const [planId, setPlanId] = useState(route.planId || (records.find(record => record.kind === 'campaign_plan' && record.id === route.campaignId)?.id) || '');
  const dirty = JSON.stringify(fields) !== baseline;
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const lock = useRef(false);
  const assistBusyRef = useRef(false);
  const callActiveRef = useRef(false);
  const internalPhaseNavigation = useRef(false);
  const onCallActive = useCallback((active: boolean) => { callActiveRef.current = active; setCallActive(active); }, []);
  const onAssistBusy = useCallback((value: boolean) => { assistBusyRef.current = value; setAssistBusy(value); }, []);
  const loaded = useRef(selected);
  const lastFocus = useRef(focusId);
  const createRequest = useRef('');
  const waiting = busy || pending || assistBusy;
  const setup = !selected || !!readCampaignSetup(selected);
  const editable = !viewer && (!selected || ['setup', 'draft'].includes(selected.status));
  const fixedContent = !!selected && !setup && !!(selected.data.planId || selected.data.setupOrigin);
  const contentDisabled = waiting || !editable || fixedContent;
  const intentDisabled = waiting || !editable || !setup;
  const readiness = campaignSetupReadiness(campaignEditorPatch(fields));
  const offerings = records.filter(record => record.kind === 'offering' && record.status === 'approved');
  const offering = records.find(record => record.id === fields.offeringId);
  const releases = records.filter(record => record.kind === 'release' && record.status === 'active' && record.data.channel === 'browser');
  const sources = records.filter(record => record.kind === 'brain_source' && record.status === 'approved');
  const signals = records.filter(record => record.kind === 'business_signal' && record.status === 'approved' && (!record.data.offeringId || record.data.offeringId === fields.offeringId));
  const run = records.find(record => record.kind === 'campaign_run' && record.data.campaignId === selectedId);
  const canReopenSetup = !!selected && selected.status === 'draft' && !!selected.data.setupOrigin && !!selected.data.setupDraft && !run;
  const currentReview = review && selected && review.id === selected.id && review.revision === selected.revision && !dirty ? review.result : undefined;
  const plans = records.filter(record => record.kind === 'campaign_plan' && !record.data.targetCampaignId);
  const releaseName = (release: PlatformRecord) => `${text(records.find(record => record.id === release.data.agentId)?.data.name) || 'Agent'} · v${String(records.find(record => record.id === release.data.versionId)?.data.number || '?')}`;
  const refresh = async () => { await act('workspace.refresh'); };
  const reset = (record?: PlatformRecord, offeringId?: string) => {
    const next = record ? campaignEditorFields(record) : newCampaignFields(offeringId);
    setFields(next); setBaseline(JSON.stringify(next)); dirtyRef.current = false; loaded.current = record;
    setReview(undefined); setError(''); setNotice(''); setQuery('');
  };
  // A refresh must preserve unsaved fields and the revision the operator actually edited.
  useEffect(() => {
    if (selected && (loaded.current?.id !== selected.id || (!dirtyRef.current && loaded.current?.revision !== selected.revision))) reset(selected);
  }, [selected?.id, selected?.revision]);
  useEffect(() => {
    if (lastFocus.current === focusId) return;
    lastFocus.current = focusId;
    const nextRoute = parseCampaignRoute(focusId);
    const linkedPlan = records.find(record => record.kind === 'campaign_plan' && record.id === nextRoute.campaignId);
    setPlanId(nextRoute.planId || linkedPlan?.id || '');
    if (nextRoute.planId || linkedPlan) { if (dirtyRef.current) reset(selected); return; }
    const next = campaigns.find(record => record.id === nextRoute.campaignId) || (receipt?.id === nextRoute.campaignId ? receipt : undefined) || (!nextRoute.newDraft && !nextRoute.campaignId ? campaigns[0] : undefined);
    if (next?.id !== selectedId || nextRoute.newDraft || dirtyRef.current) { setSelectedId(next?.id || ''); setReceipt(undefined); reset(next, nextRoute.offeringId); createRequest.current = ''; }
    setPhase(initialCampaignPhase(next, nextRoute.phase));
  }, [focusId]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirtyRef.current || lock.current || assistBusyRef.current || callActiveRef.current) { event.preventDefault(); event.returnValue = ''; } };
    const navigation = (event: Event) => {
      if (callActiveRef.current && !internalPhaseNavigation.current) { event.preventDefault(); setNotice('End the current call before leaving this campaign. Use Return to call to reach the call controls.'); return; }
      if (lock.current || assistBusyRef.current) { event.preventDefault(); setNotice('Wait for the current save or AI request to finish before leaving this campaign.'); return; }
      if (dirtyRef.current && !window.confirm('Leave this campaign without saving your changes?')) event.preventDefault();
    };
    window.addEventListener('beforeunload', unload); window.addEventListener('relay:before-navigation', navigation);
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener('relay:before-navigation', navigation); };
  }, []);
  useEffect(() => {
    if (fields.channel !== 'email') return;
    const abort = new AbortController();
    void fetch('/api/integrations', { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error('Sending accounts could not be loaded. Check Integrations and try again.');
      const result = await response.json(); setMailboxes((result.connections || []).filter((item: ConnectionView) => ['gmail', 'microsoft_mail'].includes(item.integrationId) && item.status === 'connected' && item.settings.sendPermission)); setMailboxError('');
    }).catch(cause => { if (!abort.signal.aborted) setMailboxError(cause instanceof Error ? cause.message : 'Sending accounts could not be loaded.'); });
    return () => abort.abort();
  }, [fields.channel]);
  const set = <K extends keyof CampaignSetupFields>(key: K, value: CampaignSetupFields[K]) => {
    if (!editable || waiting || lock.current || assistBusyRef.current) return;
    setFields(previous => ({ ...previous, [key]: value })); dirtyRef.current = true; setReview(undefined); setNotice(''); setError('');
  };
  const useBriefSuggestion = (patch: CampaignSetupFields) => {
    if (viewer || !selected || !readCampaignSetup(selected) || loaded.current?.id !== selected.id) return;
    // Brief assistance proposes only these reviewable fields; it cannot change audience, delivery or execution settings.
    setFields(previous => ({ ...previous,
      ...(patch.outcome ? { outcome: structuredClone(patch.outcome) } : {}),
      ...(typeof patch.audienceRationale === 'string' ? { audienceRationale: patch.audienceRationale } : {}),
      ...(Array.isArray(patch.reviewColumns) ? { reviewColumns: structuredClone(patch.reviewColumns) } : {}),
    }));
    dirtyRef.current = true; setReview(undefined); setError(''); setNotice('AI suggestions added to your draft. Review the outcome, evidence and audience rationale, then save.');
  };
  const move = (id: string, nextPhase: CampaignPhase) => {
    if (callActiveRef.current && id !== selectedId) { setNotice('End the current call before switching campaigns.'); return; }
    setPhase(nextPhase);
    // Navigation dispatches its guard synchronously. Only this same-campaign phase move may retain a live call.
    internalPhaseNavigation.current = callActiveRef.current && id === selectedId;
    try { navigate('campaigns', campaignFocus(id, nextPhase)); }
    finally { internalPhaseNavigation.current = false; }
  };
  const returnToCall = () => {
    if (!selectedId) return;
    move(selectedId, 'run');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const desk = document.getElementById('campaign-call-desk');
      desk?.scrollIntoView({ behavior: 'instant', block: 'start' });
      desk?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    }));
  };
  const transact = async (work: () => Promise<void>) => {
    if (viewer || waiting || lock.current || assistBusyRef.current) return;
    lock.current = true; setPending(true); setError(''); setNotice('');
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The campaign could not be saved. Your changes are still here.'); }
    finally { lock.current = false; setPending(false); }
  };
  const saveRecord = async (nextPhase: CampaignPhase = phase) => {
    let current = loaded.current;
    if (!current) {
      createRequest.current ||= crypto.randomUUID();
      // Stable empty creation can be retried even after fields change following an uncertain response.
      current = await act('campaign.setup.create', { requestId: createRequest.current, fields: {} }) as PlatformRecord;
      loaded.current = current; setReceipt(current); setSelectedId(current.id);
    }
    const saved = readCampaignSetup(current)
      ? await act('campaign.setup.update', { id: current.id, revision: current.revision, phase: ['run', 'results'].includes(nextPhase) ? 'review' : nextPhase, patch: campaignEditorPatch(fields) }) as PlatformRecord
      : dirtyRef.current ? await act('campaign.update', { id: current.id, revision: current.revision, ...legacyCampaignPatch(fields) }) as PlatformRecord : current;
    setReceipt(saved); setSelectedId(saved.id); reset(saved); return saved;
  };
  const save = () => transact(async () => { const saved = await saveRecord(); lock.current = false; move(saved.id, phase); setNotice('Campaign saved.'); });
  const changePhase = async (next: CampaignPhase) => {
    if (waiting || lock.current || next === phase) return;
    // Clean stage navigation changes only the URL, preserving exact-revision AI proposal authority.
    if (!viewer && campaignNavigationNeedsSave(selected, dirtyRef.current)) await transact(async () => { const saved = await saveRecord(next); lock.current = false; move(saved.id, next); });
    else if (selected) move(selected.id, next); else setPhase(next);
  };
  const startNew = () => {
    if (callActiveRef.current) { setNotice('End the current call before starting another campaign.'); return; }
    if (viewer || waiting || lock.current || (dirtyRef.current && !window.confirm('Discard your unsaved campaign changes?'))) return;
    reset(); setSelectedId(''); setReceipt(undefined); setPlanId(''); setPhase('intent'); createRequest.current = ''; navigate('campaigns', 'new');
  };
  const open = (id: string) => {
    if (callActiveRef.current) { setNotice('End the current call before switching campaigns.'); return; }
    if (waiting || lock.current || (dirtyRef.current && !window.confirm('Discard your unsaved campaign changes?'))) return;
    const next = campaigns.find(record => record.id === id);
    reset(next); setSelectedId(id); setReceipt(undefined); setPlanId(''); const nextPhase = initialCampaignPhase(next); setPhase(nextPhase); navigate('campaigns', campaignFocus(id, nextPhase));
  };
  const check = () => transact(async () => {
    let current = loaded.current;
    if (!current || dirtyRef.current) current = await saveRecord('review');
    if (readCampaignSetup(current)) { current = await act('campaign.setup.finalize', { id: current.id, revision: current.revision }) as PlatformRecord; setReceipt(current); reset(current); }
    const result = await act('campaign.preflight', { id: current.id }) as Review;
    setReview({ result, id: current.id, revision: current.revision }); lock.current = false; move(current.id, 'review');
  });
  const launch = () => transact(async () => {
    if (!selected || !currentReview?.ready || dirtyRef.current) return;
    await act('campaign.launch', { id: selected.id, revision: selected.revision }); setReview(undefined); lock.current = false; move(selected.id, 'run');
  });
  const reopenSetup = () => transact(async () => {
    if (!canReopenSetup || !loaded.current || callActiveRef.current) return;
    const current = dirtyRef.current ? await saveRecord('review') : loaded.current;
    const reopened = await act('campaign.setup.reopen', { id: current.id, revision: current.revision }) as PlatformRecord;
    if (reopened.id !== current.id || !readCampaignSetup(reopened)) throw new Error('The saved result did not match this campaign setup. Reload the saved version before continuing.');
    setReceipt(reopened); setSelectedId(reopened.id); reset(reopened);
    lock.current = false; move(reopened.id, 'intent');
    setNotice('Setup reopened. Review your changes and check launch readiness again before launching.');
  });
  const reloadSaved = () => {
    if (!selected || waiting || lock.current || (dirtyRef.current && !window.confirm('Discard your changes and reload the saved campaign?'))) return;
    void transact(async () => { reset(selected); await refresh(); setNotice('Saved campaign reloaded.'); });
  };
  const nextPhase = campaignPhases[campaignPhases.findIndex(item => item.id === phase) + 1];
  const customers = workspace.contacts.filter(contact => `${text(contact.name)} ${text(contact.email)}`.toLowerCase().includes(query.toLowerCase()));
  const selectedContacts = fields.contactIds || [];
  const phaseIssues = setup && ['intent', 'audience', 'agent_content', 'review'].includes(phase) ? readiness[phase as CampaignSetupPhase] : [];

  return <main className={`pc-page ${styles.page}`}>
    <header className={styles.header}><div><h1>Campaigns</h1><p>One campaign, from the first goal to reviewed results.</p></div>{!viewer && <button type="button" className="pc-button" disabled={waiting || callActive} onClick={startNew}><Plus size={16} aria-hidden="true"/> New campaign</button>}</header>
    <div className={styles.toolbar}>
      <label className={styles.picker}>Campaign<select className="pc-select" value={selectedId} disabled={waiting || callActive} onChange={event => open(event.target.value)}><option value="" disabled>{viewer ? 'Choose a campaign' : 'New campaign'}</option>{campaigns.map(record => <option key={record.id} value={record.id}>{campaignDisplayName(record)} · {record.status}</option>)}{receipt && !campaigns.some(record => record.id === receipt.id) && <option value={receipt.id}>{campaignDisplayName(receipt)}</option>}</select></label>
      <div className={styles.identity}><h2>{fields.name || 'New campaign'}</h2><p role="status">{dirty ? 'Unsaved changes' : selected ? selected.status === 'setup' ? 'Setup saved' : selected.status === 'draft' ? 'Draft saved' : `Campaign ${selected.status}` : 'Not saved yet'}{viewer ? ' · Read only' : ''}</p></div>
      {!viewer && editable && !planId && <button type="button" className="pc-button" onClick={() => void save()} disabled={waiting || (!dirty && !!selected)}><Save size={16} aria-hidden="true"/> {pending ? 'Saving…' : 'Save draft'}</button>}
    </div>
    {callActive && <aside className={styles.liveCall} aria-label="Active campaign call"><div><strong role="status"><Headphones size={17} aria-hidden="true"/> Call in progress</strong><p>Your browser conversation stays connected across campaign stages.</p></div><button type="button" className="pc-button" onClick={returnToCall}>Return to call</button></aside>}
    {plans.length > 0 && <details className={styles.earlier}><summary>Earlier AI proposals ({plans.length})</summary><div className={styles.proposalList}>{plans.map(plan => <button type="button" className="pc-button quiet" key={plan.id} onClick={() => navigate('campaigns', `plan:${plan.id}`)}>{text((plan.data.draft as { name?: string })?.name) || text(plan.data.goal) || 'Saved AI proposal'} · {plan.status}</button>)}</div></details>}
    {viewer && <p className={styles.notice}>Read-only access. An operator can edit and launch campaigns.</p>}
    {error && <div role="alert" className={styles.error}>{error}{selected && editable && <button type="button" className="pc-button quiet" disabled={waiting} onClick={reloadSaved}>Reload saved version</button>}</div>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
    {dirty && selected && selected.revision !== loaded.current?.revision && <p className={styles.notice}>A newer version was saved elsewhere. Your changes are still here; reload the saved version before editing again. <button type="button" className="pc-button quiet" disabled={waiting} onClick={reloadSaved}>Reload saved version</button></p>}
    {planId ? <LegacyPlanPanel key={planId} planId={planId} records={records} viewer={viewer} busy={waiting} releaseName={releaseName} navigate={navigate} onRefresh={refresh}/>
      : viewer && !selected ? <section className={styles.empty}><h2>No campaign selected</h2><p>Choose a saved campaign to inspect its setup and results.</p></section>
      : route.campaignId && !selected && !route.newDraft ? <section className={styles.empty}><h2>Campaign unavailable</h2><p>This campaign could not be found in the workspace. Choose another saved campaign.</p></section>
      : <>
        <nav className={styles.steps} aria-label="Campaign stages">{campaignPhases.map((item, index) => <button type="button" key={item.id} aria-current={phase === item.id ? 'step' : undefined} disabled={waiting || (['run', 'results'].includes(item.id) && !run)} onClick={() => void changePhase(item.id)}><span className={styles.stepNumber}>{index + 1}</span>{item.label}</button>)}</nav>
        {(!setup && selected?.status === 'draft') && <p className={styles.context}>{fixedContent ? canReopenSetup ? 'This brief has been reviewed. Choose Edit setup in Review to change the audience or content, then check readiness again.' : 'The reviewed intent, audience and content are fixed. You can change the agent release or sending account before launch. Start a new campaign to revise the brief.' : 'This earlier draft remains editable. It has no reviewed product binding unless one is shown below.'}</p>}
        <section className={styles.editor} hidden={['run', 'results'].includes(phase)}>
          {phase === 'intent' && <><div className={styles.sectionHead}><h2>What should this campaign achieve?</h2><p>Choose the product or service, then define an outcome you can verify.</p></div><fieldset className={styles.fields} disabled={waiting || !editable}>
            <div className={styles.pair}><label className="pc-field">Campaign name<input className="pc-input" maxLength={160} value={fields.name || ''} disabled={contentDisabled} onChange={event => set('name', event.target.value)} placeholder="e.g. October customer feedback"/></label><label className="pc-field">Campaign purpose<select className="pc-select" value={fields.kind || 'sales'} disabled={contentDisabled} onChange={event => set('kind', event.target.value as 'sales' | 'feedback')}><option value="sales">Sales</option><option value="feedback">Customer feedback</option></select></label></div>
            <label className="pc-field">Business goal<textarea className="pc-textarea" maxLength={1000} value={fields.goal || ''} disabled={intentDisabled} onChange={event => set('goal', event.target.value)} placeholder="What do you want to understand or move forward?"/></label>
            <label className="pc-field">Product or service<select className="pc-select" value={fields.offeringId || ''} disabled={intentDisabled} onChange={event => { set('offeringId', event.target.value); set('signalIds', []); }}><option value="">Choose a reviewed offering</option>{offerings.map(item => <option key={item.id} value={item.id}>{text(item.data.name)}</option>)}{fields.offeringId && !offerings.some(item => item.id === fields.offeringId) && <option value={fields.offeringId}>{text(selected?.data.offeringName) || 'Offering unavailable or no longer approved'}</option>}</select></label>
            {offering && <p className={styles.support}>{text(offering.data.summary)}{Array.isArray(offering.data.openQuestions) && offering.data.openQuestions.length > 0 ? ' Resolve this offering’s open questions before launch review.' : ''}</p>}
            {!offerings.length && <p className={styles.support}>Review a product or service in Company before completing setup. You can save a partial campaign now.</p>}
            <label className="pc-field">Desired outcome<input className="pc-input" maxLength={240} value={fields.outcome?.label || ''} disabled={intentDisabled} onChange={event => set('outcome', { label: event.target.value, evidenceRequired: fields.outcome?.evidenceRequired || [] })}/></label>
            <label className="pc-field">Evidence needed for that outcome<textarea className="pc-textarea" rows={3} value={fields.outcome?.evidenceRequired.join('\n') || ''} disabled={intentDisabled} onChange={event => set('outcome', { label: fields.outcome?.label || '', evidenceRequired: event.target.value.split('\n').slice(0, 8) })}/><small>One requirement per line. A completed conversation alone does not prove the outcome.</small></label>
          </fieldset>{!offerings.length && <button type="button" className="pc-button quiet" onClick={() => navigate('offerings')}>Review company offerings</button>}</>}
          {phase === 'audience' && <><div className={styles.sectionHead}><h2>Who is this for?</h2><p>Select relevant customers. Launch review checks recorded channel consent; selecting someone does not grant permission.</p></div><fieldset className={styles.fields} disabled={contentDisabled || (!!selected?.data.explicitIntentV1 && !setup)}>
            <label className="pc-field">Why this audience?<textarea className="pc-textarea" maxLength={2000} value={fields.audienceRationale || ''} disabled={intentDisabled} onChange={event => set('audienceRationale', event.target.value)}/></label><strong>{selectedContacts.length} customers selected</strong>
          </fieldset><label className={`pc-field ${styles.search}`}>Find customers<input className="pc-input" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by name or email"/></label>
          <div className={styles.customerList}>{customers.map(contact => <label key={contact.id} className={styles.checkRow}><input type="checkbox" checked={selectedContacts.includes(contact.id)} disabled={contentDisabled || (!!selected?.data.explicitIntentV1 && !setup) || (!selectedContacts.includes(contact.id) && selectedContacts.length >= 500)} onChange={event => set('contactIds', event.target.checked ? [...selectedContacts, contact.id] : selectedContacts.filter(id => id !== contact.id))}/><span><strong>{text(contact.name) || 'Customer'}</strong><small>{text(contact.email) || 'No email recorded'}</small></span></label>)}{!customers.length && <p className={styles.support}>{workspace.contacts.length ? 'No customers match this search.' : 'No customers yet. Add customers to build the audience.'}</p>}</div>
          {selectedContacts.some(id => !workspace.contacts.some(contact => contact.id === id)) && <p className={styles.error}>Some selected customers are no longer available. Launch review will flag them.</p>}{!workspace.contacts.length && <button type="button" className="pc-button quiet" onClick={() => navigate('customers')}>Open customers</button>}
          {selected && setup && !viewer && <CampaignBriefAssist campaign={selected} records={records} workspace={workspace} busy={busy || pending} dirty={dirty} onBusyChange={onAssistBusy} onSuggestion={useBriefSuggestion}/>}
          </>}
          {phase === 'agent_content' && <><div className={styles.sectionHead}><h2>Prepare the conversation</h2><p>Choose how the campaign will run and what the customer will hear or read.</p></div><fieldset className={styles.fields} disabled={waiting || !editable}>
            <label className="pc-field">Channel<select className="pc-select" value={fields.channel || 'browser'} disabled={contentDisabled} onChange={event => set('channel', event.target.value as CampaignSetupFields['channel'])}><option value="browser">Browser voice</option><option value="email">Connected email</option><option value="manual_email">Manual email task</option></select></label>
            {fields.channel === 'browser' ? <label className="pc-field">Published agent release<select className="pc-select" value={fields.agentReleaseId || ''} onChange={event => set('agentReleaseId', event.target.value)}><option value="">Choose an active release</option>{releases.map(item => <option value={item.id} key={item.id}>{releaseName(item)}</option>)}{fields.agentReleaseId && !releases.some(item => item.id === fields.agentReleaseId) && <option value={fields.agentReleaseId}>Saved release · no longer active</option>}</select><small>Each browser conversation is started by an operator. This campaign does not place telephone calls.</small></label> : <label className="pc-field">Email subject<input className="pc-input" maxLength={240} value={fields.subject || ''} disabled={contentDisabled} onChange={event => set('subject', event.target.value)}/></label>}
            {fields.channel === 'email' && <label className="pc-field">Sending account<select className="pc-select" value={fields.emailConnectionId || ''} onChange={event => set('emailConnectionId', event.target.value)}><option value="">Choose a connected mailbox</option>{mailboxes.map(item => <option key={item.id} value={item.id}>{item.integrationId === 'gmail' ? 'Gmail' : 'Microsoft 365 Mail'} · sending enabled</option>)}{fields.emailConnectionId && !mailboxes.some(item => item.id === fields.emailConnectionId) && <option value={fields.emailConnectionId}>Saved account · check connection</option>}</select><small>{mailboxError || (!mailboxes.length ? 'Connect a mailbox in Integrations and enable sending.' : 'Launch review checks the current sending permission.')}</small></label>}
            <label className="pc-field">Conversation objective<textarea className="pc-textarea" maxLength={1000} value={fields.objective || ''} disabled={contentDisabled} onChange={event => set('objective', event.target.value)}/></label>
            <label className="pc-field">{fields.channel === 'browser' ? 'Opening message / speaking brief' : 'Message'}<textarea className={`pc-textarea ${styles.message}`} maxLength={5000} value={fields.message || ''} disabled={contentDisabled} onChange={event => set('message', event.target.value)}/><small>{'Personalization: {{firstName}}, {{name}} and {{email}}. Browser agents must disclose their AI identity.'}</small></label>
            {fields.callBrief && <label className="pc-field">Representative brief<textarea className="pc-textarea" maxLength={3000} value={fields.callBrief} disabled={!setup} onChange={event => set('callBrief', event.target.value)}/></label>}{fields.successCriteria && <label className="pc-field">Success criteria<textarea className="pc-textarea" maxLength={1000} value={fields.successCriteria} disabled={!setup} onChange={event => set('successCriteria', event.target.value)}/></label>}
            <details className={styles.details}><summary>Supporting evidence and information to collect</summary><div className={styles.fields}>
              <label className="pc-field">Information to collect · one column per line<textarea className="pc-textarea" disabled={intentDisabled || (fields.reviewColumns || []).some(column => column.type !== 'text')} value={(fields.reviewColumns || []).map(column => column.label).join('\n')} onChange={event => set('reviewColumns', event.target.value.split('\n').slice(0, 12).map((label, index) => ({ key: fields.reviewColumns?.[index]?.key || `answer_${index + 1}`, label, type: 'text' })))}/><small>Optional text fields for reviewing results. Existing typed columns retain their saved format.</small></label>
              {signals.length > 0 && <div><strong>Reviewed signals</strong>{signals.map(signal => <label className={styles.checkRow} key={signal.id}><input type="checkbox" checked={(fields.signalIds || []).includes(signal.id)} disabled={intentDisabled || (!!signal.data.contactId && !selectedContacts.includes(String(signal.data.contactId)))} onChange={event => set('signalIds', event.target.checked ? [...(fields.signalIds || []), signal.id] : (fields.signalIds || []).filter(id => id !== signal.id))}/><span>{text(signal.data.title)}<small>{text(signal.data.observation)}</small></span></label>)}</div>}
              {sources.length > 0 && <div><strong>Additional approved sources · up to 3</strong>{sources.map(source => <label className={styles.checkRow} key={source.id}><input type="checkbox" checked={(fields.sourceIds || []).includes(source.id)} disabled={intentDisabled || (!(fields.sourceIds || []).includes(source.id) && (fields.sourceIds || []).length >= 3)} onChange={event => set('sourceIds', event.target.checked ? [...(fields.sourceIds || []), source.id] : (fields.sourceIds || []).filter(id => id !== source.id))}/><span>{text(source.data.title) || 'Approved source'}</span></label>)}</div>}
            </div></details>
          </fieldset>{selected && setup && !viewer && <CampaignPlanningAssist campaign={selected} records={records} workspace={workspace} busy={busy || pending} dirty={dirty} navigate={navigate} onChanged={refresh} onBusyChange={onAssistBusy}/>}{!selected && !viewer && <p className={styles.support}>Save the campaign to use optional AI planning assistance.</p>}</>}
          {phase === 'review' && <><div className={styles.sectionHead}><h2>{run ? 'Saved campaign brief' : 'Review before launch'}</h2><p>{run ? 'The run keeps the audience, agent and content captured at launch.' : 'Check the brief, then review current customer eligibility and personalized previews.'}</p></div>
            {canReopenSetup && !viewer && <div className={styles.reopen}><button type="button" className="pc-button" disabled={waiting} onClick={() => void reopenSetup()}>Edit setup</button><p>Return to this campaign’s editable setup. Launch readiness must be checked again.</p></div>}
            <dl className={styles.summary}><div><dt>Campaign</dt><dd>{fields.name || 'Not named'} · {fields.kind === 'feedback' ? 'Customer feedback' : 'Sales'}</dd></div><div><dt>Product or service</dt><dd>{text(offering?.data.name) || text(selected?.data.offeringName) || 'No reviewed offering binding'}</dd></div><div><dt>Goal</dt><dd>{fields.goal || fields.objective || 'Not recorded'}</dd></div><div><dt>Desired outcome</dt><dd>{fields.outcome?.label || 'Not recorded'}</dd></div><div><dt>Required evidence</dt><dd>{fields.outcome?.evidenceRequired.filter(Boolean).join('; ') || 'Not recorded'}</dd></div><div><dt>Audience</dt><dd>{selectedContacts.length} customers{fields.audienceRationale ? ` · ${fields.audienceRationale}` : ''}</dd></div><div><dt>Channel</dt><dd>{channelLabel(fields.channel)}{fields.channel === 'browser' && fields.agentReleaseId ? ` · ${releases.find(item => item.id === fields.agentReleaseId) ? releaseName(releases.find(item => item.id === fields.agentReleaseId)!) : 'Saved release is not active'}` : ''}</dd></div></dl>
            <details className={styles.details}><summary>Message and result fields</summary>{fields.subject && <h3>{fields.subject}</h3>}<p className={styles.copy}>{fields.message || 'No message yet.'}</p>{fields.callBrief && <p className={styles.copy}>{fields.callBrief}</p>}{(fields.reviewColumns || []).length > 0 && <ul>{fields.reviewColumns!.map(column => <li key={column.key}>{column.label} · {column.type}</li>)}</ul>}</details>
            {!!selected?.data.planId && <button type="button" className="pc-button quiet" onClick={() => navigate('campaigns', `plan:${String(selected.data.planId)}`)}>View saved AI proposal</button>}
            {setup && <p className={styles.context}>Launch review finalizes this brief as a draft and checks current permissions. Launch is a separate action that locks a run snapshot.</p>}
            {currentReview && <div className={styles.launchReview}><h3>{currentReview.ready ? 'Ready to launch' : 'Resolve these launch blockers'}</h3><p>{currentReview.reachable} of {currentReview.audience.length} customers eligible</p>{currentReview.blockers.length > 0 && <ul className={styles.blockers}>{currentReview.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul>}<details className={styles.details} open={!currentReview.ready}><summary>Customer eligibility</summary>{currentReview.audience.map(item => <div className={styles.eligibility} key={item.contactId}><span>{item.name}</span><span>{item.eligible ? 'Eligible' : item.reasons.join('; ')}</span></div>)}</details><details className={styles.details}><summary>Personalized previews</summary>{currentReview.previews.map(item => <div className={styles.preview} key={item.contactId}><h4>{item.name}</h4>{item.subject && <strong>{item.subject}</strong>}<p className={styles.copy}>{item.message}</p></div>)}</details></div>}
          </>}
          {phaseIssues.length > 0 && <div className={styles.remaining}><strong>{phase === 'review' ? 'Complete before launch review' : 'Still needed for this stage'}</strong><ul>{phaseIssues.map(issue => <li key={issue}>{issue}</li>)}</ul><p>You can save and continue with a partial setup.</p></div>}
          <footer className={styles.footer}><span>{setup ? 'Changes are saved when you continue.' : run ? 'The launched snapshot is fixed.' : dirty ? 'Save changes before checking readiness.' : 'Readiness checks use the saved campaign. Launch is a separate action.'}</span>{phase === 'review' ? !viewer && !run && <div className={styles.actions}>{currentReview?.ready ? <><button type="button" className="pc-button quiet" disabled={waiting} onClick={() => void check()}>Check again</button><button type="button" className="pc-button primary" disabled={waiting || dirty} onClick={() => void launch()}><Check size={16} aria-hidden="true"/> Launch campaign</button></> : <button type="button" className="pc-button primary" disabled={waiting || (setup && !readiness.ready)} onClick={() => void check()}>{waiting ? 'Checking…' : 'Check launch readiness'}</button>}</div> : nextPhase && <button type="button" className="pc-button primary" disabled={waiting} onClick={() => void changePhase(nextPhase.id)}>{viewer || !editable ? 'Continue' : 'Save & continue'}<ArrowRight size={16} aria-hidden="true"/></button>}</footer>
        </section>
        {selected && run && <div hidden={!['run', 'results'].includes(phase)}><div className={styles.sectionHead}><h2>{phase === 'results' ? 'Campaign results' : 'Run this campaign'}</h2><p>{phase === 'results' ? 'Select a recipient to review saved conversation evidence and recorded outcomes.' : 'Follow the queue and start each browser conversation when you are ready.'}</p></div><CampaignRunPanel key={selected.id} campaign={selected} records={records} workspace={workspace} act={act} busy={waiting} navigate={navigate} onRefresh={refresh} onCallActiveChange={onCallActive}/></div>}
        {selected && !run && ['run', 'results'].includes(phase) && <section className={styles.empty}><h2>No run yet</h2><p>Review the campaign before launching.</p><button type="button" className="pc-button primary" onClick={() => void changePhase('review')}>Open launch review</button></section>}
      </>}
  </main>;
}

function LegacyPlanPanel({ planId, records, viewer, busy, releaseName, navigate, onRefresh }: { planId: string; records: PlatformRecord[]; viewer: boolean; busy: boolean; releaseName: (record: PlatformRecord) => string; navigate: PlatformViewProps['navigate']; onRefresh: () => Promise<void> }) {
  const [fetched, setFetched] = useState<PlatformRecord<CampaignPlan>>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [releaseId, setReleaseId] = useState('');
  const lock = useRef(false);
  const plan = (records.find(record => record.kind === 'campaign_plan' && record.id === planId) as PlatformRecord<CampaignPlan> | undefined) || fetched;
  useEffect(() => {
    const guard = (event: Event) => { if (lock.current) event.preventDefault(); };
    const unload = (event: BeforeUnloadEvent) => { if (lock.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('relay:before-navigation', guard); window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('relay:before-navigation', guard); window.removeEventListener('beforeunload', unload); };
  }, []);
  useEffect(() => {
    if (plan) return;
    const abort = new AbortController();
    void fetch('/api/campaign-plans', { signal: abort.signal }).then(async response => { if (!response.ok) throw new Error('The saved proposal could not be loaded.'); const result = await response.json(); const found = (result.plans as PlatformRecord<CampaignPlan>[]).find(item => item.id === planId); if (!found) throw new Error('This proposal is unavailable in the workspace.'); setFetched(found); }).catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'The proposal could not be loaded.'); });
    return () => abort.abort();
  }, [planId, !!plan]);
  if (!plan) return <section className={styles.editor}><h2>Saved AI proposal</h2><p role={error ? 'alert' : 'status'}>{error || 'Loading proposal…'}</p></section>;
  const intent = plan.data.explicitIntentV1;
  const stale = (plan.data.sourceAnchors || []).some(anchor => !records.some(record => record.id === anchor.id && record.revision === anchor.revision && record.status === 'approved')) || !!intent && [intent.offering, ...intent.signalAnchors].some(anchor => !records.some(record => record.id === anchor.id && record.revision === anchor.revision && record.status === 'approved'));
  const missing = plan.data.draft?.missingInputs || [];
  const releases = records.filter(record => record.kind === 'release' && record.status === 'active' && record.data.channel === 'browser');
  const apply = async () => {
    if (viewer || busy || lock.current || stale) return;
    lock.current = true; setPending(true); setError('');
    try {
      const response = await fetch(`/api/campaign-plans/${encodeURIComponent(plan.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'apply', revision: plan.revision, ...(plan.data.channel === 'browser' && releaseId ? { agentReleaseId: releaseId } : {}) }) });
      const result = await response.json(); if (!response.ok) throw new Error(text(result.error) || 'Could not apply this proposal.');
      await onRefresh(); lock.current = false; navigate('campaigns', campaignFocus(result.campaign.id, 'review'));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not apply this proposal.'); }
    finally { lock.current = false; setPending(false); }
  };
  return <section className={styles.editor}><div className={styles.sectionHead}><h2>{plan.data.draft?.name || 'Saved AI proposal'}</h2><p>Earlier proposal · {plan.status}. Its source and review history remain attached.</p></div><dl className={styles.summary}><div><dt>Goal</dt><dd>{plan.data.goal}</dd></div><div><dt>Outcome</dt><dd>{intent?.outcome.label || 'No reviewed outcome'}</dd></div><div><dt>Audience</dt><dd>{plan.data.contactIds?.length || 0} customers · {intent?.audienceRationale || 'No rationale recorded'}</dd></div><div><dt>Sources</dt><dd>{stale ? 'Source approval or revision changed. Create a new campaign with current evidence.' : 'Saved source revisions match current approved records.'}</dd></div></dl><p className={styles.copy}>{plan.data.draft?.message}</p><details className={styles.details}><summary>Saved brief and company evidence</summary><h3>Conversation objective</h3><p className={styles.copy}>{plan.data.draft?.objective}</p><h3>Conversation guide</h3><p className={styles.copy}>{plan.data.draft?.callBrief}</p><h3>Success criteria</h3><p>{plan.data.draft?.successCriteria}</p>{(plan.data.draft?.journeySteps || []).length > 0 && <ol>{plan.data.draft.journeySteps.map((step, index) => <li key={index}>{step}</li>)}</ol>}{(plan.data.draft?.citations || []).map((citation, index) => <blockquote key={index}><p>{citation.quote}</p><button type="button" className="pc-button quiet" onClick={() => navigate('brain', citation.sourceId)}>Open source</button></blockquote>)}</details>{missing.length > 0 && <div className={styles.remaining}><strong>Questions to resolve before launch</strong><ul>{missing.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}{error && <p role="alert" className={styles.error}>{error}</p>}{plan.data.campaignId || plan.data.targetCampaignId ? <button type="button" className="pc-button primary" onClick={() => navigate('campaigns', campaignFocus(plan.data.campaignId || plan.data.targetCampaignId!, plan.data.targetCampaignId ? 'agent_content' : 'review'))}>Open campaign</button> : !viewer && <><label className="pc-field">{plan.data.channel === 'browser' ? 'Published agent release' : 'Proposal channel'}{plan.data.channel === 'browser' ? <select className="pc-select" value={releaseId} disabled={busy || pending} onChange={event => setReleaseId(event.target.value)}><option value="">Choose in campaign draft later</option>{releases.map(release => <option key={release.id} value={release.id}>{releaseName(release)}</option>)}</select> : <span>{channelLabel(plan.data.channel)}</span>}</label><button type="button" className="pc-button primary" disabled={busy || pending || stale} onClick={() => void apply()}>{pending ? 'Applying…' : 'Apply saved proposal'}</button></>}</section>;
}
