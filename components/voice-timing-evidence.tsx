import { createVoiceTimingView } from "@/lib/voice/timing-view";
import styles from "./voice-timing-evidence.module.css";

interface VoiceTimingEvidenceProps {
  diagnostics: unknown;
  inputMode?: unknown;
  mode?: "live" | "saved";
  className?: string;
}

function Measurement({ label, value, minimum }: { label: string; value?: number; minimum?: number }) {
  const unavailable = value === undefined;
  return <span className={styles.measurement}>
    <small>{label}</small>
    <strong>{unavailable ? "—" : `${value} ms`}</strong>
    {unavailable && minimum ? <span className={styles.srOnly}>Available after {minimum} samples</span> : null}
  </span>;
}

export function VoiceTimingEvidence({ diagnostics, inputMode, mode = "live", className }: VoiceTimingEvidenceProps) {
  const view = createVoiceTimingView(diagnostics);
  const typedCall = inputMode === "text";
  if (!view) return <section className={[styles.evidence, className].filter(Boolean).join(" ")}>
    <h4>Client timing evidence</h4>
    <p className={styles.empty}>{mode === "saved" ? "No verified client event timing was retained with this conversation." : "Client event timing is not available for this call."}</p>
  </section>;

  const preparationAttempts = view.privatePreparationObserved ? (view.preAckHits ?? 0) + (view.preAckMisses ?? 0) : undefined;
  const microphoneCountersObserved = view.privatePreparationObserved && !typedCall;
  return <section className={[styles.evidence, className].filter(Boolean).join(" ")}>
    <div className={styles.heading}>
      <h4>Client timing evidence</h4>
      <span>Up to 20 samples per stage</span>
    </div>
    <p className={styles.scope}>Independent browser event intervals. Do not add the rows: they exclude audible playback and do not measure acoustic or end-to-end latency.</p>

    <div className={styles.stages} aria-label="Client event timing stages" role="group">
      {view.stages.map(item => <div className={styles.stage} key={item.key}>
        <div className={styles.stageName}>
          <strong>{item.label}</strong>
          <span>{item.sampleCount ? item.description : item.microphoneOnly && typedCall ? "Not observed in this typed call." : "Not observed."}</span>
        </div>
        <div className={styles.metrics}>
          <span className={styles.measurement}><small>Samples</small><strong>{item.sampleCount}</strong></span>
          <Measurement label="Latest" value={item.latestMs}/>
          <Measurement label="P50" value={item.p50Ms} minimum={3}/>
          <Measurement label="P95" value={item.p95Ms} minimum={20}/>
        </div>
      </div>)}
    </div>

    <div className={styles.observations}>
      <div>
        <span>Partials observed during speech</span>
        <strong>{typedCall ? "Not observed in this typed call" : microphoneCountersObserved ? `${view.asrDeltasDuringSpeech} events across ${view.speechStarts} speech ${view.speechStarts === 1 ? "start" : "starts"}` : "Not observed"}</strong>
      </div>
      <div>
        <span>Partial event order</span>
        <strong>{typedCall ? "Not observed in this typed call" : microphoneCountersObserved ? `${view.asrDeltasBeforeCommit} before commit · ${view.asrDeltasAfterCommit} after commit` : "Not observed"}</strong>
      </div>
      <div>
        <span>Prepared guidance reused</span>
        <strong>{preparationAttempts ? `${view.preAckHits} of ${preparationAttempts} observed candidates` : "No candidate decisions observed"}</strong>
      </div>
    </div>
    {!view.privatePreparationObserved && <p className={styles.note}>{typedCall ? "Microphone preparation events were not observed in this typed call." : "No microphone preparation events were observed for this call."}</p>}
    <p className={styles.note}>Partial-event ordering does not show that the content was meaningful or understood during speech. Reuse means the exact prepared candidate matched; its acknowledgement may arrive before or after final ASR. The reply still waits for final ASR and response permission.</p>
  </section>;
}
