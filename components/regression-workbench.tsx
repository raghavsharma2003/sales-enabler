'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronRight, FlaskConical, LoaderCircle, Plus, RefreshCw, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import type { PlatformRecord, WorkspaceData, WorkspaceEntity } from '../lib/platform/contracts';
import type {
  RegressionAction,
  RegressionActionResponse,
  RegressionCasePreview,
  RegressionCaseRecord,
  RegressionListResponse,
  RegressionReviewRecord,
  RegressionRunRecord,
  RegressionSuiteCheck,
  TextRehearsalTurn,
} from '../lib/regression/contracts';
import { TEXT_REHEARSAL_DISCLAIMER } from '../lib/regression/contracts';
import styles from './regression-workbench.module.css';

type CriterionDraft = { key: string; text: string; blocking: boolean };
type ReviewDraft = { verdict: 'met' | 'not_met' | 'uncertain' | ''; reason: string };
type Props = {
  records: PlatformRecord[];
  workspace: WorkspaceData;
  focusId?: string;
};

const REQUEST_TIMEOUT_MS = 65_000;
const TIMEOUT_MESSAGE = 'The request timed out. Refresh saved rehearsals to check before retrying.';
const uid = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
const shortId = (value: string | undefined) => value ? value.slice(-8) : 'Unavailable';
const callRef = (value: string | undefined) => value ? value.slice(-8) : 'Unavailable';
const formatTime = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Time unavailable';
const sentence = (value: string) => value.replaceAll('_', ' ').replace(/^./, character => character.toUpperCase());
const transcriptOf = (session?: WorkspaceEntity): TextRehearsalTurn[] => Array.isArray(session?.transcript)
  ? session.transcript.filter((turn): turn is TextRehearsalTurn => !!turn && typeof turn === 'object' && !Array.isArray(turn) && ((turn as { role?: unknown }).role === 'user' || (turn as { role?: unknown }).role === 'assistant') && typeof (turn as { text?: unknown }).text === 'string')
  : [];

async function boundedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  catch (failure) {
    if (controller.signal.aborted) throw new Error(TIMEOUT_MESSAGE);
    throw failure;
  } finally { clearTimeout(timeout); }
}

async function regressionApi<T extends RegressionActionResponse>(action: RegressionAction, body: Record<string, unknown>): Promise<T> {
  const response = await boundedFetch('/api/regression', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || 'The text rehearsal request could not be completed.');
  return data;
}

async function loadRegression(): Promise<RegressionListResponse> {
  const response = await boundedFetch('/api/regression', { credentials: 'same-origin', cache: 'no-store' });
  const data = await response.json() as RegressionListResponse & { error?: string };
  if (!response.ok) throw new Error(data.error || 'Could not load saved text rehearsals.');
  return data;
}

function sessionLabel(session: WorkspaceEntity) {
  const source = session.source === 'browser_preview' ? 'Draft preview' : session.source === 'browser_voice' ? 'Released browser agent' : session.source === 'public_chat' ? 'Public chat' : session.source === 'channel_chat' ? 'Channel chat' : session.source === 'public_voice' ? 'Public voice' : 'Saved conversation';
  return `${source} · ${formatTime(session.createdAt)} · call ref ${callRef(session.id)}`;
}

export function RegressionWorkbench({ records, workspace, focusId }: Props) {
  const focusedSessionId = focusId?.startsWith('session:') ? focusId.slice('session:'.length) : '';
  const eligibleSessions = useMemo(() => workspace.sessions.filter(session => typeof session.agentId === 'string' && (typeof session.agentVersionId === 'string' || typeof session.previewId === 'string') && transcriptOf(session).some(turn => turn.role === 'user')), [workspace.sessions]);
  const initialSessionId = eligibleSessions.some(session => session.id === focusedSessionId) ? focusedSessionId : eligibleSessions[0]?.id || '';
  const [sourceSessionId, setSourceSessionId] = useState(initialSessionId);
  const [callerTurnIndex, setCallerTurnIndex] = useState(-1);
  const [prefixStartIndex, setPrefixStartIndex] = useState(0);
  const [preview, setPreview] = useState<RegressionCasePreview | null>(null);
  const [turns, setTurns] = useState<TextRehearsalTurn[]>([]);
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('');
  const [expectedOutcome, setExpectedOutcome] = useState('');
  const [criteria, setCriteria] = useState<CriterionDraft[]>([{ key: uid(), text: '', blocking: true }]);
  const [required, setRequired] = useState(true);
  const [redactionConfirmed, setRedactionConfirmed] = useState(false);
  const [revisingCaseId, setRevisingCaseId] = useState('');
  const [data, setData] = useState<RegressionListResponse>({ cases: [], runs: [], reviews: [] });
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [candidateVersionId, setCandidateVersionId] = useState('');
  const [selectedRunId, setSelectedRunId] = useState('');
  const [suite, setSuite] = useState<RegressionSuiteCheck | null>(null);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, ReviewDraft>>({});
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const reviewDirty = Object.values(reviewDrafts).some(draft => !!draft.verdict || !!draft.reason.trim());
  dirtyRef.current = dirty || reviewDirty;

  const sourceSession = eligibleSessions.find(session => session.id === sourceSessionId);
  const sourceTranscript = transcriptOf(sourceSession);
  const callerTurns = sourceTranscript.map((turn, index) => ({ turn, index })).filter(item => item.turn.role === 'user');
  const selectedCase = data.cases.find(item => item.id === selectedCaseId) || data.cases.find(item => item.status === 'approved');
  const versions = useMemo(() => records.filter(record => record.kind === 'agent_version' && record.data.agentId === selectedCase?.data.agentId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [records, selectedCase?.data.agentId]);
  const candidateVersion = versions.find(version => version.id === candidateVersionId) || versions[0];
  const caseRuns = data.runs.filter(run => run.data.caseId === selectedCase?.id && run.data.agentVersionId === candidateVersion?.id).sort((a, b) => b.data.attemptSequence - a.data.attemptSequence || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const selectedRun = caseRuns.find(run => run.id === selectedRunId) || caseRuns[0];
  const assistantReply = selectedRun ? [...selectedRun.data.transcript].reverse().find(turn => turn.role === 'assistant')?.text : '';
  const latestReview = useCallback((runId: string, criterionId: string) => data.reviews.filter(review => review.data.runId === runId && review.data.criterionId === criterionId).sort((a, b) => b.data.sequence - a.data.sequence || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0], [data.reviews]);

  function clearCaseDraft() {
    setPreview(null); setTurns([]); setName(''); setLanguage(''); setExpectedOutcome('');
    setCriteria([{ key: uid(), text: '', blocking: true }]); setRequired(true); setRedactionConfirmed(false); setRevisingCaseId(''); setDirty(false);
  }

  const refresh = useCallback(async (preferred?: { caseId?: string; runId?: string }) => {
    const next = await loadRegression();
    setData(next);
    setSelectedCaseId(current => preferred?.caseId || (next.cases.some(item => item.id === current) ? current : next.cases.find(item => item.status === 'approved')?.id || ''));
    setSelectedRunId(current => preferred?.runId || (next.runs.some(item => item.id === current) ? current : ''));
  }, []);

  async function refreshSaved() {
    if (pending) return;
    setPending('refresh'); setError(''); setNotice('');
    try { await refresh(); setNotice('Saved text rehearsals refreshed.'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not refresh saved text rehearsals.'); }
    finally { setPending(''); }
  }

  useEffect(() => {
    let active = true;
    setPending('load');
    void loadRegression().then(next => {
      if (!active) return;
      setData(next);
      const focusedCase = next.cases.find(item => item.id === focusId) || next.cases.find(item => next.runs.find(run => run.id === focusId)?.data.caseId === item.id);
      setSelectedCaseId(focusedCase?.id || next.cases.find(item => item.status === 'approved')?.id || '');
      setSelectedRunId(next.runs.find(item => item.id === focusId)?.id || '');
    }).catch(failure => { if (active) setError(failure instanceof Error ? failure.message : 'Could not load saved text rehearsals.'); }).finally(() => { if (active) setPending(''); });
    return () => { active = false; };
  }, [focusId]);

  useEffect(() => {
    if (!sourceSession) return;
    const available = callerTurns.at(-1)?.index ?? -1;
    setCallerTurnIndex(current => callerTurns.some(item => item.index === current) ? current : available);
    setPrefixStartIndex(Math.max(0, available - 7));
    clearCaseDraft();
  // callerTurns is derived from sourceSession and intentionally reset only when the selected source changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceSessionId]);

  useEffect(() => {
    if (!candidateVersionId && versions[0]) setCandidateVersionId(versions[0].id);
    if (candidateVersionId && !versions.some(version => version.id === candidateVersionId)) setCandidateVersionId(versions[0]?.id || '');
    setSuite(null);
  }, [candidateVersionId, selectedCaseId, versions]);

  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    const navigation = (event: Event) => { if (dirtyRef.current && !window.confirm('Leave this text rehearsal with unsaved checkpoint or review changes?')) event.preventDefault(); };
    window.addEventListener('beforeunload', unload); window.addEventListener('relay:before-navigation', navigation);
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener('relay:before-navigation', navigation); };
  }, []);

  async function previewCheckpoint(seed?: RegressionCaseRecord) {
    if (!sourceSessionId || callerTurnIndex < 0 || pending) return;
    setPending('preview'); setError(''); setNotice('');
    try {
      const response = await regressionApi<{ preview: RegressionCasePreview }>('case.preview', { sourceSessionId, selectedCallerTurnIndex: callerTurnIndex, prefixStartIndex });
      setPreview(response.preview);
      setTurns(seed?.data.derivative.turns || response.preview.suggestedDerivative);
      setRedactionConfirmed(false);
      setDirty(true);
      if (seed) {
        setName(seed.data.rubric.name); setLanguage(seed.data.rubric.language); setExpectedOutcome(seed.data.rubric.expectedOutcome);
        setCriteria(seed.data.rubric.criteria.map(criterion => ({ key: uid(), text: criterion.text, blocking: criterion.blocking })));
        setRequired(seed.data.required); setRevisingCaseId(seed.id);
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not prepare the checkpoint.'); }
    finally { setPending(''); }
  }

  async function beginRevision(item: RegressionCaseRecord) {
    if (dirty && !window.confirm('Discard the current unsaved checkpoint and prepare this saved case for revision?')) return;
    const session = eligibleSessions.find(candidate => candidate.id === item.data.source.sessionId);
    if (!session) { setError('The source conversation is unavailable. The sanitized saved case can still be run, but it cannot be revised from its source.'); return; }
    setSourceSessionId(session.id);
    setCallerTurnIndex(item.data.source.selectedCallerTurnIndex);
    setPrefixStartIndex(item.data.source.prefixStartIndex);
    setPending('preview'); setError(''); setNotice('');
    try {
      const response = await regressionApi<{ preview: RegressionCasePreview }>('case.preview', { sourceSessionId: session.id, selectedCallerTurnIndex: item.data.source.selectedCallerTurnIndex, prefixStartIndex: item.data.source.prefixStartIndex });
      setPreview(response.preview); setTurns(item.data.derivative.turns); setName(item.data.rubric.name); setLanguage(item.data.rubric.language); setExpectedOutcome(item.data.rubric.expectedOutcome);
      setCriteria(item.data.rubric.criteria.map(criterion => ({ key: uid(), text: criterion.text, blocking: criterion.blocking })));
      setRequired(item.data.required); setRedactionConfirmed(false); setRevisingCaseId(item.id); setDirty(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not prepare this case revision.'); }
    finally { setPending(''); }
  }

  async function saveCase() {
    if (!preview || !redactionConfirmed || pending) return;
    const populated = criteria.filter(criterion => criterion.text.trim());
    if (!name.trim() || !language.trim() || !expectedOutcome.trim() || !populated.length || turns.some(turn => !turn.text.trim())) {
      setError('Complete the case name, language, expected outcome, every checkpoint turn, and at least one criterion.'); return;
    }
    const action = revisingCaseId ? 'case.revise' : 'case.create';
    setPending('save-case'); setError(''); setNotice('');
    try {
      const response = await regressionApi<{ case: RegressionCaseRecord }>(action, {
        ...(revisingCaseId ? { previousCaseId: revisingCaseId } : {}),
        sourceSessionId: preview.source.sessionId,
        sourceTranscriptDigest: preview.source.transcriptDigest,
        selectedCallerTurnIndex: preview.source.selectedCallerTurnIndex,
        prefixStartIndex: preview.source.prefixStartIndex,
        turns: turns.map(turn => ({ role: turn.role, text: turn.text.trim() })),
        name: name.trim(), language: language.trim(), expectedOutcome: expectedOutcome.trim(),
        criteria: populated.map(criterion => ({ text: criterion.text.trim(), blocking: criterion.blocking })),
        required, redactionConfirmed: true,
      });
      await refresh({ caseId: response.case.id });
      setSelectedCaseId(response.case.id); clearCaseDraft();
      setNotice(revisingCaseId ? `Case version ${response.case.data.version} saved. The earlier version remains in history.` : 'Reviewed text rehearsal case created.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save the reviewed case.'); }
    finally { setPending(''); }
  }

  async function startRun() {
    if (!selectedCase || !candidateVersion || pending) return;
    if (reviewDirty && !window.confirm('Discard the unsaved operator review and generate a new reply?')) return;
    setPending('run'); setError(''); setNotice(''); setSuite(null);
    try {
      const response = await regressionApi<{ run: RegressionRunRecord }>('run.start', { requestId: uid(), caseId: selectedCase.id, agentVersionId: candidateVersion.id });
      await refresh({ caseId: selectedCase.id, runId: response.run.id });
      setSelectedRunId(response.run.id); setReviewDrafts({});
      setNotice('Azure generated a new surrogate text reply. Review the exact quoted judgments before recording operator verdicts.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not run the text rehearsal.'); }
    finally { setPending(''); }
  }

  async function saveReview(criterionId: string) {
    if (!selectedRun || pending) return;
    const draft = reviewDrafts[criterionId];
    if (!draft?.verdict || !draft.reason.trim()) { setError('Choose an operator verdict and explain the decision before saving it.'); return; }
    setPending(`review:${criterionId}`); setError(''); setNotice('');
    try {
      const response = await regressionApi<{ review: RegressionReviewRecord }>('review.create', { runId: selectedRun.id, criterionId, verdict: draft.verdict, reason: draft.reason.trim() });
      await refresh({ caseId: selectedCase?.id, runId: selectedRun.id });
      setReviewDrafts(current => ({ ...current, [criterionId]: { verdict: '', reason: '' } }));
      setSuite(null); setNotice(`Operator review recorded for criterion ${criterionId}.`);
      void response;
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not record the operator review.'); }
    finally { setPending(''); }
  }

  async function checkSuite() {
    if (!candidateVersion || pending) return;
    setPending('suite'); setError(''); setNotice('');
    try {
      const response = await regressionApi<{ suite: RegressionSuiteCheck }>('suite.check', { agentVersionId: candidateVersion.id });
      setSuite(response.suite);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not check the required suite.'); }
    finally { setPending(''); }
  }

  const changeDraft = (work: () => void) => { work(); setDirty(true); setNotice(''); };
  const canSave = !!preview && redactionConfirmed && name.trim() && language.trim() && expectedOutcome.trim() && criteria.some(criterion => criterion.text.trim()) && turns.every(turn => turn.text.trim());
  const readOnly = workspace.user.role === 'viewer';

  return <section className={styles.workbench} aria-label="Text rehearsal" aria-busy={!!pending}>
    <header className={styles.intro}>
      <div><h2>Text rehearsal</h2><p>Tests a new reply from saved agent instructions; does not measure voice audio or timing.</p></div>
      <span className={styles.scope}>Transcript relationship evidence</span>
    </header>
    <div className={styles.boundary}><ShieldCheck size={18} aria-hidden="true"/><p><strong>Bounded evidence only.</strong> The saved case keeps a redacted checkpoint, rubric, and source digests. It never turns an AI judgment into approval or publishes an agent.</p></div>
    {readOnly && <p className={styles.notice}>Read-only access. An owner or operator can create cases, run candidate versions, and record reviews.</p>}
    {error && <p className={styles.error} role="alert"><AlertCircle size={16} aria-hidden="true"/>{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}

    <div className={styles.columns} data-authoring={!!preview}>
      <section className={styles.author} aria-labelledby="rehearsal-author-heading">
        <div className={styles.sectionHead}><div><span>1</span><div><h3 id="rehearsal-author-heading">Review a saved checkpoint</h3><p>Choose one exact person turn and the minimum context needed to understand it.</p></div></div>{revisingCaseId && <span className={styles.status}>Revising v{data.cases.find(item => item.id === revisingCaseId)?.data.version}</span>}</div>
        {eligibleSessions.length ? <div className={styles.fields}>
          <label>Saved conversation<select value={sourceSessionId} disabled={!!pending || readOnly} onChange={event => { if (dirty && !window.confirm('Discard the current unsaved checkpoint?')) return; setSourceSessionId(event.target.value); }}><option value="">Choose a conversation</option>{eligibleSessions.map(session => <option key={session.id} value={session.id}>{sessionLabel(session)}</option>)}</select></label>
          <div className={styles.fieldPair}>
            <label>Person trigger<select value={callerTurnIndex} onChange={event => { if (dirty && !window.confirm('Discard the current unsaved checkpoint?')) return; const next = Number(event.target.value); setCallerTurnIndex(next); setPrefixStartIndex(Math.max(0, next - 7)); clearCaseDraft(); }} disabled={!sourceSession || !!pending || readOnly}>{callerTurns.map(item => <option key={item.index} value={item.index}>Turn {item.index + 1} · {item.turn.text.slice(0, 72)}</option>)}</select></label>
            <label>Context starts<select value={prefixStartIndex} disabled={!sourceSession || callerTurnIndex < 0 || !!pending || readOnly} onChange={event => { if (dirty && !window.confirm('Discard the current unsaved checkpoint?')) return; setPrefixStartIndex(Number(event.target.value)); clearCaseDraft(); }}>{sourceTranscript.slice(Math.max(0, callerTurnIndex - 7), callerTurnIndex + 1).map((turn, offset) => { const index = Math.max(0, callerTurnIndex - 7) + offset; return <option key={index} value={index}>Turn {index + 1} · {turn.role === 'user' ? 'Person' : 'AI'}</option>; })}</select></label>
          </div>
          <button className={styles.secondaryButton} type="button" disabled={!sourceSession || callerTurnIndex < 0 || !!pending || readOnly} onClick={() => void previewCheckpoint()}>{pending === 'preview' ? <LoaderCircle className="spin" size={16}/> : <ChevronRight size={16}/>} Prepare redacted checkpoint</button>
        </div> : <p className={styles.empty}>No saved conversation has both an agent binding and a person turn. Save a bound browser conversation first.</p>}

        {preview && <div className={styles.reviewArea}>
          <div className={styles.reviewSummary}><div><strong>{turns.length} redacted {turns.length === 1 ? 'turn' : 'turns'}</strong><span>Source call {callRef(preview.source.sessionId)} · agent {shortId(preview.source.agentId)}</span></div><span>{preview.findings.length} detector {preview.findings.length === 1 ? 'finding' : 'findings'}</span><button className={styles.textButton} type="button" onClick={clearCaseDraft}>Discard case draft</button></div>
          <p className={styles.hint}>{preview.notice}</p>
          <div className={styles.turnEditor}>{turns.map((turn, index) => <label key={`${turn.role}:${index}`}><span>{turn.role === 'user' ? 'Person' : 'AI'}{index === turns.length - 1 ? ' · selected trigger' : ''}</span><textarea value={turn.text} maxLength={preview.limits.maxTurnCharacters} rows={Math.max(2, Math.min(6, Math.ceil(turn.text.length / 72)))} onChange={event => changeDraft(() => setTurns(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item)))}/></label>)}</div>
          <div className={styles.findings}><strong>Detector findings</strong>{preview.findings.length ? <ul>{preview.findings.map((finding, index) => <li key={`${finding.turnIndex}:${finding.start}:${index}`}><span>{sentence(finding.category)}</span><code>{finding.placeholder}</code><small>Redacted turn {finding.turnIndex + 1}</small></li>)}</ul> : <p>No automatic findings. Review the derivative for names, contact details, addresses, and identifiers the detector may have missed.</p>}</div>

          <div className={styles.sectionHead}><div><span>2</span><div><h3>Author the text criteria</h3><p>Write observable relationship criteria. Audio, timing, pronunciation, latency, and interruption criteria are rejected.</p></div></div></div>
          <div className={styles.fields}>
            <label>Case name<input value={name} maxLength={120} placeholder="Example: Explain the next step without inventing urgency" onChange={event => changeDraft(() => setName(event.target.value))}/></label>
            <div className={styles.fieldPair}><label>Text rehearsal suite<select value={required ? 'required' : 'optional'} onChange={event => changeDraft(() => setRequired(event.target.value === 'required'))}><option value="required">Required in this text rehearsal suite</option><option value="optional">Optional in this text rehearsal suite</option></select></label><label>Language<input value={language} maxLength={80} placeholder="English, Hindi-English…" onChange={event => changeDraft(() => setLanguage(event.target.value))}/></label></div>
            <label>Expected outcome<textarea value={expectedOutcome} maxLength={1000} rows={3} placeholder="Describe what a useful new reply should accomplish." onChange={event => changeDraft(() => setExpectedOutcome(event.target.value))}/></label>
            <fieldset className={styles.criteria}><legend>Observable criteria</legend>{criteria.map((criterion, index) => <div className={styles.criterionDraft} key={criterion.key}><label><span>Criterion {index + 1}</span><textarea value={criterion.text} maxLength={500} rows={2} placeholder="The reply acknowledges the person’s concern using only the saved context." onChange={event => changeDraft(() => setCriteria(current => current.map(item => item.key === criterion.key ? { ...item, text: event.target.value } : item)))}/></label><label className={styles.check}><input type="checkbox" checked={criterion.blocking} onChange={event => changeDraft(() => setCriteria(current => current.map(item => item.key === criterion.key ? { ...item, blocking: event.target.checked } : item)))}/> Blocking criterion</label>{criteria.length > 1 && <button type="button" className={styles.iconButton} aria-label={`Remove criterion ${index + 1}`} onClick={() => changeDraft(() => setCriteria(current => current.filter(item => item.key !== criterion.key)))}><Trash2 size={16}/></button>}</div>)}<button type="button" className={styles.textButton} disabled={criteria.length >= 8} onClick={() => changeDraft(() => setCriteria(current => [...current, { key: uid(), text: '', blocking: false }]))}><Plus size={15}/> Add criterion</button></fieldset>
            <label className={styles.confirm}><input type="checkbox" checked={redactionConfirmed} onChange={event => changeDraft(() => setRedactionConfirmed(event.target.checked))}/><span><strong>I reviewed every turn and detector finding.</strong><small>The derivative contains placeholders instead of personal or account details, and includes only context needed for this test.</small></span></label>
            <button className={styles.primaryButton} type="button" disabled={!canSave || !!pending || readOnly} onClick={() => void saveCase()}>{pending === 'save-case' ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>} {revisingCaseId ? 'Create reviewed case revision' : 'Create reviewed case'}</button>
          </div>
        </div>}
      </section>

      <section className={styles.run} aria-labelledby="rehearsal-run-heading">
        <div className={styles.sectionHead}><div><span>3</span><div><h3 id="rehearsal-run-heading">Generate a new candidate reply</h3><p>Select an approved case and an immutable version of the same agent.</p></div></div><button className={styles.iconButton} type="button" aria-label="Refresh saved rehearsals" disabled={!!pending} onClick={() => void refreshSaved()}>{pending === 'refresh' ? <LoaderCircle className="spin" size={16}/> : <RefreshCw size={16}/>}</button></div>
        {pending === 'load' ? <div className={styles.loading}><LoaderCircle className="spin" size={18}/> Loading saved cases…</div> : data.cases.length ? <>
          <div className={styles.casePicker}>{data.cases.map(item => <button type="button" key={item.id} aria-current={selectedCase?.id === item.id ? 'true' : undefined} onClick={() => { if (reviewDirty && !window.confirm('Discard the unsaved operator review and open another case?')) return; setReviewDrafts({}); setSelectedCaseId(item.id); setSelectedRunId(''); setCandidateVersionId(''); setSuite(null); }}><span><strong>{item.data.rubric.name}</strong><small>v{item.data.version} · {item.data.required ? 'Required in text rehearsal suite' : 'Optional text rehearsal'} · call {callRef(item.data.source.sessionId)}</small></span><span className={styles.status} data-tone={item.status === 'approved' ? 'success' : 'quiet'}>{sentence(item.status)}</span></button>)}</div>
          {selectedCase && <div className={styles.caseDetail}>
            <div className={styles.caseMeta}><span>Agent <strong>{shortId(selectedCase.data.agentId)}</strong></span><span>Case version <strong>{selectedCase.data.version}</strong></span><span>Criteria <strong>{selectedCase.data.rubric.criteria.length}</strong></span></div>
            <p>{selectedCase.data.rubric.expectedOutcome}</p>
            <button className={styles.textButton} type="button" disabled={!!pending || readOnly || selectedCase.status !== 'approved'} onClick={() => void beginRevision(selectedCase)}><RefreshCw size={14}/> Create a reviewed revision</button>
            {versions.length ? <div className={styles.runControls}><label>Candidate version<select value={candidateVersion?.id || ''} disabled={!!pending || readOnly} onChange={event => { if (reviewDirty && !window.confirm('Discard the unsaved operator review and open another candidate version?')) return; setReviewDrafts({}); setCandidateVersionId(event.target.value); setSelectedRunId(''); setSuite(null); }}>{versions.map(version => <option key={version.id} value={version.id}>Version {String(version.data.number)} · saved {formatTime(version.createdAt)}</option>)}</select></label><button className={styles.primaryButton} type="button" disabled={!candidateVersion || !!pending || readOnly || selectedCase.status !== 'approved'} onClick={() => void startRun()}>{pending === 'run' ? <LoaderCircle className="spin" size={16}/> : <FlaskConical size={16}/>} Generate new reply with Azure</button></div> : <p className={styles.empty}>No immutable version exists for the agent bound to this case.</p>}
          </div>}
        </> : <p className={styles.empty}>No reviewed text rehearsal cases yet. Prepare a checkpoint and explicitly create the first case.</p>}

        {selectedRun && <div className={styles.runResult}>
          <div className={styles.attemptPicker}><label>Saved attempt<select value={selectedRun.id} onChange={event => { if (reviewDirty && !window.confirm('Discard the unsaved operator review and open another saved attempt?')) return; setReviewDrafts({}); setSelectedRunId(event.target.value); }}>{caseRuns.map(run => <option key={run.id} value={run.id}>{formatTime(run.createdAt)} · {callRef(run.id)} · {sentence(run.status)}</option>)}</select></label><p>Viewing a historical attempt changes the evidence shown here. Suite status still uses the latest saved attempt for each required case.</p></div>
          <div className={styles.resultHead}><div><h4>Candidate reply · version {selectedRun.data.agentVersionNumber}</h4><p>{formatTime(selectedRun.createdAt)} · run {callRef(selectedRun.id)}</p></div><span className={styles.status} data-tone={selectedRun.status === 'complete' ? 'success' : selectedRun.status === 'invalid' ? 'danger' : 'quiet'}>{sentence(selectedRun.status)}</span></div>
          {selectedRun.data.invalidReason ? <p className={styles.error}><AlertCircle size={16}/>{selectedRun.data.invalidReason}</p> : <blockquote className={styles.reply}>{assistantReply || 'No assistant reply was saved for this run.'}</blockquote>}
          <p className={styles.disclaimer}>{selectedRun.data.disclaimer}</p>
          <div className={styles.sectionHead}><div><span>4</span><div><h3>Review exact quoted judgments</h3><p>AI judgments are evidence to inspect. Only the latest explicit operator verdict counts toward the suite.</p></div></div></div>
          <div className={styles.judgments}>{selectedRun.data.judgments.map(judgment => {
            const criterion = selectedRun.data.rubric.criteria.find(item => item.id === judgment.criterionId);
            const savedReview = latestReview(selectedRun.id, judgment.criterionId);
            const draft = reviewDrafts[judgment.criterionId] || { verdict: '', reason: '' };
            const SavedReviewIcon = savedReview?.data.verdict === 'met' ? Check : savedReview?.data.verdict === 'not_met' ? XCircle : AlertCircle;
            return <article key={judgment.criterionId} className={styles.judgment}>
              <div className={styles.judgmentHead}><div><strong>{criterion?.text || judgment.criterionId}</strong><small>{criterion?.blocking ? 'Blocking' : 'Nonblocking'} criterion</small></div><span className={styles.status} data-tone={judgment.verdict === 'met' ? 'success' : judgment.verdict === 'not_met' ? 'danger' : 'quiet'}>AI: {sentence(judgment.verdict)}</span></div>
              <p>{judgment.rationale}</p>
              {judgment.evidence.length ? <div className={styles.quotes}>{judgment.evidence.map((evidence, index) => <blockquote key={`${evidence.entryIndex}:${index}`}><span>Exact quote · turn {evidence.entryIndex + 1}</span>“{evidence.quote}”</blockquote>)}</div> : <p className={styles.hint}>The AI marked this uncertain and supplied no quote.</p>}
              {savedReview && <div className={styles.savedReview} data-tone={savedReview.data.verdict === 'met' ? 'success' : savedReview.data.verdict === 'not_met' ? 'danger' : 'quiet'}><SavedReviewIcon size={15}/><span><strong>Operator: {sentence(savedReview.data.verdict)}</strong><small>{savedReview.data.reason}</small></span></div>}
              {!readOnly && <div className={styles.operatorReview}><strong>{savedReview ? 'Record a newer operator review' : 'Operator review required'}</strong><div className={styles.verdicts} role="group" aria-label={`Operator verdict for ${criterion?.text || judgment.criterionId}`}>{(['met', 'not_met', 'uncertain'] as const).map(verdict => <button type="button" key={verdict} aria-pressed={draft.verdict === verdict} onClick={() => setReviewDrafts(current => ({ ...current, [judgment.criterionId]: { ...draft, verdict } }))}>{sentence(verdict)}</button>)}</div><label>Reason<textarea rows={2} value={draft.reason} maxLength={1000} placeholder="Explain what the quoted reply does or does not establish." onChange={event => setReviewDrafts(current => ({ ...current, [judgment.criterionId]: { ...draft, reason: event.target.value } }))}/></label><button type="button" className={styles.secondaryButton} disabled={!draft.verdict || !draft.reason.trim() || !!pending} onClick={() => void saveReview(judgment.criterionId)}>{pending === `review:${judgment.criterionId}` ? <LoaderCircle className="spin" size={15}/> : <Check size={15}/>} Save operator review</button></div>}
            </article>;
          })}</div>
          {!selectedRun.data.judgments.length && <p className={styles.empty}>No valid judgments were saved. This run cannot pass the suite.</p>}
          <div className={styles.suiteHead}><div><h4>Required suite status</h4><p>Checks the latest saved attempt for each required case after every blocking operator review. Selecting a historical attempt above does not replace it.</p></div><button className={styles.secondaryButton} type="button" disabled={!candidateVersion || !!pending} onClick={() => void checkSuite()}>{pending === 'suite' ? <LoaderCircle className="spin" size={15}/> : <ShieldCheck size={15}/>} Check suite status</button></div>
          {suite && <div className={styles.suite} data-pass={suite.passing}><div><strong>{suite.passing ? 'Reviewed suite passed' : 'Suite is blocked'}</strong><span>{suite.requiredCases} required {suite.requiredCases === 1 ? 'case' : 'cases'} · set {shortId(suite.caseSetDigest)}</span></div><ul>{suite.cases.map(item => <li key={item.caseId}><span>Case v{item.caseVersion} · {shortId(item.caseId)}</span><strong>{sentence(item.status)}</strong><small>{item.reviewedBlockingCriteria} of {item.blockingCriteria} blocking criteria reviewed</small></li>)}</ul><p>{suite.disclaimer}</p></div>}
        </div>}
      </section>
    </div>
    <p className={styles.footerBoundary}>{TEXT_REHEARSAL_DISCLAIMER}</p>
  </section>;
}
