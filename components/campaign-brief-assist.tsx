'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, LoaderCircle, Sparkles } from 'lucide-react';
import type { CampaignBriefProposal } from '../lib/campaign-brief/contracts';
import { aiRequestId, newAiRequestAttempt } from '../lib/client/ai-request';
import type { PlatformRecord, WorkspaceData } from '../lib/platform/contracts';
import { readCampaignSetup, type CampaignSetupFields } from '../lib/platform/campaign-workflow';
import styles from './campaign-brief-assist.module.css';

export type CampaignBriefAssistProps = {
  campaign: PlatformRecord;
  records: PlatformRecord[];
  workspace: WorkspaceData;
  busy: boolean;
  dirty: boolean;
  onBusyChange?: (busy: boolean) => void;
  onSuggestion: (patch: CampaignSetupFields) => void;
};

type Proposal = PlatformRecord<CampaignBriefProposal>;
type CurrentProps = Pick<CampaignBriefAssistProps, 'campaign' | 'records' | 'workspace' | 'busy' | 'dirty'>;
type SavedInput = {
  campaignId: string;
  campaignRevision: number;
  goal: string;
  contactIds: string[];
  offering?: PlatformRecord;
};
type ReceivedProposal = { proposal: Proposal; input: SavedInput };

const normalizedIds = (ids: string[] = []) => [...new Set(ids)].sort();
const sameIds = (left: string[] = [], right: string[] = []) => JSON.stringify(normalizedIds(left)) === JSON.stringify(normalizedIds(right));

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: unknown };
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'The AI brief request could not be completed.');
  return body as T;
}

function savedInput({ campaign, records }: CurrentProps): SavedInput {
  const setup = readCampaignSetup(campaign);
  const offeringId = setup?.fields.offeringId || '';
  return {
    campaignId: campaign.id,
    campaignRevision: campaign.revision,
    goal: setup?.fields.goal?.trim() || '',
    contactIds: normalizedIds(setup?.fields.contactIds),
    offering: records.find(record => record.kind === 'offering' && record.id === offeringId && record.status === 'approved'),
  };
}

function inputBlocker(props: CurrentProps, input: SavedInput): string {
  if (props.workspace.user.role === 'viewer') return 'Read-only access. An operator can draft and use AI suggestions.';
  if (!readCampaignSetup(props.campaign)) return 'AI brief assistance is available while this campaign is in saved setup.';
  if (props.dirty) return 'Save your current campaign changes before drafting an AI brief.';
  if (!input.goal) return 'Save a campaign goal before drafting an AI brief.';
  if (!input.offering) return 'Save a current approved product or service before drafting an AI brief.';
  if (Array.isArray(input.offering.data.openQuestions) && input.offering.data.openQuestions.length > 0) return 'Resolve the approved offering’s open questions before drafting an AI brief.';
  if (!input.contactIds.length) return 'Save at least one selected customer before drafting an AI brief.';
  return '';
}

function proposalInputIssue(received: ReceivedProposal, props: CurrentProps): string {
  const current = savedInput(props);
  const { proposal, input } = received;
  if (props.dirty) return 'The campaign has unsaved changes. Save them, then draft or review a proposal for the saved inputs.';
  if (input.campaignId !== current.campaignId || input.campaignRevision !== current.campaignRevision) return 'The saved campaign changed after this proposal request. Draft the brief again from the current saved version.';
  if (!current.offering || proposal.data.offeringId !== current.offering.id || proposal.data.offeringRevision !== current.offering.revision) return 'The approved offering changed. Draft the brief again from the current offering.';
  if (proposal.data.goal.trim() !== current.goal) return 'The saved campaign goal changed. Draft the brief again from the current goal.';
  if (!sameIds(proposal.data.contactIds, current.contactIds)) return 'The saved audience changed. Draft the brief again for the current selected customers.';
  return '';
}

function proposalIssue(received: ReceivedProposal, props: CurrentProps): string {
  const inputIssue = proposalInputIssue(received, props);
  if (inputIssue) return inputIssue;
  const { proposal } = received;
  if (proposal.status !== 'ready' || !proposal.data.suggestion) return proposal.data.invalidReason || 'The saved AI output is not ready to use.';
  return '';
}

export function CampaignBriefAssist(props: CampaignBriefAssistProps) {
  const { campaign, records, workspace, busy, dirty, onSuggestion } = props;
  const [received, setReceived] = useState<ReceivedProposal>();
  const [pending, setPending] = useState<'draft' | 'recheck' | ''>('');
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const propsRef = useRef<CurrentProps>({ campaign, records, workspace, busy, dirty });
  const onBusyChangeRef = useRef(props.onBusyChange);
  const mountedRef = useRef(false);
  const inFlightRef = useRef(false);
  const controllerRef = useRef<AbortController | undefined>(undefined);
  propsRef.current = { campaign, records, workspace, busy, dirty };
  onBusyChangeRef.current = props.onBusyChange;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      inFlightRef.current = false;
      onBusyChangeRef.current?.(false);
    };
  }, []);
  useEffect(() => {
    setReceived(undefined); setAttempted(false); setError(''); setNotice('');
  }, [campaign.id]);

  const current = savedInput(propsRef.current);
  const blocker = inputBlocker(propsRef.current, current);
  const selected = received?.proposal;
  const suggestion = selected?.data.suggestion;
  const proposalInputReason = received ? proposalInputIssue(received, propsRef.current) : '';
  const staleReason = received ? proposalIssue(received, propsRef.current) : '';
  const viewer = workspace.user.role === 'viewer';
  const canRequest = !viewer && !busy && !pending && !blocker;
  const canUse = !!received && !busy && !pending && !staleReason;

  const timedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 65_000);
    try { return await fetch(input, { ...init, signal: controller.signal }); }
    finally {
      window.clearTimeout(timeout);
      if (controllerRef.current === controller) controllerRef.current = undefined;
    }
  };
  const begin = (kind: 'draft' | 'recheck') => {
    inFlightRef.current = true;
    onBusyChangeRef.current?.(true);
    setPending(kind); setError(''); setNotice('');
  };
  const finish = () => {
    inFlightRef.current = false;
    if (mountedRef.current) { setPending(''); onBusyChangeRef.current?.(false); }
  };
  const receive = (proposal: Proposal, input: SavedInput) => {
    if (proposal.status === 'pending') throw new Error('This AI brief is still pending or its outcome is uncertain. Check this same request later or start one explicit new attempt.');
    const next = { proposal, input };
    if (mountedRef.current) {
      setReceived(next);
      const issue = proposalIssue(next, propsRef.current);
      if (proposal.status === 'invalid') setError(proposal.data.invalidReason || 'The saved AI output did not pass current validation.');
      else if (issue) setError(issue);
      else setNotice('A reviewable suggestion is ready. Your campaign fields have not changed.');
    }
  };

  const draft = async (newAttempt: boolean) => {
    if (inFlightRef.current) return;
    const requestProps = propsRef.current;
    const input = savedInput(requestProps);
    const requestBlocker = inputBlocker(requestProps, input);
    if (requestBlocker || requestProps.busy) { setError(requestBlocker || 'Wait for the current campaign action to finish.'); return; }
    setAttempted(true); begin('draft');
    let requestId = '';
    try {
      const offering = input.offering!;
      const fingerprint = { offering: { id: offering.id, revision: offering.revision, data: offering.data }, goal: input.goal, contactIds: input.contactIds };
      const scope = `campaign-brief:${requestProps.workspace.organization.id}`;
      requestId = newAttempt ? await newAiRequestAttempt(scope, fingerprint) : await aiRequestId(scope, fingerprint);
      const result = await responseJson<{ proposal: Proposal }>(await timedFetch('/api/campaign-brief', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, offeringId: offering.id, offeringRevision: offering.revision, goal: input.goal, contactIds: input.contactIds }),
      }));
      receive(result.proposal, input);
    } catch (cause) {
      const original = cause instanceof Error ? cause.message : 'Could not draft the campaign brief.';
      if (requestId) {
        try {
          const result = await responseJson<{ proposal: Proposal }>(await timedFetch(`/api/campaign-brief?requestId=${encodeURIComponent(requestId)}`, { cache: 'no-store' }));
          receive(result.proposal, input);
          return;
        } catch { /* Preserve the first failure when the saved request cannot be reconciled. */ }
      }
      if (mountedRef.current) setError(original);
    } finally { finish(); }
  };

  const recheck = async () => {
    if (!received || inFlightRef.current || viewer || busy) return;
    const issue = proposalInputIssue(received, propsRef.current);
    if (issue) { setError(issue); return; }
    begin('recheck');
    try {
      const result = await responseJson<{ proposal: Proposal }>(await timedFetch('/api/campaign-brief', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'recheck', proposalId: received.proposal.id }),
      }));
      receive(result.proposal, savedInput(propsRef.current));
    } catch (cause) {
      if (mountedRef.current) setError(cause instanceof Error ? cause.message : 'Could not recheck the saved AI output.');
    } finally { finish(); }
  };

  const useSuggestions = () => {
    if (!received || inFlightRef.current || viewer || busy) return;
    const issue = proposalIssue(received, propsRef.current);
    if (issue) { setError(issue); return; }
    const saved = readCampaignSetup(propsRef.current.campaign)?.fields;
    const proposed = received.proposal.data.suggestion!;
    const patch: CampaignSetupFields = {};
    if (proposed.outcome) patch.outcome = {
      label: proposed.outcome,
      evidenceRequired: proposed.evidenceRequired.length ? proposed.evidenceRequired : saved?.outcome?.evidenceRequired || [],
    };
    if (proposed.audienceRationale) patch.audienceRationale = proposed.audienceRationale;
    if (received.proposal.data.reviewColumns?.length) patch.reviewColumns = received.proposal.data.reviewColumns;
    if (!Object.keys(patch).length) {
      setNotice('The AI left the editable fields unchanged. Use the missing-context questions to refine the saved goal, then start a new attempt.');
      return;
    }
    onSuggestion(patch);
    setError('');
    setNotice('Suggestions added to the local draft. Review them and save the campaign when they are correct.');
  };

  return <section className={styles.assist} aria-label="AI campaign brief assistance">
    <details className={styles.disclosure}>
      <summary>
        <span className={styles.summaryIcon}><Sparkles size={16} aria-hidden="true" /></span>
        <span><strong>Draft outcome and questions with AI</strong><small>Optional help from the saved goal, offering evidence and selected audience count</small></span>
        <ChevronRight className={styles.chevron} size={17} aria-hidden="true" />
      </summary>
      <div className={styles.body}>
        <p className={styles.intro}>Customer identities are not sent to the model. Suggestions are proposed strategy for your review, not approved company facts, proven outcomes, consent or eligibility.</p>
        {blocker && <p className={styles.blocker}>{blocker}</p>}
        {!viewer && <div className={styles.actions}>
          <button type="button" className="pc-button quiet" disabled={!canRequest} onClick={() => void draft(false)}>
            {pending === 'draft' ? <LoaderCircle className={styles.spinner} size={15} aria-hidden="true" /> : <Sparkles size={15} aria-hidden="true" />}
            {pending === 'draft' ? 'Drafting…' : 'Draft suggestion'}
          </button>
          {attempted && <button type="button" className={styles.textButton} disabled={!canRequest} onClick={() => void draft(true)}>Start a new AI attempt</button>}
        </div>}
        <div className={styles.feedback} aria-live="polite">
          {error && <p role="alert" className={styles.error}>{error}</p>}
          {notice && <p className={styles.notice}>{notice}</p>}
        </div>
        {selected && <div className={styles.proposal}>
          <header className={styles.proposalHead}>
            <div><h3>AI brief proposal</h3><p>{selected.status === 'ready' ? 'Review each suggestion before using it.' : 'This saved output needs validation before it can be used.'}</p></div>
            <span className={selected.status === 'ready' ? styles.ready : styles.invalid}>{selected.status === 'ready' ? <Check size={14} aria-hidden="true" /> : null}{selected.status}</span>
          </header>
          {proposalInputReason && <p className={styles.blocker}>{proposalInputReason}</p>}
          {selected.status === 'invalid' && <div className={styles.invalidPanel}>
            <strong>Saved output did not pass current validation.</strong>
            <p>{selected.data.invalidReason || 'The saved AI output needs review.'}</p>
            {selected.data.aiRunId && !viewer && <button type="button" className="pc-button quiet" disabled={busy || !!pending} onClick={() => void recheck()}>{pending === 'recheck' ? 'Rechecking…' : 'Recheck saved output'}</button>}
            <small>Recheck uses the existing completed receipt and sends no new AI request.</small>
          </div>}
          {suggestion && <>
            <dl className={styles.fields}>
              <div><dt>Proposed outcome</dt><dd>{suggestion.outcome || <span>No outcome proposed</span>}</dd></div>
              <div><dt>Evidence required</dt><dd>{suggestion.evidenceRequired.length ? <ul>{suggestion.evidenceRequired.map((item, index) => <li key={index}>{item}</li>)}</ul> : <span>No evidence requirements proposed</span>}</dd></div>
              <div><dt>Audience rationale</dt><dd>{suggestion.audienceRationale || <span>No audience rationale proposed</span>}</dd></div>
              <div><dt>Questions to collect</dt><dd>{suggestion.questionsToCollect.length ? <ul>{suggestion.questionsToCollect.map((item, index) => <li key={index}>{item}</li>)}</ul> : <span>No questions proposed</span>}</dd></div>
              <div><dt>Typed review columns</dt><dd>{selected.data.reviewColumns?.length ? <ul>{selected.data.reviewColumns.map(column => <li key={column.key}>{column.label} <small>{column.type}</small></li>)}</ul> : <span>No review columns proposed</span>}</dd></div>
            </dl>
            {suggestion.missingContextQuestions.length > 0 && <div className={styles.questions}><strong>Missing context to resolve</strong><ul>{suggestion.missingContextQuestions.map((question, index) => <li key={index}>{question}</li>)}</ul></div>}
          </>}
          {selected.data.sourceBasis.length > 0 && <details className={styles.sources}>
            <summary>Offering evidence used ({selected.data.sourceBasis.length})</summary>
            <div>{selected.data.sourceBasis.map((source, index) => {
              const record = records.find(item => item.id === source.sourceId);
              return <blockquote key={`${source.sourceId}-${index}`}><strong>{String(record?.data.title || 'Approved source')}</strong><p>{source.quote}</p></blockquote>;
            })}</div>
            <p>These quotes ground the approved offering supplied to the model. They do not make the AI strategy fields approved company facts or attach this proposal to campaign provenance.</p>
          </details>}
          {selected.status === 'ready' && <div className={styles.useRow}>
            <button type="button" className="pc-button primary" disabled={!canUse} onClick={useSuggestions}>Use these suggestions</button>
            <p>This changes only the local outcome, evidence, audience rationale and review columns that have nonempty suggestions. It does not save or launch the campaign.</p>
          </div>}
        </div>}
      </div>
    </details>
  </section>;
}
