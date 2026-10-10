'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Clock3,
  FileAudio2,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  Volume2,
  XCircle,
} from 'lucide-react';
import type { PlatformRecord } from '../lib/platform/contracts';
import { aiRequestId, newAiRequestAttempt } from '../lib/client/ai-request';
import type {
  AudioArtifactRef,
  AudioListeningReviewData,
  AudioProofRecord,
  AudioProofRunData,
  AudioProofScenario,
  SyntheticFixtureData,
} from '../lib/evaluations/audio-schema';
import { ExclusiveRequestGate } from '../lib/evaluations/audio-view';
import styles from './voice-audio-proof.module.css';

type ReviewRecord = { id: string; status: 'recorded'; createdAt: string; data: AudioListeningReviewData };
type AudioProofData = {
  scenarios: AudioProofScenario[];
  fixtures: AudioProofRecord<SyntheticFixtureData>[];
  runs: AudioProofRecord<AudioProofRunData>[];
  reviews: ReviewRecord[];
  permissions: { canWrite: boolean };
  evidenceBoundary: string;
};
type AgentVersionData = { agentId?: string; number?: number; sourceRevision?: number; config?: { name?: string; voiceProfile?: string; liveVoice?: { engine?: string } } };
type ReviewDraft = { verdict: AudioListeningReviewData['verdict'] | ''; reason: string; heardOutput: boolean };
type PlaybackState = 'idle' | 'started' | 'error';

const REQUEST_TIMEOUT_MS = 65_000;
const emptyDraft: ReviewDraft = { verdict: '', reason: '', heardOutput: false };

const byNewest = <T extends { createdAt: string; id: string }>(a: T, b: T) =>
  b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
const shortRef = (value?: string) => value ? value.slice(-10) : 'not recorded';
const formatDate = (value?: string) => value ? new Date(value).toLocaleString() : 'Not recorded';
const formatDuration = (milliseconds?: number) => milliseconds === undefined ? 'Not recorded' : `${(milliseconds / 1_000).toFixed(1)} sec`;
const isExpired = (artifact?: AudioArtifactRef) => {
  if (!artifact) return true;
  const expiry = Date.parse(artifact.expiresAt);
  return !Number.isFinite(expiry) || expiry <= Date.now();
};
const plainFailure = (code?: AudioProofRunData['failureCode']) => code ? ({
  configuration_unavailable: 'The approved audio path is not configured.',
  authority_changed: 'The saved agent or workspace authority changed before capture finished.',
  fixture_unavailable: 'The exact synthetic caller audio is no longer available.',
  provider_rejected: 'The audio service rejected this attempt.',
  provider_protocol: 'The audio service returned an incomplete response.',
  transport_uncertain: 'The connection ended without a reliable outcome.',
  deadline_exceeded: 'The attempt exceeded its bounded capture time.',
  audio_unavailable: 'No reviewable output audio was captured.',
} satisfies Record<NonNullable<AudioProofRunData['failureCode']>, string>)[code] : 'The attempt did not produce reviewable audio.';

function statusPresentation(status: AudioProofRecord<unknown>['status']) {
  if (status === 'complete') return { label: 'Audio captured', icon: CheckCircle2, tone: 'complete' } as const;
  if (status === 'failed') return { label: 'Failed', icon: XCircle, tone: 'failed' } as const;
  if (status === 'uncertain') return { label: 'Uncertain', icon: CircleHelp, tone: 'uncertain' } as const;
  return { label: 'Pending', icon: Clock3, tone: 'pending' } as const;
}

function AudioPlayer({ artifact, label, onState }: { artifact?: AudioArtifactRef; label: string; onState?: (state: PlaybackState) => void }) {
  if (!artifact) return <p className={styles.unavailable}>No captured audio is attached to this record.</p>;
  if (isExpired(artifact)) return <p className={styles.unavailable}>This audio expired on {formatDate(artifact.expiresAt)}. The saved record remains visible.</p>;
  return <div className={styles.player}>
    <div><Volume2 size={17}/><span><strong>{label}</strong><small>{formatDuration(artifact.durationMs)} · {artifact.channels === 1 ? 'Mono' : `${artifact.channels} channels`}</small></span></div>
    <audio aria-label={label} controls preload="metadata" src={artifact.playbackUrl} onPlay={() => onState?.('started')} onError={() => onState?.('error')}>Audio playback is not supported in this browser.</audio>
  </div>;
}

export function VoiceAudioProof({ records, focusId }: { records: PlatformRecord[]; focusId?: string }) {
  const [data, setData] = useState<AudioProofData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mustRefresh, setMustRefresh] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [scenarioId, setScenarioId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [selectedRunId, setSelectedRunId] = useState('');
  const [fixtureConsent, setFixtureConsent] = useState(false);
  const [runConsent, setRunConsent] = useState(false);
  const [playback, setPlayback] = useState<Record<string, PlaybackState>>({});
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const initialRouteApplied = useRef(false);
  const requestGate = useRef(new ExclusiveRequestGate()).current;
  const loadController = useRef<AbortController | null>(null);
  const loadGeneration = useRef(0);

  const versions = useMemo(() => records
    .filter((record): record is PlatformRecord<AgentVersionData> => record.kind === 'agent_version' && record.status === 'versioned')
    .sort(byNewest), [records]);
  const proofVersions = useMemo(() => versions.filter(version => version.data.config?.liveVoice?.engine !== 'azure-voice-live' && version.data.config?.voiceProfile !== 'maya-despina'), [versions]);
  const agents = useMemo(() => new Map(records.filter(record => record.kind === 'agent_definition').map(record => [record.id, String(record.data.name || 'Saved agent')])), [records]);
  const versionLabel = useCallback((id: string) => {
    const version = versions.find(item => item.id === id);
    if (!version) return `Unavailable version · ${shortRef(id)}`;
    return `${agents.get(String(version.data.agentId)) || version.data.config?.name || 'Saved agent'} · version ${version.data.number ?? '?'} · ${shortRef(version.id)}`;
  }, [agents, versions]);

  const load = useCallback(async (manual = false) => {
    const generation = ++loadGeneration.current;
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
    setRefreshing(manual);
    setError('');
    try {
      const response = await fetch('/api/evaluations/audio', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      const body = await response.json().catch(() => ({})) as Partial<AudioProofData> & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Audio proof evidence could not be loaded.');
      if (generation !== loadGeneration.current || controller.signal.aborted) return;
      const next = body as AudioProofData;
      setData(next);
      setScenarioId(current => next.scenarios.some(item => item.id === current) ? current : next.scenarios[0]?.id || '');
      setVersionId(current => proofVersions.some(item => item.id === current) ? current : proofVersions[0]?.id || '');
      setSelectedRunId(current => current && next.runs.some(item => item.id === current) ? current : current ? '' : next.runs[0]?.id || '');
      setMustRefresh(false);
      if (manual) setNotice('Evidence refreshed. Choose any retry explicitly.');
    } catch (cause) {
      if (generation !== loadGeneration.current) return;
      const aborted = cause instanceof DOMException && cause.name === 'AbortError';
      if (aborted && !timedOut) return;
      setError(timedOut ? 'Refresh did not finish within 65 seconds. Try Refresh evidence again.' : cause instanceof Error ? cause.message : 'Audio proof evidence could not be loaded.');
    } finally {
      window.clearTimeout(timeout);
      if (generation === loadGeneration.current) {
        loadController.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [versions, proofVersions]);

  useEffect(() => {
    void load();
    return () => {
      loadGeneration.current += 1;
      loadController.current?.abort();
      loadController.current = null;
    };
  }, [load]);
  useEffect(() => {
    if (!data || initialRouteApplied.current || !focusId || !/^audio-(run|fixture):/.test(focusId)) return;
    initialRouteApplied.current = true;
    const exact = data.runs.find(item => item.id === focusId);
    if (!exact) {
      setSelectedRunId('');
      setRouteError('The requested audio proof record is unavailable in this workspace. No other attempt was opened.');
      return;
    }
    setSelectedRunId(exact.id);
    setScenarioId(exact.data.scenarioId);
    setVersionId(exact.data.agentVersionId);
  }, [data, focusId]);

  const scenario = data?.scenarios.find(item => item.id === scenarioId);
  const scenarioFixtures = useMemo(() => (data?.fixtures || []).filter(item => item.data.scenarioId === scenarioId).sort(byNewest), [data?.fixtures, scenarioId]);
  const fixture = scenarioFixtures.find(item => item.status === 'complete' && item.data.artifact && !isExpired(item.data.artifact));
  const relevantRuns = useMemo(() => (data?.runs || []).filter(item => item.data.scenarioId === scenarioId && item.data.agentVersionId === versionId).sort(byNewest), [data?.runs, scenarioId, versionId]);
  const selectedRun = data?.runs.find(item => item.id === selectedRunId);
  const selectedScenario = data?.scenarios.find(item => item.id === selectedRun?.data.scenarioId);
  const selectedStatus = selectedRun ? statusPresentation(selectedRun.status) : null;
  const selectedPlayback = selectedRun?.data.outputArtifact ? playback[selectedRun.data.outputArtifact.id] || 'idle' : 'idle';
  const selectedExpired = isExpired(selectedRun?.data.outputArtifact);
  const canWrite = data?.permissions.canWrite === true;

  async function post<T>(action: 'fixture.create' | 'run' | 'review', payload: Record<string, unknown>): Promise<T | null> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch('/api/evaluations/audio', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }), signal: controller.signal });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || 'The audio proof request failed.');
      return body as T;
    } catch (cause) {
      const timedOut = cause instanceof DOMException && cause.name === 'AbortError';
      setMustRefresh(true);
      setError(timedOut
        ? 'The request did not finish within 65 seconds. Refresh evidence before choosing an explicit retry.'
        : `${cause instanceof Error ? cause.message : 'The audio proof request failed.'} Refresh evidence before choosing an explicit retry.`);
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function mutate<T>(action: 'fixture.create' | 'run' | 'review', prepare: () => Promise<Record<string, unknown>> | Record<string, unknown>): Promise<T | null | undefined> {
    return requestGate.run(async () => {
      setBusy(action); setError(''); setNotice('');
      try {
        const payload = await prepare();
        return await post<T>(action, payload);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The audio proof request could not be prepared. Try again.');
        return null;
      } finally {
        setBusy('');
      }
    });
  }

  async function createFixture() {
    if (!scenario || !versionId || !data) return;
    const fingerprint = { scenarioId: scenario.id, scenarioVersion: scenario.version };
    const scope = 'audio-proof-fixture';
    const result = await mutate<AudioProofRecord<SyntheticFixtureData>>('fixture.create', async () => ({
      requestId: scenarioFixtures.length ? await newAiRequestAttempt(scope, fingerprint) : await aiRequestId(scope, fingerprint),
      scenarioId: scenario.id,
      consent: true,
    }));
    if (!result) return;
    setData(current => current ? { ...current, fixtures: [result, ...current.fixtures.filter(item => item.id !== result.id)].sort(byNewest) } : current);
    setFixtureConsent(false);
    setNotice(result.status === 'complete' ? 'Synthetic caller audio saved. Preview the exact input before running it.' : `Fixture attempt saved as ${result.status}.`);
  }

  async function runProof() {
    if (!scenario || !fixture?.data.artifact || !versionId || !data) return;
    const fingerprint = { scenarioId: scenario.id, fixtureId: fixture.id, fixtureSha256: fixture.data.artifact.sha256, agentVersionId: versionId };
    const scope = 'audio-proof-run';
    const prior = data.runs.some(item => item.data.scenarioId === scenario.id && item.data.fixtureId === fixture.id && item.data.agentVersionId === versionId);
    const result = await mutate<AudioProofRecord<AudioProofRunData>>('run', async () => ({
      requestId: prior ? await newAiRequestAttempt(scope, fingerprint) : await aiRequestId(scope, fingerprint),
      scenarioId: scenario.id,
      fixtureId: fixture.id,
      agentVersionId: versionId,
      consent: true,
    }));
    if (!result) return;
    setData(current => current ? { ...current, runs: [result, ...current.runs.filter(item => item.id !== result.id)].sort(byNewest) } : current);
    setSelectedRunId(result.id); setRunConsent(false);
    setNotice(result.status === 'complete' ? 'Audio captured. Listen and record a separate human review.' : `Attempt saved as ${result.status}. No automatic retry was started.`);
  }

  function reviewKey(runId: string, criterionId: string) { return `${runId}:${criterionId}`; }
  function draftFor(runId: string, criterionId: string) { return drafts[reviewKey(runId, criterionId)] || emptyDraft; }
  function updateDraft(runId: string, criterionId: string, patch: Partial<ReviewDraft>) {
    const key = reviewKey(runId, criterionId);
    setDrafts(current => ({ ...current, [key]: { ...(current[key] || emptyDraft), ...patch } }));
  }
  async function saveReview(criterionId: string) {
    if (!selectedRun) return;
    const key = reviewKey(selectedRun.id, criterionId), draft = drafts[key] || emptyDraft;
    if (!draft.verdict || !draft.heardOutput || !draft.reason.trim()) return;
    const result = await mutate<ReviewRecord>('review', () => ({ runId: selectedRun.id, criterionId, verdict: draft.verdict, reason: draft.reason.trim(), heardOutput: true }));
    if (!result) return;
    setData(current => current ? { ...current, reviews: [result, ...current.reviews] } : current);
    setDrafts(current => ({ ...current, [key]: emptyDraft }));
    setNotice('Listening review appended to this exact captured output.');
  }

  if (loading) return <section className={`pc-panel ${styles.loading}`} aria-label="Audio proof"><RefreshCw size={18} className={styles.spin}/><p>Loading saved audio evidence…</p></section>;

  return <section className={styles.proof} aria-label="Audio proof">
    <div className={styles.intro}>
      <div><h2>Hear one exact synthetic run</h2><p>Select a saved agent version, reuse one stored caller recording, and keep every attempt visible for human review.</p></div>
      <button className="pc-button" type="button" disabled={refreshing || !!busy} onClick={() => void load(true)}><RefreshCw size={14} className={refreshing ? styles.spin : undefined}/>Refresh evidence</button>
    </div>
    <div className={styles.boundary}><FileAudio2 size={18}/><p><strong>Synthetic audio only.</strong> This does not test a physical microphone, a real customer, full-duplex conversation, or competitor quality. {data?.evidenceBoundary}</p></div>
    {!canWrite && <p className={styles.readOnly}><LockKeyhole size={15}/>You have read-only access. Saved audio can still be played; an owner or operator can create attempts and append reviews.</p>}
    {routeError && <p className={styles.alert} role="alert"><AlertTriangle size={16}/>{routeError}</p>}
    {error && <p className={styles.alert} role="alert"><AlertTriangle size={16}/><span>{error}</span>{mustRefresh && <button className="pc-button" type="button" disabled={refreshing || !!busy} onClick={() => void load(true)}>Refresh evidence</button>}</p>}
    {notice && <p className={styles.notice} role="status"><CheckCircle2 size={16}/>{notice}</p>}

    <div className={styles.setup}>
      <div className={styles.sectionHeading}><div><h3>Prepare the exact input</h3><p>One fixture can support repeated attempts. Each attempt remains bound to the selected immutable version and the same audio bytes.</p></div><span>One synthetic scenario</span></div>
      <div className={styles.pickers}>
        <label className="pc-field">Scenario<select className="pc-select" value={scenarioId} disabled={!!busy} onChange={event => { setScenarioId(event.target.value); setSelectedRunId(''); setRouteError(''); }}><option value="">Choose a scenario</option>{data?.scenarios.map(item => <option value={item.id} key={item.id}>{item.name} · v{item.version}</option>)}</select></label>
        <label className="pc-field">Saved agent version<select className="pc-select" value={versionId} disabled={!!busy} onChange={event => { setVersionId(event.target.value); setSelectedRunId(''); setRouteError(''); }}><option value="">Choose an immutable version</option>{versions.map(item => <option value={item.id} key={item.id} disabled={!proofVersions.includes(item)}>{versionLabel(item.id)}{!proofVersions.includes(item) ? ' · use the private call tester' : ''}</option>)}</select></label>
      </div>
      {scenario && <div className={styles.scenario}><div><strong>Fictional caller says</strong><blockquote>“{scenario.callerText}”</blockquote></div><div><strong>What to listen for</strong><p>{scenario.expectedDelivery}</p></div></div>}
      {versions.length === 0 && <p className={styles.inlineError}>No immutable agent version is available. Save a version in Agents before running audio proof.</p>}
      {versions.length > proofVersions.length && <p>Audio proof uses Azure OpenAI Realtime. Test Voice Live and Maya voices in the agent’s private call tester.</p>}
      {fixture?.data.artifact ? <div className={styles.fixture}>
        <AudioPlayer artifact={fixture.data.artifact} label="Exact synthetic caller input"/>
        <div className={styles.integrity}><LockKeyhole size={15}/><span><strong>Input locked to saved bytes</strong><small>{shortRef(fixture.data.artifact.sha256)} · expires {formatDate(fixture.data.artifact.expiresAt)}</small></span></div>
      </div> : <div className={styles.capture}>
        {scenarioFixtures.length > 0 && <p className={styles.inlineError}>No usable caller fixture is available. Earlier fixture attempts remain recorded below the technical history.</p>}
        <label className={styles.consent}><input type="checkbox" checked={fixtureConsent} disabled={!canWrite || !!busy || mustRefresh} onChange={event => setFixtureConsent(event.target.checked)}/><span><strong>Store this fictional synthetic caller audio for evaluation</strong><small>No person is recorded. The generated WAV is available for playback until the stated expiry, with an integrity hash kept in its record.</small></span></label>
        <button className="pc-button primary" type="button" disabled={!canWrite || !scenario || !versionId || !fixtureConsent || !!busy || mustRefresh} onClick={() => void createFixture()}>{busy === 'fixture.create' ? <><RefreshCw size={14} className={styles.spin}/>Generating caller audio…</> : <><FileAudio2 size={14}/>{scenarioFixtures.length ? 'Generate a new fixture attempt' : 'Generate caller fixture once'}</>}</button>
      </div>}
      {fixture?.data.artifact && <div className={styles.runGate}>
        <label className={styles.consent}><input type="checkbox" checked={runConsent} disabled={!canWrite || !!busy || mustRefresh} onChange={event => setRunConsent(event.target.checked)}/><span><strong>Store this exact synthetic input and the captured AI output</strong><small>The run uses {versionId ? versionLabel(versionId) : 'the selected version'} with tools, customer memory, and business actions disabled.</small></span></label>
        <button className="pc-button primary" type="button" disabled={!canWrite || !versionId || !runConsent || !!busy || mustRefresh} onClick={() => void runProof()}>{busy === 'run' ? <><RefreshCw size={14} className={styles.spin}/>Capturing response…</> : <>{relevantRuns.length ? <RotateCcw size={14}/> : <Volume2 size={14}/>} {relevantRuns.length ? 'Run another explicit attempt' : 'Run against these exact bytes'}</>}</button>
      </div>}
    </div>

    <div className={styles.evidence}>
      <aside className={styles.attempts} aria-label="Saved audio attempts">
        <div className={styles.attemptHeading}><div><h3>Saved attempts</h3><p>Current and earlier outcomes stay available.</p></div><span>{data?.runs.length || 0}</span></div>
        {(data?.runs.length || 0) === 0 ? <p className={styles.empty}>No audio attempts yet.</p> : <div className={styles.attemptList}>{data?.runs.map(run => {
          const view = statusPresentation(run.status), Icon = view.icon;
          return <button type="button" className={styles.attempt} aria-current={selectedRunId === run.id} key={run.id} onClick={() => { setSelectedRunId(run.id); setRouteError(''); }}>
            <Icon size={16} data-tone={view.tone}/><span><strong>{view.label}</strong><small>{versionLabel(run.data.agentVersionId)}</small><em>{formatDate(run.createdAt)} · {shortRef(run.id)}</em></span>
          </button>;
        })}</div>}
        {(data?.fixtures.length || 0) > 0 && <details className={styles.fixtureHistory}><summary>Caller fixture history ({data?.fixtures.length})</summary>{data?.fixtures.map(item => <p key={item.id}><strong>{statusPresentation(item.status).label}</strong><span>{formatDate(item.createdAt)} · {shortRef(item.id)}{item.data.artifact ? ` · ${shortRef(item.data.artifact.sha256)}` : ''}</span></p>)}</details>}
      </aside>
      <div className={styles.detail}>
        {!selectedRun ? <div className={styles.emptyDetail}><FileAudio2 size={24}/><h3>Choose a saved attempt</h3><p>Its captured output, recognized words, exact review criteria, and append-only human reviews will appear here.</p></div> : <>
          <div className={styles.runHeader}><div><span className={styles.status} data-tone={selectedStatus?.tone}>{selectedStatus && <selectedStatus.icon size={15}/>} {selectedStatus?.label}</span><h3>{data?.scenarios.find(item => item.id === selectedRun.data.scenarioId)?.name || 'Unavailable scenario'}</h3><p>{versionLabel(selectedRun.data.agentVersionId)}</p></div><span>Attempt {shortRef(selectedRun.id)}</span></div>
          {selectedRun.status !== 'complete' && <p className={styles.runMessage} data-tone={selectedStatus?.tone}>{selectedRun.status === 'pending' ? 'This attempt is still pending. Refresh evidence before deciding whether another attempt is needed.' : plainFailure(selectedRun.data.failureCode)} No automatic retry was started.</p>}
          {selectedRun.data.outputArtifact && <div className={styles.output}>
            <AudioPlayer artifact={selectedRun.data.outputArtifact} label="Captured AI output" onState={state => { setPlayback(current => ({ ...current, [selectedRun.data.outputArtifact!.id]: state })); if (state === 'error') setDrafts(current => Object.fromEntries(Object.entries(current).map(([key, value]) => key.startsWith(`${selectedRun.id}:`) ? [key, { ...value, heardOutput: false }] : [key, value]))); }}/>
            <p className={styles.playbackNote} data-state={selectedPlayback}>{selectedPlayback === 'error' ? 'Playback failed. Listening attestations are disabled for this artifact.' : selectedExpired ? 'This output has expired. Listening attestations are disabled.' : selectedPlayback === 'started' ? 'The player started. This does not prove that a person heard the full output; each review still needs an explicit listening attestation.' : 'Start the player before making a listening attestation. Starting playback alone is not proof of hearing.'}</p>
          </div>}
          {selectedRun.data.transcript && <div className={styles.transcripts}><article><span>Recognized caller</span><p>{selectedRun.data.transcript.recognizedCallerText || 'No final caller transcript was recorded.'}</p><small>Expected synthetic text: “{selectedRun.data.transcript.expectedCallerText}”</small></article><article><span>Assistant transcript</span><p>{selectedRun.data.transcript.assistantText || 'No final assistant transcript was recorded.'}</p><small>Read this beside the audio; transcript text does not establish how the output sounded.</small></article></div>}
          {selectedRun.status === 'complete' && selectedScenario && <div className={styles.reviews}>
            <div className={styles.sectionHeading}><div><h3>Listening review</h3><p>Judge each criterion from the captured output. Reviews append to history and stay bound to this output hash and run record.</p></div><span>{selectedScenario.criteria.length} criteria</span></div>
            {selectedScenario.criteria.map(criterion => {
              const key = reviewKey(selectedRun.id, criterion.id), draft = drafts[key] || emptyDraft;
              const history = (data?.reviews || []).filter(item => item.data.runId === selectedRun.id && item.data.criterionId === criterion.id).sort(byNewest);
              const attestationDisabled = !canWrite || selectedExpired || selectedPlayback !== 'started' || !!busy || mustRefresh;
              return <article className={styles.criterion} key={criterion.id}>
                <div className={styles.criterionCopy}><h4>{criterion.text}</h4><p>{criterion.dimension.replaceAll('_', ' ')}</p></div>
                {history.length > 0 && <div className={styles.latestReview}><span>Latest human review</span><strong data-verdict={history[0].data.verdict}>{history[0].data.verdict.replace('_', ' ')}</strong><p>{history[0].data.reason}</p><small>{formatDate(history[0].createdAt)} · review {shortRef(history[0].id)}</small></div>}
                <div className={styles.reviewForm}>
                  <label className="pc-field">Human verdict<select className="pc-select" value={draft.verdict} disabled={!canWrite || !!busy || mustRefresh} onChange={event => updateDraft(selectedRun.id, criterion.id, { verdict: event.target.value as ReviewDraft['verdict'] })}><option value="">Choose a verdict</option><option value="met">Met</option><option value="not_met">Not met</option><option value="uncertain">Uncertain</option></select></label>
                  <label className="pc-field">Reason<textarea className="pc-textarea" rows={3} maxLength={1_000} value={draft.reason} disabled={!canWrite || !!busy || mustRefresh} placeholder="Describe what you heard in this exact output." onChange={event => updateDraft(selectedRun.id, criterion.id, { reason: event.target.value })}/></label>
                  <label className={styles.heard} aria-disabled={attestationDisabled}><input type="checkbox" checked={draft.heardOutput} disabled={attestationDisabled} onChange={event => updateDraft(selectedRun.id, criterion.id, { heardOutput: event.target.checked })}/><span><strong>I listened to this captured output</strong><small>This is your attestation. The player event only confirms that playback started.</small></span></label>
                  <button className="pc-button" type="button" disabled={!canWrite || !draft.verdict || !draft.reason.trim() || !draft.heardOutput || attestationDisabled} onClick={() => void saveReview(criterion.id)}>{busy === 'review' ? <RefreshCw size={14} className={styles.spin}/> : null}Append listening review</button>
                </div>
                {history.length > 0 && <details className={styles.reviewHistory}><summary>Review history ({history.length})</summary>{history.map(item => <p key={item.id}><strong>{item.data.verdict.replace('_', ' ')}</strong> · {item.data.reason}<span>{formatDate(item.createdAt)} · output {shortRef(item.data.outputSha256)} · manifest {shortRef(item.data.manifestDigest)}</span></p>)}</details>}
              </article>;
            })}
          </div>}
          <details className={styles.metadata}><summary>Technical record</summary><dl><div><dt>Run reference</dt><dd>{selectedRun.id}</dd></div><div><dt>Fixture reference</dt><dd>{selectedRun.data.fixtureId}</dd></div><div><dt>Agent version</dt><dd>{selectedRun.data.agentVersionId}</dd></div><div><dt>Manifest hash</dt><dd>{selectedRun.data.manifestDigest || 'Not recorded'}</dd></div><div><dt>Output hash</dt><dd>{selectedRun.data.outputArtifact?.sha256 || 'Not recorded'}</dd></div><div><dt>Captured</dt><dd>{formatDate(selectedRun.createdAt)}</dd></div></dl>{selectedRun.data.uncertainty.length > 0 && <><h4>Known limits</h4><ul>{selectedRun.data.uncertainty.map(item => <li key={item}>{item}</li>)}</ul></>}</details>
        </>}
      </div>
    </div>
  </section>;
}

export function moveTabFocus(event: KeyboardEvent<HTMLButtonElement>, tabs: readonly string[], current: string, setCurrent: (value: string) => void) {
  const index = tabs.indexOf(current);
  let next = index;
  if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
  else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = tabs.length - 1;
  else return;
  event.preventDefault(); setCurrent(tabs[next]);
  requestAnimationFrame(() => document.getElementById(`quality-tab-${tabs[next]}`)?.focus());
}
