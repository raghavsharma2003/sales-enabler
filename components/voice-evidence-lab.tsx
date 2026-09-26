'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PlatformViewProps } from '../lib/platform/contracts';
import type { Assessment, AssessmentReview, Judgment, Scenario, Turn } from '../lib/evaluations/schema';
import { aiRequestId, newAiRequestAttempt, sha256Hex } from '../lib/client/ai-request';
import '../app/evidence-lab.css';

type Conditions = { language: string; scriptVersion: string; network: string; device: string; knowledgeSnapshot: string; components: string };
type Trial = { id: string; vendor: string; scenarioId: string; transcript: Turn[]; sourceLabel: string; inputMode: string; notes: string; pairId: string; conditions: Conditions; verification: string };
type Rating = { id: string; scenarioId: string; sourceId: string; criterionId: string; score: number; heardAudio: boolean; operatorId: string; note: string };
type Comparison = { pairedN: number; minimumPairedN: number; missing: Record<string, number>; criteria: { criterionId: string; n: number; ownMet: number; competitorMet: number; differencePercentagePoints: number | null }[]; claim: string };
type Data = { scenarios: Scenario[]; trials: Trial[]; assessments: (Assessment & { pairId?: string; sourceVerification?: string })[]; ratings: Rating[]; reviews: AssessmentReview[]; comparison: Comparison };
const blankConditions: Conditions = { language: '', scriptVersion: '', network: '', device: '', knowledgeSnapshot: '', components: '' };
const scenarioNames: Record<string, string> = { 'voice.turn.001': 'Let the caller finish', 'voice.turn.002': 'Handle acknowledgements', 'voice.turn.003': 'Recover from interruptions', 'voice.turn.004': 'Ignore background speech', 'voice.lang.005': 'Switch languages naturally', 'voice.lang.006': 'Confirm spoken numbers', 'voice.lang.007': 'Handle unfamiliar names', 'voice.memory.008': 'Use approved relationship memory', 'voice.memory.009': 'Respect corrections', 'voice.identity.010': 'Resolve identity ambiguity', 'voice.privacy.011': 'Keep private context private', 'voice.tools.012': 'Correct pending actions', 'voice.tools.013': 'Prevent duplicate actions', 'voice.tools.014': 'Avoid unsupported action claims', 'voice.handoff.015': 'Offer human follow-up', 'voice.consent.016': 'Respect recording consent', 'voice.silence.017': 'Allow thinking time', 'voice.channel.018': 'Keep context across channels', 'voice.observability.019': 'Retain execution evidence', 'voice.accessibility.020': 'Provide caption fallback' };
const human = (id: string) => scenarioNames[id.split(':v')[0]] || id.split(':v')[0].replace(/^voice\./, '').replaceAll('.', ' · ').replaceAll('_', ' ');
function parseImported(text: string): Turn[] {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const match = /^(customer|user|agent|assistant)\s*:\s*(.+)$/i.exec(line);
    if (!match) throw new Error('Use one line per turn, starting with Customer: or Agent:.');
    return { role: /^(customer|user)$/i.test(match[1]) ? 'user' as const : 'assistant' as const, text: match[2] };
  });
}
function JudgmentReview({ judgment, criterion, reviews, busy, onSave }: { judgment: Judgment; criterion: string; reviews: AssessmentReview[]; busy: boolean; onSave: (criterionId: string, verdict: Judgment['verdict'], reason: string) => Promise<boolean> }) {
  const [verdict, setVerdict] = useState<Judgment['verdict'] | ''>('');
  const [reason, setReason] = useState('');
  const review = reviews[0];
  return <article className="ev-detail" aria-label={`Review criterion: ${criterion}`}>
    <h4>{criterion}</h4>
    <div className="ev-verdict-grid"><div><span className="ev-kicker">Model judgment</span><strong>{judgment.verdict.replace('_', ' ')}</strong><p>{judgment.rationale}</p></div><div><span className="ev-kicker">Operator review</span>{review ? <><strong>{review.verdict.replace('_', ' ')}</strong><p>{review.reason}</p></> : <p className="ev-waiting">Awaiting review · excluded from comparison</p>}</div></div>
    <div className="ev-quotes"><span className="ev-kicker">Quoted transcript evidence</span>{judgment.evidence.length ? judgment.evidence.map((e, i) => <blockquote key={i}><small>Entry {e.entryIndex + 1}</small>“{e.quote}”</blockquote>) : <p className="pc-muted">The model supplied no quote. Check the saved transcript before reviewing.</p>}</div>
    <div className="ev-review-form"><label className="pc-field">Reviewed result<select className="pc-select" value={verdict} onChange={e => setVerdict(e.target.value as Judgment['verdict'] | '')}><option value="">Choose a result</option><option value="met">Met</option><option value="not_met">Not met</option><option value="uncertain">Uncertain</option></select></label><label className="pc-field">Reason for review<textarea className="pc-textarea" rows={3} value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} placeholder="Explain your decision from the saved evidence."/></label><button className="pc-button" type="button" disabled={busy || !verdict || !reason.trim()} onClick={() => { if (verdict) void onSave(judgment.criterionId, verdict, reason).then(saved => { if (saved) { setVerdict(''); setReason(''); } }); }}>{review ? 'Save revised review' : 'Save reviewed result'}</button></div>
    {reviews.length > 0 && <details className="ev-inline-history"><summary>Review history ({reviews.length})</summary>{reviews.map(item => <p key={item.id}><strong>{item.verdict.replace('_', ' ')}</strong> · {item.reason}<br/><small className="pc-muted">{new Date(item.createdAt).toLocaleString()} · operator {item.operatorId.slice(0, 8)} · source {item.sourceId.slice(0, 12)}</small></p>)}</details>}
  </article>;
}
export function VoiceEvidenceLab({ workspace, records, onRefresh }: { workspace: PlatformViewProps['workspace']; records: PlatformViewProps['records']; onRefresh?: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [scenarioId, setScenarioId] = useState('');
  const [sourceType, setSourceType] = useState<'session' | 'trial'>('session');
  const [sourceId, setSourceId] = useState('');
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [selectedCriterionId, setSelectedCriterionId] = useState('');
  const [pairId, setPairId] = useState('');
  const [conditions, setConditions] = useState<Conditions>(blankConditions);
  const [draft, setDraft] = useState({ name: '', language: 'Hindi-English', scenario: '', expectedOutcome: '', criteria: '' });
  const [previousId, setPreviousId] = useState('');
  const [trial, setTrial] = useState({ vendor: '', sourceLabel: '', inputMode: 'microphone', notes: '', transcript: '' });
  const [rating, setRating] = useState({ criterionId: '', score: 3, heardAudio: false, note: '' });
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/evaluations', { credentials: 'same-origin', cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not load evaluations.');
      setData(body);
      setScenarioId(current => current || body.scenarios[0]?.id || '');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load evaluations.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const scenario = data?.scenarios.find(s => s.id === scenarioId);
  const sources = sourceType === 'session' ? workspace.sessions.filter(s => Array.isArray(s.transcript) && s.transcript.length) : (data?.trials || []).filter(t => t.scenarioId === scenarioId);
  const selectedSource = sources.find(s => s.id === sourceId) || sources[0];
  const selectedAssessment = data?.assessments.find(a => a.id === selectedAssessmentId) || data?.assessments[0];
  const selectedTrial = sourceType === 'trial' ? data?.trials.find(t => t.id === selectedSource?.id) : undefined;
  const assessmentScenario = data?.scenarios.find(s => s.id === selectedAssessment?.scenarioId);
  const ownCount = useMemo(() => data?.assessments.filter(a => a.sourceType === 'session' && a.status === 'complete').length || 0, [data]);
  useEffect(() => {
    const judgments = selectedAssessment?.judgments || [];
    const first = judgments.find(j => !(data?.reviews || []).some(review => review.assessmentId === selectedAssessment?.id && review.criterionId === j.criterionId)) || judgments[0];
    setSelectedCriterionId(first?.criterionId || '');
  }, [selectedAssessment?.id]);
  const focusedJudgment = selectedAssessment?.judgments?.find(j => j.criterionId === selectedCriterionId) || selectedAssessment?.judgments?.[0];
  const reviewedCount = selectedAssessment?.judgments?.filter(j => (data?.reviews || []).some(review => review.assessmentId === selectedAssessment.id && review.criterionId === j.criterionId)).length || 0;
  async function post(action: string, payload: Record<string, unknown>) {
    setError(''); setNotice(''); setBusy(true);
    try {
      const response = await fetch('/api/evaluations', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Evaluation request failed.');
      await load(); onRefresh?.();
      return body;
    } catch (cause) {
      if (action === 'assessment.run' && typeof payload.requestId === 'string') {
        try {
          const expectedId = `eval:${await sha256Hex(JSON.stringify([workspace.organization.id, payload.requestId]))}`;
          const response = await fetch('/api/evaluations', { credentials: 'same-origin', cache: 'no-store' });
          if (response.ok) {
            const current = await response.json() as Data;
            setData(current);
            const saved = current.assessments.find(item => item.id === expectedId);
            if (saved) {
              setSelectedAssessmentId(saved.id);
              if (saved.status === 'complete' || saved.status === 'invalid') return saved;
            }
          }
        } catch { /* Preserve the original error and request ID. */ }
      }
      setError(cause instanceof Error ? cause.message : 'Evaluation request failed.'); return null;
    }
    finally { setBusy(false); }
  }
  async function saveScenario() {
    const result = await post('scenario.create', { ...draft, previousId: previousId || undefined, criteria: draft.criteria.split(/\r?\n/).map(x => x.trim()).filter(Boolean) });
    if (result) { setScenarioId(result.id); setNotice(`Saved rubric version ${result.version}.`); setPreviousId(''); }
  }
  async function saveTrial() {
    try {
      const transcript = parseImported(trial.transcript);
      const result = await post('trial.import', { ...trial, scenarioId, transcript, pairId, conditions });
      if (result) { setSourceType('trial'); setSourceId(result.id); setNotice('Imported trial saved as unverified operator evidence.'); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invalid transcript.'); }
  }
  async function runAssessment(newAttempt = false) {
    if (!selectedSource || !scenario) return;
    try {
      const sessionSource = sourceType === 'session' ? selectedSource as typeof workspace.sessions[number] : undefined;
      const savedConditions = sourceType === 'session' ? Object.values(conditions).every(Boolean) ? conditions : undefined : selectedTrial?.conditions;
      const savedPairId = sourceType === 'session' ? pairId : selectedTrial?.pairId;
      const version = sessionSource ? records.find(record => record.kind === 'agent_version' && record.id === sessionSource.agentVersionId) : undefined;
      const fingerprint = { scenario, sourceType, sourceId: selectedSource.id, transcript: selectedSource.transcript, provider: sessionSource?.provider || selectedTrial?.vendor, inputMode: sessionSource?.inputMode || selectedTrial?.inputMode,
        config: sessionSource ? sessionSource.previewConfig || version?.data.config : selectedTrial?.notes, pairId: savedPairId, conditions: savedConditions };
      const scope = `voice-evaluation:${workspace.organization.id}`;
      const requestId = newAttempt ? await newAiRequestAttempt(scope, fingerprint) : await aiRequestId(scope, fingerprint);
      const result = await post('assessment.run', { requestId, scenarioId, sourceType, sourceId: selectedSource.id, ...(sourceType === 'session' ? { pairId, conditions: savedConditions } : {}) });
      if (result) { setSelectedCriterionId(''); setSelectedAssessmentId(result.id); setNotice(result.status === 'invalid' ? 'AI output failed evidence validation. No verdicts were saved.' : 'Transcript assessment saved with validated source quotes.'); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not prepare the assessment request.'); }
  }
  async function saveRating() {
    if (!selectedSource) return;
    const result = await post('rating.create', { ...rating, scenarioId, sourceType, sourceId: selectedSource.id });
    if (result) setNotice('Human rating recorded with audio scope and operator source.');
  }
  async function saveReview(criterionId: string, verdict: Judgment['verdict'], reason: string): Promise<boolean> {
    if (!selectedAssessment) return false;
    const result = await post('assessment.review', { assessmentId: selectedAssessment.id, criterionId, verdict, reason });
    if (result) {
      setNotice('Operator review saved separately from the model judgment.');
      const next = selectedAssessment.judgments.find(j => j.criterionId !== criterionId && !(data?.reviews || []).some(review => review.assessmentId === selectedAssessment.id && review.criterionId === j.criterionId));
      if (next) setSelectedCriterionId(next.criterionId);
    }
    return !!result;
  }
  const reviewHistory = (assessmentId: string, criterionId: string) => (data?.reviews || []).filter(review => review.assessmentId === assessmentId && review.criterionId === criterionId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  function cloneScenario(s: Scenario) {
    setPreviousId(s.id); setDraft({ name: s.name, language: s.language, scenario: s.scenario, expectedOutcome: s.expectedOutcome, criteria: s.criteria.map(c => c.text).join('\n') });
  }
  const cfield = (key: keyof Conditions, label: string) => <label className="pc-field" key={key}>{label}<input className="pc-input" value={conditions[key]} maxLength={key === 'components' ? 300 : 150} onChange={e => setConditions({ ...conditions, [key]: e.target.value })}/></label>;
  return <section className="pc-panel ev-lab" aria-label="Voice evidence lab">
    <div className="ev-head"><div><h2>Voice evidence lab</h2><p>Check a saved transcript against a versioned scenario, then review the model’s quoted evidence.</p></div><span className="pc-badge">{ownCount} assessments</span></div>
    <p className="ev-limit">Transcript review cannot measure sound, latency, or interruption timing. Saved calls and imported trials are operator supplied.</p>
    {error && <p role="alert" className="ev-alert">{error}</p>}{notice && <p role="status" className="ev-notice">{notice}</p>}
    <div className="ev-section-head"><h3>Assess a call</h3><span>Scenario → call → assessment</span></div>
    <div className="ev-pick-grid">
      <label className="pc-field">Scenario<select className="pc-select" value={scenarioId} onChange={e => { setScenarioId(e.target.value); setSourceId(''); }}>{data?.scenarios.map(s => <option key={s.id} value={s.id}>{scenarioNames[s.familyId] || s.name} · v{s.version} · {s.language}</option>)}</select></label>
      <div className="ev-source-field"><div className="ev-source-choice" role="group" aria-label="Evidence source"><label><input type="radio" checked={sourceType === 'session'} onChange={() => { setSourceType('session'); setSourceId(''); }}/> Saved call</label><label><input type="radio" checked={sourceType === 'trial'} onChange={() => { setSourceType('trial'); setSourceId(''); }}/> Imported trial</label></div><label className="pc-field">{sourceType === 'session' ? 'Saved call' : 'Competitor trial'}<select className="pc-select" value={selectedSource?.id || ''} onChange={e => setSourceId(e.target.value)}><option value="" disabled>Select evidence</option>{sources.map(s => <option key={s.id} value={s.id}>{sourceType === 'trial' ? `${(s as Trial).vendor} · ${(s as Trial).sourceLabel}` : `${String(workspace.contacts.find(contact => contact.id === (s as typeof workspace.sessions[number]).contactId)?.name || 'Company context')} · ${new Date((s as typeof workspace.sessions[number]).createdAt).toLocaleString()} · ${String((s as typeof workspace.sessions[number]).provider || 'Unknown provider')}`}</option>)}</select></label></div>
    </div>
    {selectedSource && <p className="ev-source-meta">{sourceType === 'trial' ? `${selectedTrial?.inputMode} · operator imported, unverified · pair ${selectedTrial?.pairId || 'not declared'}` : `${String((selectedSource as typeof workspace.sessions[number]).inputMode || 'input mode unknown')} · browser submitted, unverified`} · {Array.isArray(selectedSource.transcript) ? selectedSource.transcript.length : 0} transcript entries</p>}
    {scenario && <details className="ev-disclosure"><summary>Read scenario brief and {scenario.criteria.length} {scenario.criteria.length === 1 ? 'criterion' : 'criteria'}</summary><div className="ev-disclosure-body"><p style={{ whiteSpace: 'pre-wrap' }}>{scenario.scenario}</p><p><strong>Expected:</strong> {scenario.expectedOutcome}</p><ol>{scenario.criteria.map(c => <li key={c.id}>{c.text}</li>)}</ol><p className="pc-muted">Seed rubrics are starting points; revise broad criteria before interpreting results.</p></div></details>}
    <div className="ev-run"><button className="pc-button primary" type="button" disabled={busy || !scenario || !selectedSource} onClick={() => void runAssessment()}>{busy ? 'Working…' : 'Run transcript assessment'}</button><span>Uses the configured evaluation model. An unchanged retry reuses its request ID.</span></div>
    <details className="ev-disclosure ev-run-options"><summary>Need a separate new attempt?</summary><div className="ev-disclosure-body"><p>A new attempt may consume tokens. Use it when you deliberately want another model evaluation of the same saved evidence.</p><button className="pc-button quiet" type="button" disabled={busy || !scenario || !selectedSource} onClick={() => void runAssessment(true)}>Start new assessment attempt</button></div></details>
    <details className="ev-disclosure"><summary>Set up paired comparison <span>Optional</span></summary><div className="ev-disclosure-body"><p>Declare the same pair ID and conditions for both arms. Imported trials keep the conditions saved at import; declarations are unverified.</p><div className="ev-condition-grid"><label className="pc-field">Pair ID<input className="pc-input" value={pairId} maxLength={100} onChange={e => setPairId(e.target.value)} placeholder="e.g. call-001"/></label>{cfield('language', 'Language')}{cfield('scriptVersion', 'Script version')}{cfield('network', 'Network profile')}{cfield('device', 'Device / microphone')}{cfield('knowledgeSnapshot', 'Knowledge snapshot')}{cfield('components', 'STT / model / TTS and settings')}</div>{selectedTrial && <p className="pc-muted">Imported trial conditions: {Object.entries(selectedTrial.conditions).map(([key, value]) => `${key}: ${value}`).join(' · ')}</p>}</div></details>
    <details className="ev-disclosure ev-secondary"><summary>Create or revise a rubric</summary><p className="pc-muted">Revisions create a new immutable version; past assessments keep their original rubric snapshot.</p><button className="pc-button quiet" type="button" disabled={!scenario} onClick={() => scenario && cloneScenario(scenario)}>Edit selected as new version</button>{previousId && <p>Revising {previousId}</p>}<label className="pc-field">Name<input className="pc-input" value={draft.name} maxLength={120} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label><label className="pc-field">Language<input className="pc-input" value={draft.language} maxLength={80} onChange={e => setDraft({ ...draft, language: e.target.value })}/></label><label className="pc-field">Scenario<textarea className="pc-textarea" value={draft.scenario} maxLength={3000} onChange={e => setDraft({ ...draft, scenario: e.target.value })}/></label><label className="pc-field">Expected outcome<textarea className="pc-textarea" value={draft.expectedOutcome} maxLength={2000} onChange={e => setDraft({ ...draft, expectedOutcome: e.target.value })}/></label><label className="pc-field">Observable criteria · one per line<textarea className="pc-textarea" value={draft.criteria} onChange={e => setDraft({ ...draft, criteria: e.target.value })}/></label><button className="pc-button" disabled={busy} onClick={() => void saveScenario()}>Save rubric version</button></details>
    <details className="ev-disclosure ev-secondary"><summary>Import a competitor trial</summary><p className="pc-muted">Paste an actual observed trial. Complete the optional paired comparison conditions above first; they are saved with this import. The source label should identify its origin.</p><label className="pc-field">Vendor<input className="pc-input" value={trial.vendor} onChange={e => setTrial({ ...trial, vendor: e.target.value })}/></label><label className="pc-field">Source label<input className="pc-input" value={trial.sourceLabel} onChange={e => setTrial({ ...trial, sourceLabel: e.target.value })} placeholder="Recording or test run reference"/></label><label className="pc-field">Input mode<select className="pc-select" value={trial.inputMode} onChange={e => setTrial({ ...trial, inputMode: e.target.value })}><option value="microphone">Microphone</option><option value="text">Text</option></select></label><label className="pc-field">Transcript · Customer: / Agent: per line<textarea className="pc-textarea" value={trial.transcript} onChange={e => setTrial({ ...trial, transcript: e.target.value })} placeholder={'Customer: I need help with my order.\nAgent: I can help. What is the order number?'}/></label><label className="pc-field">Notes<textarea className="pc-textarea" value={trial.notes} onChange={e => setTrial({ ...trial, notes: e.target.value })}/></label><button className="pc-button" disabled={busy || !scenario} onClick={() => void saveTrial()}>Save unverified trial</button></details>
    <section className="ev-results" id="ev-results"><div className="ev-section-head"><h3>Review an assessment</h3>{selectedAssessment?.judgments?.length ? <span>{reviewedCount} of {selectedAssessment.judgments.length} criteria reviewed</span> : null}</div>
      {data?.assessments.length ? <><label className="pc-field">Saved assessment<select className="pc-select" value={selectedAssessment?.id || ''} onChange={e => { setSelectedCriterionId(''); setSelectedAssessmentId(e.target.value); }}>{data.assessments.map(a => <option key={a.id} value={a.id}>{a.status} · {a.provider} · {data.scenarios.find(item => item.id === a.scenarioId)?.name || human(a.scenarioId)} · {a.id.slice(-8)}</option>)}</select></label>
        {selectedAssessment && <><p className="ev-assessment-meta">{selectedAssessment.sourceType === 'trial' ? 'Imported trial' : 'Saved call'} · {selectedAssessment.provider} · rubric v{selectedAssessment.rubricVersion} · {selectedAssessment.inputMode} · {selectedAssessment.sourceVerification}</p>
          {selectedAssessment.status === 'invalid' && <p role="alert" className="ev-alert">Evidence rejected: {selectedAssessment.invalidReason}</p>}
          {selectedAssessment.status === 'pending' && <p className="ev-alert">This AI run is pending or uncertain. Reuse the same request ID when checking its status.</p>}
          {!!selectedAssessment.judgments?.length && <><div className="ev-criterion-list" role="group" aria-label="Assessment criteria">{selectedAssessment.judgments.map((j, index) => { const reviewed = reviewHistory(selectedAssessment.id, j.criterionId)[0]; const criterion = selectedAssessment.rubricSnapshot?.criteria.find(c => c.id === j.criterionId)?.text || assessmentScenario?.criteria.find(c => c.id === j.criterionId)?.text || j.criterionId; return <button type="button" className="ev-criterion" aria-current={focusedJudgment?.criterionId === j.criterionId ? 'true' : undefined} key={j.criterionId} onClick={() => setSelectedCriterionId(j.criterionId)}><span className="ev-criterion-index">{index + 1}</span><span className="ev-criterion-copy"><strong>{criterion}</strong><small>Model {j.verdict.replace('_', ' ')} · {reviewed ? `Reviewed ${reviewed.verdict.replace('_', ' ')}` : 'Review needed'}</small></span></button>; })}</div>
            {focusedJudgment && <JudgmentReview key={`${selectedAssessment.id}:${focusedJudgment.criterionId}`} judgment={focusedJudgment} criterion={selectedAssessment.rubricSnapshot?.criteria.find(c => c.id === focusedJudgment.criterionId)?.text || assessmentScenario?.criteria.find(c => c.id === focusedJudgment.criterionId)?.text || focusedJudgment.criterionId} reviews={reviewHistory(selectedAssessment.id, focusedJudgment.criterionId)} busy={busy} onSave={saveReview}/>}</>}
          <details className="ev-disclosure ev-run-meta"><summary>Run details and original model response</summary><div className="ev-disclosure-body"><p>{selectedAssessment.model || 'Model receipt pending'} · {selectedAssessment.usage ? `${selectedAssessment.usage.inputTokens} input / ${selectedAssessment.usage.outputTokens} output tokens` : 'Tokens pending'}</p><p>Transcript entries: {selectedAssessment.measurement.transcriptEntries} · assistant {selectedAssessment.measurement.assistantEntries} · customer {selectedAssessment.measurement.userEntries}. Counts are measurements, not quality scores.</p>{selectedAssessment.rawAiText ? <pre>{selectedAssessment.rawAiText}</pre> : <p>Full response text is unavailable for this older assessment. Original parsed judgments remain above.</p>}</div></details>
        </>}</> : <p className="pc-empty">No transcript assessments yet. Choose a scenario and saved call above to begin.</p>}
    </section>
    <details className="ev-disclosure ev-secondary"><summary>Record a human audio rating <span>Optional</span></summary><div className="ev-disclosure-body ev-rating"><p>A 1–5 operator observation is separate from transcript adjudication. Mark whether you heard the audio.</p><label className="pc-field">Criterion<select className="pc-select" value={rating.criterionId} onChange={e => setRating({ ...rating, criterionId: e.target.value })}><option value="">Choose criterion</option>{scenario?.criteria.map(c => <option key={c.id} value={c.id}>{c.text}</option>)}</select></label><label className="pc-field">Score<select className="pc-select" value={rating.score} onChange={e => setRating({ ...rating, score: Number(e.target.value) })}>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}</select></label><label className="ev-check"><input type="checkbox" checked={rating.heardAudio} onChange={e => setRating({ ...rating, heardAudio: e.target.checked })}/> I heard the audio</label><label className="pc-field">Observation<textarea className="pc-textarea" rows={3} value={rating.note} onChange={e => setRating({ ...rating, note: e.target.value })}/></label><button className="pc-button" type="button" disabled={busy || !selectedSource || !rating.criterionId} onClick={() => void saveRating()}>Save human rating</button><p className="pc-muted">{data?.ratings.length || 0} human ratings recorded. Audio scope stays attached to each record.</p></div></details>
    <details className="ev-disclosure ev-secondary"><summary>Paired comparison coverage <span>{data?.comparison.pairedN || 0} matched pairs</span></summary><div className="ev-disclosure-body"><p>{data?.comparison.claim}</p><p>Differences appear after at least {data?.comparison.minimumPairedN || 3} reviewed, decisive pairs per criterion.</p><p className="pc-muted">Missing: {Object.entries(data?.comparison.missing || {}).map(([key, value]) => `${key.replaceAll(/([A-Z])/g, ' $1').toLowerCase()} ${value}`).join(' · ') || 'No records'}</p>{data?.comparison.criteria.length ? <div className="ev-table-wrap"><div className="pc-table" role="table" aria-label="Paired reviewed transcript comparison"><div className="pc-row" role="row"><strong>Criterion</strong><strong>Reviewed n</strong><strong>Ours met</strong><strong>Imported met</strong><strong>Difference</strong></div>{data.comparison.criteria.map(c => <div className="pc-row" role="row" key={c.criterionId}><span>{c.criterionId}</span><span>{c.n}</span><span>{c.ownMet}/{c.n}</span><span>{c.competitorMet}/{c.n}</span><span>{c.differencePercentagePoints === null ? 'Insufficient reviewed pairs' : `${c.differencePercentagePoints > 0 ? '+' : ''}${c.differencePercentagePoints} pp`}</span></div>)}</div></div> : <p className="pc-muted">No matched same-condition baseline. Import and review a competitor trial, then pair it with a saved call.</p>}</div></details>
  </section>;
}
