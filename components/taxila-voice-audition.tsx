'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Headphones, RefreshCw, Volume2 } from 'lucide-react';
import { aiRequestId, newAiRequestAttempt } from '../lib/client/ai-request';
import { ExclusiveRequestGate } from '../lib/evaluations/audio-view';
import type { SpeechAudition } from '../lib/voice/speech-audition';
import type { TaxilaSpeechPresetId } from '../lib/voice/taxila-speech';
import styles from './taxila-voice-audition.module.css';

type Preset = { id: TaxilaSpeechPresetId; label: string; voice: string; baseRate: 0 };
type AuditionList = {
  presets: readonly Preset[];
  attempts: SpeechAudition[];
  canWrite: boolean;
  maxTextCharacters: number;
  evidenceBoundary: string;
};

const ENDPOINT = '/api/voice/auditions';
const REQUEST_TIMEOUT_MS = 35_000;
const HINGLISH_SAMPLE = 'Hi! मैं आपकी AI teacher हूँ। चलिए, इस concept को step by step समझते हैं।';
const ENGLISH_SAMPLE = 'Hi! I’m your AI teacher. Let’s understand this concept step by step.';
const presetNames: Record<TaxilaSpeechPresetId, string> = {
  'taxila-diya': 'Taxila Diya · Indian DragonHD',
  'taxila-arjun': 'Taxila Arjun · Indian DragonHD',
};

const statusCopy: Record<SpeechAudition['status'], string> = {
  pending: 'Pending', complete: 'Generated', failed: 'Failed', uncertain: 'Uncertain',
};
const failureCopy: Record<string, string> = {
  configuration_unavailable: 'Azure Speech is not configured for this workspace.',
  admission_denied: 'The workspace could not reserve this generation.',
  unsupported_voice: 'Azure did not accept this source preset on the configured resource.',
  provider_rejected: 'Azure rejected the generation.',
  deadline_exceeded: 'Azure did not finish before the request deadline.',
  transport_uncertain: 'The provider outcome or connection closure could not be confirmed.',
  invalid_audio: 'The returned audio did not pass the saved WAV checks.',
  storage_failed: 'Audio was generated, but private artifact storage did not complete.',
};
const formatDate = (value: string) => new Date(value).toLocaleString();
const shortRef = (value: string) => value.slice(-8);
const expired = (value: string) => Date.parse(value) <= Date.now();

export function TaxilaVoiceAudition({ viewer }: { viewer: boolean }) {
  const [activated, setActivated] = useState(false);
  return <details className={styles.disclosure} onToggle={event => {
    if (event.currentTarget.open) setActivated(true);
  }}>
    <summary>Teacher voice auditions</summary>
    {activated && <AuditionWorkbench viewer={viewer}/>}
  </details>;
}

function AuditionWorkbench({ viewer }: { viewer: boolean }) {
  const [data, setData] = useState<AuditionList | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preset, setPreset] = useState<TaxilaSpeechPresetId>('taxila-diya');
  const [text, setText] = useState(HINGLISH_SAMPLE);
  const [consent, setConsent] = useState(false);
  const [settled, setSettled] = useState(false);
  const [requestIdOverride, setRequestIdOverride] = useState('');
  const [playbackErrors, setPlaybackErrors] = useState<Record<string, boolean>>({});
  const gate = useRef(new ExclusiveRequestGate()).current;
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    const timer = window.setTimeout(() => nextController.abort(), 20_000);
    setLoading(true); setError('');
    try {
      const response = await fetch(ENDPOINT, { cache: 'no-store', signal: nextController.signal });
      const body = await response.json() as AuditionList & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Saved voice auditions could not be loaded.');
      if (mounted.current && current === generation.current) setData(body);
    } catch (cause) {
      if (mounted.current && current === generation.current) setError(cause instanceof DOMException && cause.name === 'AbortError' ? 'Loading timed out. Refresh saved auditions to try again.' : cause instanceof Error ? cause.message : 'Saved voice auditions could not be loaded.');
    } finally {
      window.clearTimeout(timer);
      if (mounted.current && current === generation.current) { controller.current = null; setLoading(false); }
    }
  }, []);

  useEffect(() => {
    mounted.current = true; void load();
    return () => { mounted.current = false; generation.current++; controller.current?.abort(); };
  }, [load]);

  const canWrite = !!data?.canWrite && !viewer;
  const maxLength = data?.maxTextCharacters || 280;
  const locked = !!busy || settled;
  const selectedPresetCaptured = !!data?.attempts.some(attempt => attempt.data.preset === preset && attempt.status === 'complete' && attempt.data.artifact);
  const requestInput = { preset, text, consent: true };
  const editText = (next: string) => { setText(next); setConsent(false); setRequestIdOverride(''); setError(''); setNotice(''); };
  const choosePreset = (next: TaxilaSpeechPresetId) => { setPreset(next); setConsent(false); setRequestIdOverride(''); setError(''); setNotice(''); };

  async function generate() {
    if (!canWrite || !consent || !text.trim() || text.length > maxLength || settled) return;
    await gate.run(async () => {
      setBusy('generate'); setError(''); setNotice('');
      let timer: number | undefined;
      let requestStarted = false;
      let responseReceived = false;
      try {
        // Enter the exclusive gate before deriving the stable request ID or awaiting any I/O.
        const requestId = requestIdOverride || await aiRequestId('taxila-voice-audition', requestInput);
        if (mounted.current) setRequestIdOverride(requestId);
        const postController = new AbortController();
        timer = window.setTimeout(() => postController.abort(), REQUEST_TIMEOUT_MS);
        requestStarted = true;
        const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId, preset, text, consent: true }), signal: postController.signal });
        responseReceived = true;
        const body = await response.json() as SpeechAudition & { error?: string };
        if (!response.ok) throw new Error(body.error || 'The voice audition could not be generated.');
        if (!mounted.current) return;
        setData(previous => previous ? { ...previous, attempts: [body, ...previous.attempts.filter(attempt => attempt.id !== body.id)] } : previous);
        setSettled(true);
        if (body.status === 'complete' && body.data.artifact) setNotice('Audition generated and stored privately. Playback does not change this agent’s live voice.');
        else if (body.status === 'complete') setError('The request completed without a playable saved artifact. The record remains in history; no automatic retry was made.');
        else setError(body.status === 'uncertain' ? 'This attempt has an uncertain provider outcome. It remains in history; no automatic retry was made.' : 'This attempt failed and remains in history. No automatic retry was made.');
      } catch (cause) {
        if (!mounted.current) return;
        const uncertain = requestStarted && !responseReceived;
        setSettled(uncertain);
        setError(uncertain ? 'The request timed out, so its outcome is uncertain. Check saved attempts before deliberately starting a new attempt.' : cause instanceof Error ? cause.message : 'The voice audition could not be generated.');
      } finally {
        if (timer !== undefined) window.clearTimeout(timer);
        if (mounted.current) setBusy('');
      }
    });
  }

  async function beginNewAttempt() {
    if (!canWrite || busy) return;
    await gate.run(async () => {
      setBusy('new'); setError(''); setNotice('');
      try {
        const requestId = await newAiRequestAttempt('taxila-voice-audition', requestInput);
        if (mounted.current) { setRequestIdOverride(requestId); setSettled(false); setConsent(false); setNotice('New attempt prepared. Review the same text and confirm private processing again.'); }
      } catch (cause) {
        if (mounted.current) setError(cause instanceof Error ? cause.message : 'A new attempt could not be prepared in this browser.');
      } finally { if (mounted.current) setBusy(''); }
    });
  }

  return <div className={styles.workbench}>
    <header className={styles.intro}><div><h3>Hear the source voice presets</h3><p>Generated Azure Speech samples. Live browser calls keep their configured Realtime voice.</p></div><span className={styles.source}>Taxila source port</span></header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {!data ? loading ? <p className={styles.loading} role="status">Loading saved auditions…</p> : <div className={styles.loadFailure}><p>Saved auditions are unavailable. Refresh before generating so existing attempts remain visible.</p><button className="pc-button" type="button" onClick={() => void load()}><RefreshCw size={15} aria-hidden="true"/>Refresh saved attempts</button></div> : <>
      <form className={styles.form} onSubmit={event => { event.preventDefault(); void generate(); }}>
        <label className="pc-field" htmlFor="taxila-audition-preset">Teacher preset<select id="taxila-audition-preset" className="pc-select" value={preset} disabled={!canWrite || locked} onChange={event => choosePreset(event.target.value as TaxilaSpeechPresetId)}>{(data?.presets || []).map(item => <option key={item.id} value={item.id}>{presetNames[item.id]}</option>)}</select><small>{selectedPresetCaptured ? 'A saved attempt confirms this configured Azure resource returned validated audio for this preset. Hindi and English pronunciation still need listening review.' : 'Indian DragonHD source preset. Language and voice acceptance remain unverified until an actual saved attempt completes.'}</small></label>
        <div className={styles.samples} aria-label="Example scripts"><span>Example text</span><button className="pc-button" type="button" disabled={!canWrite || locked} onClick={() => editText(HINGLISH_SAMPLE)}>Use Hinglish sample</button><button className="pc-button" type="button" disabled={!canWrite || locked} onClick={() => editText(ENGLISH_SAMPLE)}>Use English sample</button></div>
        <label className="pc-field" htmlFor="taxila-audition-text"><span className={styles.fieldHeading}>Audition text <small>{text.length} / {maxLength}</small></span><textarea id="taxila-audition-text" className="pc-textarea" rows={4} maxLength={maxLength} required value={text} disabled={!canWrite || locked} onChange={event => editText(event.target.value)}/><small>The reviewed renderer preserves the entered words and numbers and marks Devanagari runs as hi-IN.</small></label>
        <label className={styles.consent}><input type="checkbox" checked={consent} disabled={!canWrite || locked} onChange={event => setConsent(event.target.checked)}/><span><strong>I consent to Azure processing this text</strong><small>Generated audio is stored privately for up to 7 days. Saved history keeps a text fingerprint and the outcome.</small></span></label>
        {!canWrite && <p className={styles.boundary}>Read-only access. You can inspect and play saved auditions; an operator must consent and generate a new sample.</p>}
        <div className={styles.actions}><p>Generate makes one Azure Speech call. It does not update the agent draft or its live Realtime voice.</p>{settled ? <button className="pc-button" type="button" disabled={!canWrite || !!busy} onClick={() => void beginNewAttempt()}>{busy === 'new' ? 'Preparing…' : 'New attempt'}</button> : <button className="pc-button primary" type="submit" disabled={!canWrite || !!busy || loading || !consent || !text.trim() || text.length > maxLength}>{busy === 'generate' ? 'Generating one sample…' : 'Generate sample'}</button>}</div>
      </form>
      <section className={styles.history} aria-labelledby="taxila-audition-history"><div className={styles.historyHeading}><div><h3 id="taxila-audition-history">Saved attempts</h3><p>Failed and uncertain attempts stay visible beside generated audio.</p></div><button className="pc-button" type="button" disabled={loading || !!busy} onClick={() => void load()}><RefreshCw size={15} aria-hidden="true"/>{loading ? 'Checking…' : 'Refresh'}</button></div>
        {data?.attempts.length ? <ol className={styles.attempts}>{data.attempts.map(attempt => {
          const artifact = attempt.data.artifact;
          const isExpired = !!artifact && expired(artifact.expiresAt);
          const displayStatus = attempt.status === 'complete' && !artifact ? 'Artifact unavailable' : statusCopy[attempt.status];
          const displayStatusKind = attempt.status === 'complete' && !artifact ? 'failed' : attempt.status;
          return <li key={attempt.id} className={styles.attempt}>
            <div className={styles.attemptHead}><div><strong>{presetNames[attempt.data.preset]}</strong><span>{formatDate(attempt.createdAt)} · {attempt.data.characterCount} characters · ref {shortRef(attempt.id)}</span></div><span className={styles.status} data-status={displayStatusKind}>{displayStatus}</span></div>
            {attempt.status === 'complete' && artifact && !isExpired && <div className={styles.player}><Volume2 size={17} aria-hidden="true"/><audio controls preload="metadata" aria-label={`${presetNames[attempt.data.preset]} saved voice audition from ${formatDate(attempt.createdAt)}`} src={artifact.playbackUrl} onError={() => setPlaybackErrors(previous => ({ ...previous, [attempt.id]: true }))}>Your browser does not support audio playback.</audio><span>{(artifact.durationMs / 1000).toFixed(1)} sec</span></div>}
            {attempt.status === 'complete' && !artifact && <p className={styles.attemptError} role="alert">This completed record has no playable private audio artifact.</p>}
            {isExpired && <p className={styles.attemptMessage}>The private audio has expired. The attempt record remains for history.</p>}
            {playbackErrors[attempt.id] && <p className={styles.attemptError} role="alert">This saved audio could not be played. Refresh to check its access or expiry.</p>}
            {(attempt.status === 'failed' || attempt.status === 'uncertain') && <p className={styles.attemptMessage}>{failureCopy[attempt.data.failureCode || ''] || 'The attempt did not produce stored audio.'}</p>}
            {attempt.status === 'pending' && <p className={styles.attemptMessage}>This recorded attempt has not reached a terminal state. Refresh before deciding whether to start a new attempt.</p>}
          </li>;
        })}</ol> : <div className={styles.empty}><Headphones size={20} aria-hidden="true"/><p>No teacher voice auditions have been saved in this workspace.</p></div>}
      </section>
      <p className={styles.boundary}>{data?.evidenceBoundary || 'These samples are generated evidence only and do not change the live voice.'}</p>
    </>}
  </div>;
}
