import { Ear, Pause, Radio } from "lucide-react";
import type { ContinuousUnderstandingSnapshot } from "@/lib/voice/continuous-understanding";
import styles from "./continuous-understanding.module.css";

export type ContinuousUnderstandingStatus = {
  state: "connecting" | "ready" | "unavailable" | "ended";
  reason?: string;
};

type Props = {
  enabled: boolean;
  callState: "idle" | "connecting" | "live" | "ended";
  muted: boolean;
  snapshot: ContinuousUnderstandingSnapshot | null;
  status: ContinuousUnderstandingStatus | null;
};

const paceLabels: Record<NonNullable<ContinuousUnderstandingSnapshot["cues"]>["pace"], string> = {
  normal: "Normal",
  unhurried: "Unhurried",
  brief: "Brief",
};

function unavailableMessage(reason?: string) {
  switch (reason) {
    case "authentication": return "Recognition authorization ended. The voice call can continue.";
    case "capacity": return "Recognition is busy. The voice call can continue without this view.";
    case "backpressure": return "Recognition could not keep up with the microphone stream. The voice call can continue.";
    case "expired": return "The recognition window ended. The voice call can continue.";
    case "input_limit": return "Recognition reached an input limit. The voice call can continue without this view.";
    case "microphone": return "Recognition lost the microphone stream. Check the call controls; the voice call may still continue.";
    case "configuration": return "Live understanding is not configured for this workspace.";
    default: return "Recognition is unavailable. The voice call can continue without this view.";
  }
}

function statusCopy(props: Props) {
  if (!props.enabled) return { title: "Off for this call", detail: "Enable Live understanding before starting an Azure microphone call." };
  if (props.status?.state === "unavailable") return { title: "Recognition unavailable", detail: unavailableMessage(props.status.reason) };
  if (props.muted || props.snapshot?.phase === "paused") return { title: "Paused while muted", detail: "Tentative words were cleared. Recognition resumes with fresh speech after unmuting." };
  if (props.status?.state === "connecting" || props.callState === "connecting") return { title: "Connecting recognition", detail: "The voice call is opening separately." };
  if (props.status?.state === "ended" || props.snapshot?.phase === "ended" || props.callState === "ended") return { title: "Recognition ended", detail: "Recognition stopped and the temporary words were cleared." };
  if (props.snapshot?.phase === "awaiting_final") return { title: "Waiting for the final transcript", detail: "The agent is waiting for the final transcript before replying." };
  if (props.snapshot?.phase === "preparing") return { title: "Preparing tentative guidance", detail: "Repeated revisions agree for now, but the words and cues may still change." };
  if (props.snapshot?.phase === "tentative") return { title: "Understanding current speech", detail: "This view replaces its words as recognition changes." };
  if (props.status?.state === "ready" || props.callState === "live") return { title: "Listening for speech", detail: "Current tentative words will appear here." };
  return { title: "Ready for the next call", detail: "Live understanding starts only with an opted-in Azure microphone call." };
}

export function ContinuousUnderstanding({ enabled, callState, muted, snapshot, status }: Props) {
  const copy = statusCopy({ enabled, callState, muted, snapshot, status });
  const latest = enabled && callState !== "ended" && !muted && snapshot?.phase !== "ended" && status?.state !== "ended" && status?.state !== "unavailable" ? snapshot?.latest : undefined;
  const cues = latest ? snapshot?.cues : undefined;

  return <div className={styles.panel}>
    <div className={styles.state} role="status" aria-live="polite">
      <span className={styles.icon} data-state={status?.state || snapshot?.phase || callState} aria-hidden="true">
        {muted || snapshot?.phase === "paused" ? <Pause size={17}/> : status?.state === "ready" ? <Radio size={17}/> : <Ear size={17}/>}
      </span>
      <div><strong>{copy.title}</strong><p>{copy.detail}</p></div>
    </div>

    {latest && <section className={styles.current} aria-label="Current tentative words">
      <div className={styles.currentHeading}>
        <h4>Current words</h4>
        <span>{latest.state === "sidecar_final" ? "Recognizer draft final" : "Tentative"}</span>
      </div>
      <blockquote>{latest.text}</blockquote>
      <p>New revisions replace this text. They do not add transcript turns.</p>
    </section>}

    {cues && <section className={styles.cues} aria-label="Tentative response cues">
      <h4>Tentative cues</h4>
      <dl>
        <div><dt>Language</dt><dd>{cues.language?.trim() || "Unknown"}</dd></div>
        <div><dt>Pace</dt><dd>{paceLabels[cues.pace]}</dd></div>
        <div><dt>Pause</dt><dd>{cues.pauseRequested ? "May be requested" : "Not observed"}</dd></div>
      </dl>
    </section>}

    {snapshot && snapshot.revisionCount > 0 && <div className={styles.counts} aria-label="Recognition update counts">
      <span><strong>{snapshot.revisionCount}</strong> revisions</span>
      <span><strong>{snapshot.sidecarFinalCount}</strong> recognizer finals</span>
      {snapshot.discardedCount > 0 && <span><strong>{snapshot.discardedCount}</strong> discarded</span>}
    </div>}

    <p className={styles.boundary}>These temporary words are not saved. The agent responds only after the final transcript confirms the person’s turn.</p>
  </div>;
}
