'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PlatformViewProps } from '../lib/platform/contracts';
import type { CampaignPlan, PlanChannel, PlanKind } from '../lib/campaign-planning/engine';
import type { CampaignIntentInput, ReviewColumn } from '../lib/business/contracts';
import type { CampaignBriefProposal } from '../lib/campaign-brief/contracts';
import { aiRequestId, newAiRequestAttempt, sha256Hex } from '../lib/client/ai-request';
import '../app/campaign-planner.css';

type PlanRecord = { id: string; status: string; revision: number; data: CampaignPlan };
type Props = PlatformViewProps & { onRefresh?: () => Promise<void> | void; focusPlanId?: string; focusOfferingId?: string; onOpenCampaign?: (campaignId: string) => void };
const text = (value: unknown) => typeof value === 'string' ? value : '';
const lines = (value: string) => value.split('\n').map(item => item.trim()).filter(Boolean);
const responseJson = async (response: Response) => {
  const data = await response.json();
  if (!response.ok) throw new Error(text(data?.error) || 'The request could not be completed.');
  return data;
};

export function CampaignPlanner({ records, workspace, navigate, onRefresh, focusPlanId, focusOfferingId, onOpenCampaign }: Props) {
  const sources = useMemo(() => records.filter(record => record.kind === 'brain_source' && record.status === 'approved'), [records]);
  const releases = useMemo(() => records.filter(record => record.kind === 'release' && record.status === 'active'), [records]);
  const offerings = useMemo(() => records.filter(record => record.kind === 'offering' && record.status === 'approved'), [records]);
  const signals = useMemo(() => records.filter(record => record.kind === 'business_signal' && record.status === 'approved'), [records]);
  const [offeringId, setOfferingId] = useState('');
  const [outcome, setOutcome] = useState('');
  const [evidenceRequired, setEvidenceRequired] = useState('');
  const [signalIds, setSignalIds] = useState<string[]>([]);
  const [audienceRationale, setAudienceRationale] = useState('');
  const [reviewColumns, setReviewColumns] = useState<ReviewColumn[]>([]);
  const offering = offerings.find(item => item.id === offeringId);
  const availableSignals = signals.filter(item => !item.data.offeringId || item.data.offeringId === offeringId);
  const [goal, setGoal] = useState('');
  const [kind, setKind] = useState<PlanKind>('sales');
  const [channel, setChannel] = useState<PlanChannel>('browser');
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [releaseId, setReleaseId] = useState('');
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [pending, setPending] = useState(false);
  const [briefPending, setBriefPending] = useState(false);
  const [briefAttempted, setBriefAttempted] = useState(false);
  const [briefProposalId, setBriefProposalId] = useState('');
  const [briefInvalid, setBriefInvalid] = useState('');
  const [briefQuestions, setBriefQuestions] = useState<string[]>([]);
  const [briefNotice, setBriefNotice] = useState('');
  const [error, setError] = useState('');
  const [plansLoaded, setPlansLoaded] = useState(false);
  const selected = plans.find(plan => plan.id === selectedId);
  const choosePlan = (plan?: PlanRecord) => {
    setSelectedId(plan?.id || ''); setGoal(plan?.data.goal || ''); setKind(plan?.data.kind || 'sales');
    setChannel(plan?.data.channel || 'browser'); setContactIds(plan?.data.contactIds || []);
    setSourceIds(plan?.data.explicitIntentV1 ? plan.data.optionalSourceIds || [] : plan?.data.sourceAnchors.map(anchor => anchor.id) || []); setReleaseId(''); setError('');
    const intent = plan?.data.explicitIntentV1;
    setOfferingId(intent?.offering.id || ''); setOutcome(intent?.outcome.label || ''); setEvidenceRequired(intent?.outcome.evidenceRequired.join('\n') || '');
    setSignalIds(intent?.signalAnchors.map(anchor => anchor.id) || []); setAudienceRationale(intent?.audienceRationale || ''); setReviewColumns(intent?.reviewColumns || []);
    setBriefAttempted(false); setBriefProposalId(''); setBriefInvalid(''); setBriefQuestions([]); setBriefNotice('');
  };
  const stale = (selected?.data.sourceAnchors.some(anchor => {
    const source = sources.find(item => item.id === anchor.id);
    return !source || source.revision !== anchor.revision;
  }) ?? false) || !!(selected?.data.explicitIntentV1 && [selected.data.explicitIntentV1.offering, ...selected.data.explicitIntentV1.signalAnchors].some(anchor => !records.some(record => record.id === anchor.id && record.status === 'approved' && record.revision === anchor.revision)));
  const unresolvedOffering = Array.isArray(offering?.data.openQuestions) && offering.data.openQuestions.length > 0;
  const canGenerate = !!offering && !unresolvedOffering && !!goal.trim() && !!outcome.trim() && lines(evidenceRequired).length > 0 && !!audienceRationale.trim();
  const canDraftBrief = !!offering && !unresolvedOffering && !!goal.trim() && contactIds.length > 0;
  useEffect(() => { let active = true; void fetch('/api/campaign-plans').then(responseJson).then(data => { if (active) setPlans(data.plans || []); }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load saved plans.'); }).finally(() => { if (active) setPlansLoaded(true); }); return () => { active = false; }; }, []);
  useEffect(() => { if (!focusPlanId || !plansLoaded) return; const plan = plans.find(item => item.id === focusPlanId); if (plan) choosePlan(plan); else setError('The linked AI plan is unavailable. You can return to Manage to inspect the campaign.'); }, [focusPlanId, plansLoaded]);
  useEffect(() => { if (focusOfferingId && !focusPlanId) { setOfferingId(focusOfferingId); setSelectedId(''); setSignalIds([]); } }, [focusOfferingId, focusPlanId]);
  const toggle = (id: string, current: string[], setter: (ids: string[]) => void, max: number) => setter(current.includes(id) ? current.filter(item => item !== id) : current.length < max ? [...current, id] : current);
  const useBrief = (proposal: { id: string; status: string; data: CampaignBriefProposal }) => {
    if (!offering || proposal.data.offeringId !== offering.id || proposal.data.offeringRevision !== offering.revision) throw new Error('The approved offering changed. Refresh and draft the brief again.');
    setBriefAttempted(true); setBriefProposalId(proposal.id);
    if (proposal.status !== 'ready' || !proposal.data.suggestion) { const reason = proposal.data.invalidReason || 'The AI suggestion needs review under current validation rules.'; setBriefInvalid(reason); throw new Error(reason); }
    setBriefInvalid('');
    const suggestion = proposal.data.suggestion;
    if (suggestion.outcome) setOutcome(suggestion.outcome);
    if (suggestion.evidenceRequired.length) setEvidenceRequired(suggestion.evidenceRequired.join('\n'));
    if (suggestion.audienceRationale) setAudienceRationale(suggestion.audienceRationale);
    if (proposal.data.reviewColumns?.length) setReviewColumns(proposal.data.reviewColumns);
    setBriefQuestions(suggestion.missingContextQuestions);
    setBriefNotice(suggestion.outcome || suggestion.audienceRationale || suggestion.questionsToCollect.length ? 'AI added suggestions to the existing brief fields. Review this brief before generating plan.' : 'AI left the brief fields unchanged because more context is needed. Answer the questions below, then edit the fields or start a new attempt.');
  };
  const draftBrief = async (newAttempt = false) => {
    if (!offering) return;
    setBriefPending(true); setError(''); setBriefInvalid(''); setBriefNotice(''); setBriefQuestions([]);
    let requestId = '';
    try {
      const fingerprint = { offering: { id: offering.id, revision: offering.revision, data: offering.data }, goal: goal.trim(), contactIds: [...contactIds].sort() };
      const scope = `campaign-brief:${workspace.organization.id}`;
      requestId = newAttempt ? await newAiRequestAttempt(scope, fingerprint) : await aiRequestId(scope, fingerprint);
      const { proposal } = await responseJson(await fetch('/api/campaign-brief', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId, offeringId: offering.id, offeringRevision: offering.revision, goal: goal.trim(), contactIds }) }));
      useBrief(proposal);
    } catch (cause) {
      if (requestId) {
        try {
          const { proposal } = await responseJson(await fetch(`/api/campaign-brief?requestId=${encodeURIComponent(requestId)}`, { cache: 'no-store' }));
          useBrief(proposal); return;
        } catch { /* Keep the original error when no completed proposal can be reconciled. */ }
      }
      setError(cause instanceof Error ? cause.message : 'Could not draft the campaign brief.');
    } finally { setBriefPending(false); }
  };
  const recheckBrief = async () => {
    if (!briefProposalId) return;
    setBriefPending(true); setError('');
    try {
      const { proposal } = await responseJson(await fetch('/api/campaign-brief', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'recheck', proposalId: briefProposalId }) }));
      useBrief(proposal);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not recheck the saved AI output.'); }
    finally { setBriefPending(false); }
  };
  const generate = async (newAttempt = false) => {
    setPending(true); setError('');
    let requestId = '';
    try {
      const intent: CampaignIntentInput = { schemaVersion: 1, offeringId, outcome: { label: outcome.trim(), evidenceRequired: lines(evidenceRequired) }, signalIds, audienceRationale: audienceRationale.trim(), reviewColumns: reviewColumns.filter(column => column.label.trim()).map(column => ({ ...column, label: column.label.trim() })) };
      const optionalSourceIds = sourceIds.slice(0, 3);
      const fingerprint = { goal: goal.trim(), kind, channel, contactIds, sourceIds: optionalSourceIds, intent, intentRecords: [offering, ...signals.filter(item => signalIds.includes(item.id))].map(item => item ? { id: item.id, revision: item.revision } : null), sources: optionalSourceIds.map(id => { const source = sources.find(item => item.id === id); return source ? { id, revision: source.revision, title: source.data.title, content: source.data.content } : { id, missing: true }; }) };
      const scope = `campaign-plan:${workspace.organization.id}`;
      requestId = newAttempt ? await newAiRequestAttempt(scope, fingerprint) : await aiRequestId(scope, fingerprint);
      const { plan } = await responseJson(await fetch('/api/campaign-plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal, kind, channel, contactIds, sourceIds: optionalSourceIds, intent, requestId }) }));
      setPlans(previous => [plan, ...previous.filter(item => item.id !== plan.id)]);
      choosePlan(plan);
    } catch (cause) {
      if (requestId) {
        try {
          const expectedId = `campaign-plan:${await sha256Hex(JSON.stringify([workspace.organization.id, requestId]))}`;
          const { plans: current } = await responseJson(await fetch('/api/campaign-plans', { cache: 'no-store' }));
          const saved = (current as PlanRecord[]).find(plan => plan.id === expectedId);
          if (saved) { setPlans(current); choosePlan(saved); return; }
        } catch { /* The original request error remains actionable. */ }
      }
      setError(cause instanceof Error ? cause.message : 'Planning failed.');
    }
    finally { setPending(false); }
  };
  const apply = async () => {
    if (!selected) return;
    if (selected.status === 'applied' && selected.data.campaignId) { if (onOpenCampaign) onOpenCampaign(selected.data.campaignId); else navigate('campaigns', selected.data.campaignId); return; }
    setPending(true); setError('');
    try {
      const { plan, campaign } = await responseJson(await fetch(`/api/campaign-plans/${encodeURIComponent(selected.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'apply', revision: selected.revision, ...(selected.data.channel === 'browser' && releaseId ? { agentReleaseId: releaseId } : {}) }) }));
      setPlans(previous => previous.map(item => item.id === plan.id ? plan : item));
      await onRefresh?.();
      if (onOpenCampaign) onOpenCampaign(campaign.id); else navigate('campaigns', campaign.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create a draft.'); }
    finally { setPending(false); }
  };
  return <section className="cp-panel" aria-label="AI campaign planning">
    <div className="cp-head"><div><h2>{selected ? 'Review campaign plan' : 'Plan a product or service campaign'}</h2><p>{selected ? 'Review the offering, intended outcome, audience and proposed questions before creating a draft.' : 'Choose an offering, describe your goal and select an audience. Let AI draft the brief, then review its details below.'}</p></div></div>
    {plans.length > 0 && <div className="cp-plan-picker"><label className="pc-field">Saved plans<select className="pc-select" value={selectedId} disabled={pending} onChange={event => choosePlan(plans.find(plan => plan.id === event.target.value))}><option value="">Create a new plan</option>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.data.draft.name} · {plan.status}</option>)}</select></label>{selected && <button className="pc-button quiet" type="button" disabled={pending} onClick={() => choosePlan()}>Start a new plan</button>}</div>}
    <div className={`cp-grid ${selected ? 'cp-grid-review' : 'cp-grid-new'}`}><details className="cp-input-details" key={selected?.id || 'new'} open={!selected}><summary>Plan inputs · {selected?.data.kind === 'feedback' ? 'Customer feedback' : 'Sales'} · {selected?.data.contactIds.length || 0} customers</summary><div className="cp-inputs">
      <label className="pc-field">Product or service<select className="pc-select" value={offeringId} disabled={briefPending} onChange={event => { setOfferingId(event.target.value); setSignalIds([]); setBriefAttempted(false); setBriefProposalId(''); setBriefInvalid(''); setBriefQuestions([]); setBriefNotice(''); }}><option value="">Choose an approved offering</option>{offerings.map(item => <option key={item.id} value={item.id}>{text(item.data.name)} · {text(item.data.kind)}</option>)}</select></label>
      {offering && <div className="cp-offering-summary"><p>{text(offering.data.summary)}</p><p className="cp-hint">Intended audience: {text(offering.data.audienceDescription) || 'Not recorded'}</p></div>}
      {(!offerings.length || (!!offeringId && !offering) || unresolvedOffering) && <p className="cp-alert">{unresolvedOffering ? 'Resolve the open questions for this offering and approve its revised details' : 'Review and approve a product or service with source evidence'} in <button type="button" className="cp-link" onClick={() => navigate('brain')}>Company brain</button>, then return here.</p>}
      <label className="pc-field">Describe the campaign<textarea className="pc-textarea" maxLength={1000} rows={3} value={goal} disabled={briefPending} onChange={event => { setGoal(event.target.value); setBriefAttempted(false); setBriefProposalId(''); setBriefInvalid(''); setBriefQuestions([]); setBriefNotice(''); }} placeholder="Ask recent customers what worked, what was confusing, and whether they want help with the next step." /></label>
      <div className="cp-two"><label className="pc-field">Campaign purpose<select className="pc-select" value={kind} onChange={event => setKind(event.target.value as PlanKind)}><option value="sales">Sales follow-up</option><option value="feedback">Customer feedback</option></select></label><label className="pc-field">Working channel<select className="pc-select" value={channel} onChange={event => setChannel(event.target.value as PlanChannel)}><option value="browser">Operator-guided browser calls</option><option value="manual_email">Manual email</option></select></label></div>
      <fieldset className="cp-choices"><legend>Audience · existing customers</legend><p>Choose records for the proposed audience. Permission and eligibility are checked again in campaign preflight.</p><div className="cp-choice-list">{workspace.contacts.map(contact => <label key={contact.id} className="cp-choice"><input type="checkbox" checked={contactIds.includes(contact.id)} disabled={briefPending} onChange={() => { toggle(contact.id, contactIds, setContactIds, 500); setBriefAttempted(false); setBriefProposalId(''); setBriefInvalid(''); setBriefQuestions([]); setBriefNotice(''); }} /><span>{text(contact.name) || 'Customer record'}</span></label>)}</div>{workspace.contacts.length === 0 && <p className="cp-hint">No customers yet. You can prepare a plan now. Add customers in the directory, then generate a new plan with the audience before launch.</p>}</fieldset>
      <div className="cp-brief-actions"><button type="button" className="pc-button quiet" disabled={pending || briefPending || !canDraftBrief} onClick={() => void draftBrief()}>{briefPending ? 'Drafting brief…' : 'Draft the brief with AI'}</button>{briefAttempted && <button type="button" className="cp-link" disabled={pending || briefPending || !canDraftBrief} onClick={() => void draftBrief(true)}>Draft another suggestion · new AI request</button>}</div>
      {briefInvalid && <div className="cp-brief-notice cp-brief-invalid"><strong>The saved AI output needs another validation check.</strong><p>{briefInvalid}</p><button type="button" className="pc-button quiet" disabled={pending || briefPending || !briefProposalId} onClick={() => void recheckBrief()}>{briefPending ? 'Checking saved output…' : 'Recheck saved output'}</button><p>Recheck uses the completed AI receipt and sends no new AI request.</p></div>}
      {briefNotice && <div className="cp-brief-notice" role="status"><strong>{briefNotice}</strong>{briefQuestions.length > 0 && <><p>Missing context to answer before generating a plan:</p><ul>{briefQuestions.map((question, index) => <li key={index}>{question}</li>)}</ul></>}</div>}
      <label className="pc-field">Desired outcome<input className="pc-input" maxLength={240} value={outcome} onChange={event => setOutcome(event.target.value)} placeholder="Understand which part of this service needs improvement" /></label>
      <label className="pc-field">Evidence needed to judge that outcome<textarea className="pc-textarea" maxLength={1600} rows={2} value={evidenceRequired} onChange={event => setEvidenceRequired(event.target.value)} placeholder="One item per line, such as a specific example of an unresolved problem" /><small>These are requirements for later review. Generating or completing a call does not prove success.</small></label>
      <label className="pc-field">Why this audience?<textarea className="pc-textarea" maxLength={1000} rows={2} value={audienceRationale} onChange={event => setAudienceRationale(event.target.value)} placeholder="Explain why these customers are relevant to the selected offering and outcome." /></label>
      <details className="cp-extra-inputs"><summary>Reviewed signals and information to collect</summary><div className="cp-inputs">
        <fieldset className="cp-choices"><legend>Supporting signals · optional</legend><p>Select only relevant reviewed observations. A signal does not grant contact permission or merge customer records.</p><div className="cp-choice-list">{availableSignals.map(signal => { const linked = text(signal.data.contactId); const outsideAudience = !!linked && !contactIds.includes(linked); return <label key={signal.id} className="cp-choice"><input type="checkbox" checked={signalIds.includes(signal.id)} disabled={outsideAudience} onChange={() => toggle(signal.id, signalIds, setSignalIds, 8)} /><span>{text(signal.data.title)}<small className="cp-signal-note">{text(signal.data.observation)}{outsideAudience ? ' · Select its linked customer above to use this signal.' : ''}</small></span></label>; })}</div>{availableSignals.length === 0 && <p className="cp-hint">No reviewed signals for this offering. You can continue using the offering evidence.</p>}</fieldset>
        <label className="pc-field">Information to collect · one column per line<textarea className="pc-textarea" rows={3} maxLength={1600} value={reviewColumns.map(column => column.label).join('\n')} onChange={event => setReviewColumns(event.target.value.split('\n').slice(0, 12).map((label, index) => ({ key: `answer_${index + 1}`, label, type: 'text' })))} placeholder="Part of the service used&#10;Specific difficulty&#10;Requested next step" /><small>AI will propose questions for these columns. Answers remain unknown until collected and reviewed.</small></label>
      </div></details>
      <details className="cp-extra-inputs"><summary>Additional approved company knowledge · optional</summary><fieldset className="cp-choices"><legend>Choose up to 3 supporting sources</legend><p>Offering and signal quotes are included automatically. Additional sources are included in full only when they fit the evidence budget; omissions appear in the review.</p><div className="cp-choice-list">{sources.map(source => <label key={source.id} className="cp-choice"><input type="checkbox" checked={sourceIds.includes(source.id)} onChange={() => toggle(source.id, sourceIds, setSourceIds, 3)} /><span>{text(source.data.title)} <small>Revision {source.revision}</small></span></label>)}</div>{sources.length === 0 && <p className="cp-hint">Approve a source in <button type="button" className="cp-link" onClick={() => navigate('brain')}>Company brain</button> to ground a plan.</p>}</fieldset></details>
      <p className="cp-hint">Planning uses your configured Azure text deployment. Usage is recorded; cost appears when deployment rates are configured. Browser calls enter an operator queue. Manual email prepares content for staff to send.</p>
      <button type="button" className={`pc-button ${selected ? 'quiet' : 'primary'}`} disabled={pending || !canGenerate} onClick={() => void generate()}>{pending ? 'Working…' : selected ? 'Generate from these inputs' : 'Generate campaign plan'}</button>
      {selected && <button type="button" className="pc-button quiet" disabled={pending || !canGenerate} onClick={() => void generate(true)}>Generate another version · new AI request</button>}
    </div></details>{selected && <aside className="cp-results">
      {selected && <div className="cp-plan"><div className="cp-plan-head"><span className="pc-badge">{selected.status}</span><h3>{selected.data.draft.name}</h3><p>{selected.data.draft.objective}</p></div>{stale && <p className="cp-alert">{selected.status === 'applied' ? 'Company knowledge changed since this plan. Current source checks still apply when launching the campaign.' : 'An offering, signal or source changed or lost approval. Review its evidence in Company brain, then generate a fresh plan before applying.'}</p>}
        <div className="cp-meta"><span>{selected.data.contactIds.length} selected customers</span><span>{selected.data.channel === 'browser' ? 'Browser call queue' : 'Manual email'}</span><span>{selected.data.usage.inputTokens + selected.data.usage.outputTokens} tokens</span><span>{selected.data.estimatedCostUsd == null ? 'Cost unknown' : `$${selected.data.estimatedCostUsd.toFixed(6)} estimated`}</span></div>
        {selected.data.explicitIntentV1 ? <section className="cp-intent-review" aria-label="Reviewed campaign intent"><dl><div><dt>Product or service</dt><dd>{selected.data.offeringName || 'Reviewed offering'} · revision {selected.data.explicitIntentV1.offering.revision}</dd></div><div><dt>Desired outcome</dt><dd>{selected.data.explicitIntentV1.outcome.label}</dd></div><div><dt>Audience basis</dt><dd>{selected.data.explicitIntentV1.audienceRationale}</dd></div><div><dt>Evidence required</dt><dd><ul>{selected.data.explicitIntentV1.outcome.evidenceRequired.map((item, index) => <li key={index}>{item}</li>)}</ul></dd></div></dl><p className="cp-hint">Proposed outcome · not yet achieved. {selected.data.explicitIntentV1.signalAnchors.length} reviewed signals support this plan. Changing the audience requires a new review.</p>{selected.data.explicitIntentV1.reviewColumns.length > 0 && <><h4>Planned information to collect</h4><p className="cp-hint">This plan defines the requested fields. Review collected quotes and answers in the campaign conversations and offering results.</p><div className="cp-column-table"><table><thead><tr><th scope="col">Planned column</th><th scope="col">Field format</th></tr></thead><tbody>{selected.data.explicitIntentV1.reviewColumns.map(column => <tr key={column.key}><th scope="row">{column.label}</th><td>{column.type}</td></tr>)}</tbody></table></div></>}</section> : <p className="cp-hint cp-legacy">Legacy / unscoped plan. No reviewed product, service or outcome binding is recorded; this plan does not count as product-level outcome evidence.</p>}
        <h4>Customer journey</h4><ol className="cp-steps">{selected.data.draft.journeySteps.map((step, index) => <li key={index}><span>{index + 1}</span><p>{step}</p></li>)}</ol>
        {selected.data.channel === 'manual_email' && <><h4>Email subject</h4><p className="cp-copy">{selected.data.draft.subject}</p></>}
        <h4>Personalized message</h4><p className="cp-copy">{selected.data.draft.message}</p><h4>Proposed questions and call brief</h4><p className="cp-copy">{selected.data.draft.callBrief}</p><h4>Proposed success criteria · not yet achieved</h4><p className="cp-copy">{selected.data.draft.successCriteria}</p>
        <h4>Approved knowledge behind this proposal</h4><p className="cp-hint">These exact quotes ground the company facts used above. The journey and success criteria are proposed choices for you to review.</p><div className="cp-evidence">{selected.data.draft.citations.map((citation, index) => <details key={`${citation.field}-${index}`}><summary>{citation.field} · {selected.data.sourceAnchors.find(source => source.id === citation.sourceId)?.title || 'Source'}</summary><blockquote>{citation.quote}</blockquote></details>)}</div>
        {selected.data.evidenceSelection && <details className="cp-extra-inputs"><summary>Evidence selection · {selected.data.evidenceSelection.characterCount.toLocaleString()} characters</summary><p className="cp-hint">All selected offering and signal quotes were included without trimming. Any additional sources included were used in full. Other text in the underlying documents was not supplied.</p>{selected.data.evidenceSelection.omitted.length > 0 ? <ul>{selected.data.evidenceSelection.omitted.map(item => <li key={item.sourceId}>{item.title}: {item.reason}</li>)}</ul> : <p className="cp-hint">No selected additional sources were omitted.</p>}</details>}
        {selected.data.draft.missingInputs.length > 0 && <><h4>Assumptions to review</h4><ul>{selected.data.draft.missingInputs.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
        {selected.status !== 'applied' && selected.data.channel === 'browser' && <label className="pc-field">Agent release (optional now)<select className="pc-select" value={releaseId} onChange={event => setReleaseId(event.target.value)}><option value="">Choose in campaign draft later</option>{releases.map(release => { const agent = records.find(item => item.kind === 'agent_definition' && item.id === release.data.agentId); const version = records.find(item => item.kind === 'agent_version' && item.id === release.data.versionId); return <option key={release.id} value={release.id}>{text(agent?.data.name) || 'Representative'} · v{String(version?.data.number || '?')}</option>; })}</select></label>}
        {selected.status !== 'applied' && <p className="cp-hint">Applying creates an editable campaign draft. Review its audience and content, test the representative, and run preflight before launch.</p>}
        <button type="button" className="pc-button primary cp-open-campaign" disabled={pending || (stale && selected.status !== 'applied')} onClick={() => void apply()}>{selected.status === 'applied' ? 'Open campaign' : 'Apply to campaign draft'}</button>
      </div>}
    </aside>}</div>{error && <p role="alert" className="cp-alert">{error}</p>}
  </section>;
}
