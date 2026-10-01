'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, LoaderCircle, Sparkles } from 'lucide-react';
import type { PlatformRecord, PlatformViewProps, WorkspaceData } from '../lib/platform/contracts';
import type { CampaignPlan } from '../lib/campaign-planning/engine';
import { campaignSetupReadiness, readCampaignSetup } from '../lib/platform/campaign-workflow';
import { aiRequestId, newAiRequestAttempt } from '../lib/client/ai-request';
import styles from './campaign-planning-assist.module.css';

type Props = {
  campaign: PlatformRecord;
  records: PlatformRecord[];
  workspace: WorkspaceData;
  busy: boolean;
  dirty: boolean;
  onChanged: () => Promise<void>;
  navigate: PlatformViewProps['navigate'];
  onBusyChange?: (busy: boolean) => void;
};
type Plan = PlatformRecord<CampaignPlan>;
const proposedFields = [
  ['name', 'Campaign name'], ['objective', 'Conversation objective'], ['subject', 'Email subject'],
  ['message', 'Opening message'], ['callBrief', 'Conversation guide'], ['successCriteria', 'Success criteria'],
] as const;
async function json<T>(request: Promise<Response>): Promise<T> {
  const response = await request, body = await response.json();
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'The AI request could not be completed.');
  return body as T;
}

export function CampaignPlanningAssist({ campaign, records, workspace, busy, dirty, onChanged, navigate, onBusyChange }: Props) {
  const setup = readCampaignSetup(campaign);
  const viewer = workspace.user.role === 'viewer';
  const [received, setReceived] = useState<Plan>();
  const [selectedId, setSelectedId] = useState('');
  const [pending, setPending] = useState<'generate' | 'apply' | ''>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const inFlight = useRef(false);
  useEffect(() => () => { onBusyChange?.(false); }, [onBusyChange]);
  const plans = useMemo(() => {
    const collected = new Map(records.filter(record => record.kind === 'campaign_plan' && record.data.targetCampaignId === campaign.id).map(record => [record.id, record as Plan]));
    if (received?.data.targetCampaignId === campaign.id && (!collected.has(received.id) || collected.get(received.id)!.revision < received.revision)) collected.set(received.id, received);
    return [...collected.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [records, received, campaign.id]);
  const selected = plans.find(plan => plan.id === selectedId) || plans.find(plan => plan.id === setup?.acceptedPlan?.planId) || plans[0];
  if (!setup) return null;
  const readiness = campaignSetupReadiness(setup.fields);
  const blockers = [...readiness.intent, ...readiness.audience, ...(!setup.fields.channel ? ['Choose a channel.'] : [])];
  const applied = !!selected && setup.acceptedPlan?.planId === selected.id;
  const obsolete = !!selected && !applied && selected.data.targetCampaignRevision !== campaign.revision;
  const sourcesChanged = !!selected && selected.data.sourceAnchors.some(anchor => !records.some(record => record.kind === 'brain_source' && record.id === anchor.id && record.status === 'approved' && record.revision === anchor.revision));
  const canGenerate = !viewer && !busy && !pending && !dirty && !blockers.length;
  const canApply = !!selected && selected.status === 'proposed' && !obsolete && !sourcesChanged && !viewer && !busy && !pending && !dirty;

  const generate = async (newAttempt: boolean) => {
    if (inFlight.current || !canGenerate) return;
    inFlight.current = true; onBusyChange?.(true); setPending('generate'); setError(''); setNotice('');
    try {
      const input = { campaignId: campaign.id, campaignRevision: campaign.revision };
      const scope = `campaign-workflow:${workspace.organization.id}`;
      const requestId = await (newAttempt ? newAiRequestAttempt(scope, input) : aiRequestId(scope, input));
      const result = await json<{ plan: Plan }>(fetch('/api/campaign-plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, requestId }), signal: AbortSignal.timeout(65_000) }));
      if (result.plan.data.targetCampaignId !== campaign.id) throw new Error('The proposal did not match this campaign. Refresh before continuing.');
      setReceived(result.plan); setSelectedId(result.plan.id); await onChanged();
      setNotice('Proposal saved. Compare it with your draft before applying it.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'AI planning could not complete. Your saved campaign is unchanged.'); }
    finally { inFlight.current = false; onBusyChange?.(false); setPending(''); }
  };
  const apply = async () => {
    if (!canApply || !selected || inFlight.current) return;
    inFlight.current = true; onBusyChange?.(true); setPending('apply'); setError(''); setNotice('');
    try {
      const result = await json<{ plan: Plan; campaign: PlatformRecord }>(fetch(`/api/campaign-plans/${encodeURIComponent(selected.id)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', revision: selected.revision, campaignId: campaign.id, campaignRevision: selected.data.targetCampaignRevision }),
        signal: AbortSignal.timeout(65_000),
      }));
      if (result.campaign.id !== campaign.id) throw new Error('The saved result did not match this campaign. Refresh before continuing.');
      setReceived(result.plan); await onChanged(); setNotice('Proposal applied to this campaign. Review the content and launch settings next.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The proposal could not be applied. Refresh and review the saved campaign.'); }
    finally { inFlight.current = false; onBusyChange?.(false); setPending(''); }
  };

  return <section className={styles.assist} aria-label="AI campaign assistance" aria-busy={!!pending}>
    <header><div><h3><Sparkles size={18} aria-hidden="true"/> Draft the content with AI</h3><p>Use the saved goal, audience and reviewed company evidence. You choose whether to apply the proposal.</p></div></header>
    {dirty ? <p className={styles.note}>Save your changes before asking AI to use them.</p> : blockers.length > 0 && <div className={styles.note}><p>Complete these campaign details first:</p><ul>{blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul></div>}
    <div className={styles.actions}>
      <button className="pc-button" type="button" disabled={!canGenerate} onClick={() => void generate(false)}>{pending === 'generate' ? <LoaderCircle size={16} className="spin"/> : <Sparkles size={16}/>} {pending === 'generate' ? 'Drafting proposal…' : error ? 'Check previous attempt' : 'Draft with AI'}</button>
      {(selected || error) && <button className="pc-button quiet" type="button" disabled={!canGenerate} onClick={() => void generate(true)}>Request another AI draft</button>}
    </div>
    <p className={styles.hint}>Uses your configured Azure service. Checking a previous attempt reuses its request; another draft starts a new request.</p>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.note} role="status">{notice}</p>}
    {selected && <div className={styles.proposal}>
      <div className={styles.proposalHead}><h4>Review the proposal</h4>{applied && <span><Check size={15}/> Applied to this draft</span>}</div>
      {plans.length > 1 && <label className="pc-field">Saved proposal<select className="pc-select" value={selected.id} onChange={event => setSelectedId(event.target.value)}>{plans.map(plan => <option key={plan.id} value={plan.id}>{new Date(plan.createdAt).toLocaleString()} · {plan.status}</option>)}</select></label>}
      {obsolete && <p className={styles.error}>This proposal belongs to an earlier saved draft. Request a new proposal for the current campaign.</p>}
      {sourcesChanged && <p className={styles.error}>A referenced company source changed. Review the source and generate a new proposal.</p>}
      {!!selected.data.draft.missingInputs.length && <div className={styles.note}><strong>Questions to resolve</strong><ul>{selected.data.draft.missingInputs.map(question => <li key={question}>{question}</li>)}</ul></div>}
      <dl className={styles.comparison}>{proposedFields.filter(([field]) => field !== 'subject' || setup.fields.channel !== 'browser').map(([field, label]) => <div key={field}><dt>{label}</dt><dd><span>Saved draft</span><p>{setup.fields[field] || 'Not written yet'}</p><span>AI proposal</span><p>{selected.data.draft[field] || 'Not proposed'}</p></dd></div>)}</dl>
      {!!selected.data.draft.journeySteps.length && <details><summary>Proposed conversation steps</summary><ol>{selected.data.draft.journeySteps.map((step, index) => <li key={`${index}:${step}`}>{step}</li>)}</ol></details>}
      <details><summary>Company evidence · {selected.data.draft.citations.length} citations</summary>{selected.data.draft.citations.map((citation, index) => <blockquote key={`${citation.sourceId}:${index}`}><p>{citation.quote}</p><button type="button" className="pc-button quiet" onClick={() => navigate('brain', citation.sourceId)}>Open source <ArrowRight size={13}/></button></blockquote>)}</details>
      <div className={styles.actions}><button className="pc-button primary" type="button" disabled={!canApply} onClick={() => void apply()}>{pending === 'apply' ? 'Applying proposal…' : applied ? 'Applied to this campaign' : 'Apply to this campaign'}</button></div>
      <p className={styles.hint}>Applying updates this saved draft. It does not launch a campaign or contact anyone.</p>
    </div>}
  </section>;
}
