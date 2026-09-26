'use client';

import '../app/agent-revision.css';

import { useEffect, useState } from 'react';
import type { AgentConfig } from '../lib/platform/agents';
import type { PlatformRecord } from '../lib/platform/contracts';
import type { AgentChangeProposal } from '../lib/agent-revision/service';

const editableFields = ['systemPrompt', 'openingMessage', 'responseStyle', 'objective', 'escalation'] as const;

const labels: Record<(typeof editableFields)[number], string> = {
  systemPrompt: 'System prompt', openingMessage: 'Opening message', responseStyle: 'Conversation behaviour', objective: 'Objective', escalation: 'Human escalation',
};
type Props = {
  agent?: PlatformRecord; dirty: boolean; viewer: boolean;
  proposals: PlatformRecord[]; onApplied: () => Promise<void>;
};
const newId = () => crypto.randomUUID();
async function request(body: Record<string, unknown>): Promise<PlatformRecord<AgentChangeProposal>> {
  const response = await fetch('/api/agent-revisions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Agent revision request failed.');
  return result;
}
export function AgentRevision({ agent, dirty, viewer, proposals, onApplied }: Props) {
  const [instruction, setInstruction] = useState('');
  const [requestId, setRequestId] = useState(newId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [local, setLocal] = useState<PlatformRecord<AgentChangeProposal> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { setInstruction(''); setRequestId(newId()); setSelectedId(null); setLocal(null); setError(''); setNotice(''); }, [agent?.id]);
  const history = proposals.filter(item => item.kind === 'agent_change_proposal' && item.data.agentId === agent?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) as PlatformRecord<AgentChangeProposal>[];
  const selected = local?.id === selectedId ? local : history.find(item => item.id === selectedId) || history[0];
  const stale = !!selected && !!agent && agent.revision !== selected.data.baseRevision;
  const canApply = !viewer && !dirty && !busy && selected?.status === 'ready' && !stale;
  async function propose() {
    if (!agent || viewer || dirty || !instruction.trim()) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request({ action: 'propose', agentId: agent.id, revision: agent.revision, instruction: instruction.trim(), requestId });
      setLocal(result); setSelectedId(result.id);
      if (result.status === 'invalid') setError(result.data.invalidReason || 'The suggestion could not be reviewed. Start a new attempt.');
      else setNotice('Suggestion saved. Review every changed field before applying.');
      await onApplied();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create a suggestion.'); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!canApply || !selected) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request({ action: 'apply', proposalId: selected.id });
      setLocal(result); setSelectedId(result.id);
      await onApplied();
      setNotice('Applied to the saved draft. Test it, then capture a version before release.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not apply the suggestion.'); }
    finally { setBusy(false); }
  }
  async function recheck() {
    if (!selected || selected.status !== 'invalid' || viewer || dirty || stale) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request({ action: 'recheck', proposalId: selected.id });
      setLocal(result); setSelectedId(result.id);
      await onApplied();
      setNotice('Saved Azure output rechecked. Review every changed field before applying.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not recheck the saved output.'); }
    finally { setBusy(false); }
  }
  return <details className="wb-history ar-panel"><summary>Improve with an instruction</summary><div className="ar-body">
    <p className="pc-muted">Describe how this agent should speak or respond. This edits the saved instructions, not model weights, and changes the draft only after you review and apply it.</p>
    {!agent && <p className="pc-muted">Save this new agent first, then ask for a suggested change.</p>}
    {agent && dirty && <p className="ar-warning" role="status">Save or discard your editor changes before generating or applying a suggestion.</p>}
    {!viewer && <><label className="pc-field" htmlFor="ar-instruction">What should change?<textarea id="ar-instruction" className="pc-textarea" maxLength={2000} value={instruction} disabled={!agent || busy} onChange={event => { setInstruction(event.target.value); setRequestId(newId()); setError(''); }} placeholder="Make Maya slower, ask one question at a time, and confirm corrections."/></label><div className="ar-buttons"><button type="button" className="pc-button primary" disabled={!agent || dirty || busy || !instruction.trim()} onClick={() => void propose()}>{busy ? 'Working…' : 'Review proposed changes'}</button><button type="button" className="pc-button quiet" disabled={busy || !agent} onClick={() => { setRequestId(newId()); setError(''); setNotice('New attempt ready. Review the instruction before sending.'); }}>New attempt</button></div></>}
    {viewer && <p className="pc-muted">Read-only access. An operator can request and apply changes.</p>}
    {error && <p className="ar-error" role="alert">{error}</p>}{notice && <p className="pc-muted" role="status">{notice}</p>}
    {history.length > 0 && <label className="pc-field" htmlFor="ar-history">Saved suggestions<select id="ar-history" className="pc-select" value={selected?.id || ''} onChange={event => { setSelectedId(event.target.value); setLocal(null); setError(''); }}>{history.map(item => <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleString()} · {item.status} · {item.data.instruction.slice(0, 70)}</option>)}</select></label>}
    {selected && <section className="ar-review" aria-label="Proposed agent changes"><div className="ar-review-head"><strong>{selected.status === 'applied' ? 'Applied change' : selected.status === 'ready' ? 'Review proposed changes' : 'Suggestion unavailable'}</strong><span className="pc-badge">Saved draft r{selected.data.baseRevision}</span></div><p className="pc-muted">Instruction: {selected.data.instruction}</p>{selected.data.explanation && <p>{selected.data.explanation}</p>}
      {selected.data.changedFields?.map(field => <div className="ar-diff" key={field}><h4>{labels[field]}</h4><div className="ar-diff-grid"><div><small>Before</small><p>{selected.data.before[field] || 'Empty'}</p></div><div><small>Proposed</small><p>{selected.data.after?.[field] || 'Empty'}</p></div></div></div>)}
      {stale && selected.status === 'ready' && <p className="ar-warning" role="status">This saved draft changed. Refresh and generate a new suggestion.</p>}
      {selected.status === 'ready' && <button type="button" className="pc-button primary" disabled={!canApply} onClick={() => void apply()}>Apply to saved draft</button>}
      {selected.status === 'applied' && <p className="pc-muted">Applied to saved draft revision {selected.data.appliedRevision}. No version or release was created.</p>}
      {selected.status === 'invalid' && <><p className="ar-error">{selected.data.invalidReason}</p>{!viewer && <button type="button" className="pc-button" disabled={busy || dirty || stale || !selected.data.aiRunId} onClick={() => void recheck()}>{busy ? 'Checking…' : 'Recheck saved output'}</button>}<p className="pc-muted">Recheck uses the completed Azure receipt. It does not send another AI request.</p></>}
      {!!selected.data.priorInvalidReasons?.length && <details><summary>Earlier validation result</summary>{selected.data.priorInvalidReasons.map((reason, index) => <p className="pc-muted" key={`${reason}-${index}`}>{reason}</p>)}</details>}
    </section>}
  </div></details>;
}
