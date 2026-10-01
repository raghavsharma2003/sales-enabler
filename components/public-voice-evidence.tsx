import { isPublicVoiceEvidence, type PublicVoiceResponseEvidence, type PublicVoiceTokenUsage } from '../lib/public-agent/evidence';
import styles from './public-voice-evidence.module.css';

type PublicVoiceEvidenceProps = {
  source: unknown;
  evidence: unknown;
};

const number = new Intl.NumberFormat('en-IN');

function count(value: number, singular: string, plural = `${singular}s`) {
  return `${number.format(value)} ${value === 1 ? singular : plural}`;
}

function offset(value: number | undefined) {
  return value === undefined ? 'Not captured' : `+${number.format(value)} ms`;
}

function lag(value: number | undefined) {
  return value === undefined ? 'Not captured' : `${number.format(value)} ms`;
}

function completion(turn: PublicVoiceResponseEvidence) {
  if (turn.status === 'completed') return 'Completed';
  if (turn.status === 'cancelled') return 'Cancelled';
  if (turn.status === 'failed') return 'Failed';
  if (turn.status === 'incomplete') return 'Incomplete';
  if (turn.status === 'unknown') return 'Unknown terminal state';
  return 'Not captured';
}

function cancellation(turn: PublicVoiceResponseEvidence) {
  if (turn.cancelled) return turn.cancelRequested ? 'Requested; provider confirmed' : 'Provider confirmed';
  if (turn.cancelRequested) return 'Requested; not provider-confirmed';
  return 'No request recorded';
}

function usageParts(usage: PublicVoiceTokenUsage | undefined) {
  if (!usage) return [];
  return [
    usage.totalTokens === undefined ? undefined : `${number.format(usage.totalTokens)} total tokens`,
    usage.inputTokens === undefined ? undefined : `${number.format(usage.inputTokens)} input tokens`,
    usage.outputTokens === undefined ? undefined : `${number.format(usage.outputTokens)} output tokens`,
    usage.inputAudioTokens === undefined ? undefined : `${number.format(usage.inputAudioTokens)} input audio tokens`,
    usage.outputAudioTokens === undefined ? undefined : `${number.format(usage.outputAudioTokens)} output audio tokens`,
  ].filter((part): part is string => Boolean(part));
}

function TurnEvidence({ turn }: { turn: PublicVoiceResponseEvidence }) {
  const turnNumber = Number(turn.turn.slice(4));
  const usage = usageParts(turn.tokenUsage);
  const state = turn.status === 'completed' ? 'complete' : turn.status === 'failed' || turn.status === 'cancelled' ? 'attention' : 'neutral';

  return <li className={styles.turn}>
    <div className={styles.turnHead}>
      <h4>Turn {turnNumber}</h4>
      <span className={styles.status} data-state={state}>{completion(turn)}</span>
    </div>

    <dl className={styles.turnMetrics}>
      <div><dt>Request → first server audio</dt><dd>{lag(turn.requestedToFirstServerAudioMs)}</dd></div>
      <div><dt>Cancellation</dt><dd>{cancellation(turn)}</dd></div>
      <div><dt>Accepted audio</dt><dd>{turn.audioBytes > 0 ? count(turn.audioBytes, 'byte') : 'No nonempty audio accepted'}</dd></div>
      <div><dt>Terminal result</dt><dd>{completion(turn)}</dd></div>
    </dl>

    <div className={styles.events} aria-label={`Turn ${turnNumber} server event offsets from session start`}>
      <div><span>Request</span><strong>{offset(turn.requestedAtMs)}</strong></div>
      <div><span>Provider created</span><strong>{offset(turn.providerCreatedAtMs)}</strong></div>
      <div><span>First audio accepted</span><strong>{offset(turn.firstServerAudioAtMs)}</strong></div>
      <div><span>Terminal event</span><strong>{offset(turn.terminalAtMs)}</strong></div>
    </div>

    <p className={styles.usage}>{usage.length ? `Provider-reported usage: ${usage.join(' · ')}` : 'Provider-reported usage was not captured.'}</p>
  </li>;
}

export function PublicVoiceEvidence({ source, evidence }: PublicVoiceEvidenceProps) {
  if (source !== 'public_voice') return null;

  if (!isPublicVoiceEvidence(evidence)) {
    return <section className={styles.absent} aria-label="Server voice evidence not captured">
      <h3>Server voice evidence not captured</h3>
      <p>No validated server-transport record is available for this conversation. Missing measurements are unknown and are not treated as zero.</p>
    </section>;
  }

  const measuredLagCount = evidence.turns.filter(turn => turn.requestedToFirstServerAudioMs !== undefined).length;
  const cancelRequestCount = evidence.turns.filter(turn => turn.cancelRequested).length;
  const confirmedCancellationCount = evidence.turns.filter(turn => turn.cancelled).length;
  const turnsWithAudio = evidence.turns.filter(turn => turn.audioBytes > 0).length;

  return <details className={styles.details}>
    <summary>
      <span className={styles.summaryLine}>
        <span>Server voice evidence</span>
        <span className={styles.summaryMeta}>{evidence.turns.length ? count(evidence.turns.length, 'recorded turn') : 'No response turns recorded'}</span>
      </span>
    </summary>
    <div className={styles.content}>
      <p className={styles.definition}><strong>Metric definition:</strong> Request → first server audio is the elapsed server time from requesting a provider response to accepting its first nonempty audio bytes. It does not measure browser playback or what the visitor heard.</p>

      {evidence.turns.length > 0 && <dl className={styles.coverage}>
        <div><dt>Timing coverage</dt><dd>{count(measuredLagCount, 'turn')} of {count(evidence.turns.length, 'recorded turn')}</dd></div>
        <div><dt>Cancellation</dt><dd>{number.format(cancelRequestCount)} requested · {number.format(confirmedCancellationCount)} provider-confirmed</dd></div>
        {turnsWithAudio > 0 && <div><dt>Audio accepted</dt><dd>{count(turnsWithAudio, 'recorded turn')}</dd></div>}
      </dl>}

      <p className={styles.coverageNote}>Coverage is best-effort and may be partial. Missing turns and fields remain unknown; only server-transport observations are shown.</p>
      {evidence.turns.length
        ? <ol className={styles.turns}>{evidence.turns.map(turn => <TurnEvidence key={turn.turn} turn={turn}/>)}</ol>
        : <p className={styles.empty}>The server evidence envelope was saved, but it contains no recorded response turns.</p>}
    </div>
  </details>;
}
