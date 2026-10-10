'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Headphones, RefreshCw, Volume2 } from 'lucide-react';
import type { AudioComparisonDimension, AudioComparisonKind, AudioComparisonPacket, AudioComparisonPreference, AudioComparisonRunOption, AudioComparisonSummary } from '../lib/evaluations/audio-comparison';
import { aiRequestId } from '../lib/client/ai-request';
import { ExclusiveRequestGate } from '../lib/evaluations/audio-view';
import styles from './voice-audio-comparison.module.css';

type ListData = { runs: AudioComparisonRunOption[]; comparisons: AudioComparisonSummary[]; evidenceBoundary: string };
type Draft = { preference: AudioComparisonPreference | ''; reason: string };
const dimensions: Array<{ id: AudioComparisonDimension; title: string; question: string }> = [
  { id: 'naturalness', title: 'Naturalness', question: 'Which recording sounds more natural and conversational?' },
  { id: 'pacing', title: 'Pacing', question: 'Which recording better fits the caller’s stated pace request?' },
  { id: 'intelligibility', title: 'Clarity', question: 'Which recording is easier to understand without reading a transcript?' },
  { id: 'warmth', title: 'Professional warmth', question: 'Which recording sounds more respectful and appropriately warm?' },
];
const choices: Array<{ value: AudioComparisonPreference; label: string }> = [{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }, { value: 'tie', label: 'No preference' }, { value: 'neither', label: 'Neither works' }];
const endpoint = '/api/evaluations/audio/comparisons';
const date = (value: string) => new Date(value).toLocaleString();
const deliveryName = (profile: AudioComparisonRunOption['speechDelivery']) => !profile ? 'Workspace default' : `${profile.pace === 'unhurried' ? 'Unhurried · 0.9×' : 'Standard · 1×'}${profile.adaptToRequests ? ' · caller requests enabled' : ''}`;

export function VoiceAudioComparison({ canWrite, agentNames, onCapture, active }: { canWrite: boolean; agentNames: ReadonlyMap<string, string>; onCapture: () => void; active: boolean }) {
  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [kind, setKind] = useState<AudioComparisonKind>('speech_delivery_pair');
  const [packet, setPacket] = useState<AudioComparisonPacket | null>(null);
  const [played, setPlayed] = useState<Record<string, boolean>>({});
  const [playbackError, setPlaybackError] = useState(false);
  const [heard, setHeard] = useState(false);
  const [drafts, setDrafts] = useState<Partial<Record<AudioComparisonDimension, Draft>>>({});
  const gate = useRef(new ExclusiveRequestGate()).current;
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const current = ++generation.current;
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 20_000);
    setLoading(true); setError('');
    try {
      const response = await fetch(endpoint, { cache: 'no-store', signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not load the saved comparisons.');
      if (current === generation.current && !controller.signal.aborted) setData(body);
    } catch (cause) {
      if (current === generation.current && mounted.current) setError(cause instanceof DOMException && cause.name === 'AbortError' ? 'Loading timed out. Refresh to try again.' : cause instanceof Error ? cause.message : 'Could not load comparisons.');
    } finally {
      window.clearTimeout(timer);
      if (current === generation.current && mounted.current) { pending.current = null; setLoading(false); }
    }
  }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; pending.current?.abort(); }; }, []);
  useEffect(() => { if (active) void load(); }, [active, load]);

  async function act<T>(name: string, prepare: () => Promise<Record<string, unknown>> | Record<string, unknown>, use: (value: T) => Promise<void> | void) {
    await gate.run(async () => {
      setBusy(name); setError(''); setNotice('');
      let timer: number | undefined;
      try {
        const body = await prepare();
        const controller = new AbortController();
        timer = window.setTimeout(() => controller.abort(), 20_000);
        const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'The comparison could not be saved.');
        if (mounted.current) await use(result as T);
      } catch (cause) {
        if (mounted.current) setError(cause instanceof DOMException && cause.name === 'AbortError' ? 'The request timed out. Refresh saved comparisons before trying again; no automatic retry was made.' : cause instanceof Error ? cause.message : 'The request could not be completed.');
      } finally { if (timer !== undefined) window.clearTimeout(timer); if (mounted.current) setBusy(''); }
    });
  }
  function receive(next: AudioComparisonPacket) {
    setPacket(next);
    setPlayed({}); setPlaybackError(false); setHeard(false); setDrafts({});
  }
  async function create() {
    if (!first || !second || first === second || !canWrite) return;
    await act<AudioComparisonSummary>('create', async () => {
      const runIds = [first, second].sort();
      return { action: 'create', runIds, kind, requestId: await aiRequestId('audio-comparison', { runIds, kind }) };
    }, async () => { setNotice('Comparison saved. Open it below to listen with source labels hidden.'); await load(); });
  }
  async function open(comparisonId: string) {
    if (!canWrite) return;
    await act<AudioComparisonPacket>('open', () => ({ action: 'open', comparisonId }), receive);
  }
  async function review(dimension: AudioComparisonDimension) {
    const draft = drafts[dimension];
    if (!packet || !draft?.preference || !draft.reason.trim() || !heard || !played.A || !played.B || playbackError) return;
    await act<AudioComparisonPacket>(dimension, () => ({ action: 'review', comparisonId: packet.comparisonId, dimension, preference: draft.preference, reason: draft.reason.trim(), heardBoth: true }), next => { setPacket(next); setNotice('Your assessment is saved against these exact recordings.'); });
  }
  const runLabel = (run: AudioComparisonRunOption) => `${agentNames.get(run.agentId) || 'Saved agent'} · v${run.versionNumber} · ${deliveryName(run.speechDelivery)} · ${date(run.createdAt)}`;

  return <section className={styles.comparison} aria-label="Matched-input listening comparison">
    <header className={styles.header}><div><h2>{packet ? 'Listen before revealing the versions' : 'Compare two recordings'}</h2><p>{packet ? 'A and B keep their assigned order for you. Record all four assessments before the source labels appear.' : 'Keep the caller input and configuration matched, then compare two captured responses without making another AI call.'}</p></div>{packet ? <button className="pc-button" type="button" disabled={!!busy} onClick={() => { setPacket(null); setError(''); setNotice(''); }}><ArrowLeft size={15}/>All comparisons</button> : <button className="pc-button" type="button" disabled={!!busy || loading} onClick={() => void load()}><RefreshCw size={15}/>Refresh</button>}</header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {!canWrite && <p className={styles.boundary}>Your workspace role can read saved records. An operator can create a comparison and record a listening assessment.</p>}
    {!packet && <>
      <section className={styles.setup} aria-labelledby="compare-inputs"><h3 id="compare-inputs">Choose the recordings</h3><p>Only complete, retained recordings with the current comparison metadata are listed. Older audio proof remains available in Audio proof.</p>
        {loading && !data ? <p role="status">Loading saved recordings…</p> : (data?.runs.length || 0) < 2 ? <div className={styles.empty}><Headphones size={22}/><div><strong>Capture two matched responses first</strong><p>Use the same agent and caller fixture. Change only speech delivery, or deliberately repeat the same settings.</p><button className="pc-button" type="button" onClick={onCapture}>Open Audio proof</button></div></div> : <>
          <div className={styles.inputs}>{(['First recording', 'Second recording'] as const).map((label, index) => <label key={label}>{label}<select className="pc-select" value={index ? second : first} disabled={!!busy || !canWrite || loading} onChange={event => index ? setSecond(event.target.value) : setFirst(event.target.value)}><option value="">Choose a captured response</option>{data?.runs.map(run => <option key={run.id} value={run.id}>{runLabel(run)}</option>)}</select></label>)}</div>
          <label className={styles.kind}>Comparison type<select className="pc-select" value={kind} disabled={!!busy || !canWrite} onChange={event => setKind(event.target.value as AudioComparisonKind)}><option value="speech_delivery_pair">Different speech delivery settings</option><option value="identical_repeat">Repeat of identical settings</option></select></label>
          <div className={styles.actions}><p>The server checks the input audio, instructions, knowledge, model and voice. A mismatch prevents comparison.</p><button className="pc-button primary" type="button" disabled={!!busy || loading || !canWrite || !first || !second || first === second} onClick={() => void create()}>{busy === 'create' ? 'Checking recordings…' : 'Create comparison'}</button></div>
        </>}
      </section>
      <section className={styles.history} aria-labelledby="saved-comparisons"><h3 id="saved-comparisons">Saved comparisons</h3>{data?.comparisons.length ? data.comparisons.map((item, index) => <div className={styles.historyRow} key={item.id}><div><strong>Comparison {data.comparisons.length - index}</strong><span>{date(item.createdAt)}</span></div><button className="pc-button" type="button" disabled={!!busy || !canWrite} onClick={() => void open(item.id)}>{busy === 'open' ? 'Opening…' : 'Listen and review'}</button></div>) : <p>No comparison has been saved. Preparing one reuses stored audio and does not start a paid generation.</p>}</section>
    </>}
    {packet && <>
      <section className={styles.scenario}><h3>{packet.scenario.name}</h3><p>Fictional caller</p><blockquote>{packet.scenario.callerText}</blockquote></section>
      <div className={styles.players}>{(['A', 'B'] as const).map(label => <section key={`${packet.assignmentId}:${label}`} className={styles.player}><h3><Volume2 size={18}/>Recording {label}</h3><audio key={packet.clips[label].playbackUrl} controls preload="metadata" aria-label={`Comparison recording ${label}`} src={packet.clips[label].playbackUrl} onPlay={() => setPlayed(previous => ({ ...previous, [label]: true }))} onError={() => { setPlaybackError(true); setError('A recording could not be played. Reopen this comparison to check access and expiry before reviewing.'); }}>Your browser does not support audio playback.</audio><p>{played[label] ? 'Playback started' : 'Ready to play'} · {(packet.clips[label].durationMs / 1000).toFixed(1)} sec</p></section>)}</div>
      <p className={styles.boundary}>Source labels are hidden in this review screen. You may already know the clips; this is not a controlled blind study. Wording may differ. Playback events do not prove that anyone listened.</p>
      {!packet.reveal && <label className={styles.attestation}><input type="checkbox" checked={heard} disabled={!played.A || !played.B || playbackError || !!busy || !canWrite} onChange={event => setHeard(event.target.checked)}/><span><strong>I listened to both complete recordings</strong><small>Your assessment will remain attached to these exact audio files. Saved answers cannot be overwritten.</small></span></label>}
      <section className={styles.ratings} aria-labelledby="listening-assessment"><div className={styles.ratingHeading}><h3 id="listening-assessment">Your listening assessment</h3><span>{packet.reviews.length} of 4 saved</span></div>{dimensions.map(dimension => {
        const saved = packet.reviews.find(item => item.dimension === dimension.id);
        const draft = drafts[dimension.id] || { preference: '', reason: '' };
        return <section key={dimension.id} className={styles.rating}><h4>{dimension.title}</h4><p>{dimension.question}</p>{saved ? <div className={styles.saved}><Check size={17}/><div><strong>{choices.find(choice => choice.value === saved.preference)?.label}</strong><p>{saved.reason}</p></div></div> : <>
          <fieldset disabled={!!busy || !canWrite || playbackError}><legend className="sr-only">{dimension.title} preference</legend><div className={styles.choices}>{choices.map(choice => <label key={choice.value}><input type="radio" name={`comparison-${dimension.id}`} checked={draft.preference === choice.value} onChange={() => setDrafts(previous => ({ ...previous, [dimension.id]: { ...draft, preference: choice.value } }))}/>{choice.label}</label>)}</div></fieldset>
          <label className={styles.reason} htmlFor={`comparison-reason-${dimension.id}`}>What did you hear?<textarea id={`comparison-reason-${dimension.id}`} className="pc-textarea" value={draft.reason} maxLength={1000} rows={2} disabled={!!busy || !canWrite || playbackError} onChange={event => setDrafts(previous => ({ ...previous, [dimension.id]: { ...draft, reason: event.target.value } }))}/></label>
          <button className="pc-button" type="button" disabled={!!busy || !canWrite || !heard || !played.A || !played.B || playbackError || !draft.preference || !draft.reason.trim()} onClick={() => void review(dimension.id)}>{busy === dimension.id ? 'Saving assessment…' : `Save ${dimension.title.toLowerCase()} assessment`}</button>
        </>}</section>;
      })}</section>
      {packet.reveal && <section className={styles.reveal}><h3>Source labels revealed</h3><p>Your four assessments are saved. These two recordings do not establish a general winner or authorize publication.</p>{(['A', 'B'] as const).map(label => <div key={label}><strong>Recording {label}</strong><span>{deliveryName(packet.reveal![label].speechDelivery)}</span></div>)}</section>}
    </>}
  </section>;
}
