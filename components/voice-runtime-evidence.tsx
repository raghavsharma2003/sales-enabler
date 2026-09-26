import type { RelationalRuntime } from '@/lib/voice/relational-runtime';

export function VoiceRuntimeEvidence({ evidence }: { evidence: unknown }) {
  if (!evidence || typeof evidence !== 'object' || (evidence as Partial<RelationalRuntime>).version !== 'relational-runtime-v1') return null;
  const runtime = evidence as RelationalRuntime;
  return <details className="wb-history"><summary>EmotionalOS &amp; RelationalOS · {runtime.events.length} state transitions</summary>
    <p className="pc-muted">Recomputed from this saved transcript and its available authorized context. These are conversation observations, not permanent customer facts.</p>
    <div className="pc-row"><span>Language: {runtime.state.language}</span><span>Pacing: {runtime.state.pace}</span><span>Repair: {runtime.state.repair_state}</span></div>
    {runtime.events.map(event => <div className="pc-row" key={event.id}><div><strong>{event.dim}: {event.from_v || 'unset'} → {event.to_v}</strong><p>{event.note}</p>{event.citations.map((citation, index) => <blockquote key={index}>“{citation.text}” · turn {citation.entryIndex + 1}</blockquote>)}</div></div>)}
    {!runtime.events.length && <p>No explicit state changes in this conversation.</p>}
  </details>;
}
