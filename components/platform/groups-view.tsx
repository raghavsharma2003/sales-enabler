'use client';

import { useEffect, useState } from 'react';
import type { PlatformRecord, PlatformViewProps } from '../../lib/platform/contracts';
import type { GroupWorld, GroupRoom, GroupMemory, GroupCapsule } from '../../lib/platform/groups';
import type { GroupTurn } from '../../lib/platform/group-turns';
import type { AgentConfig } from '../../lib/platform/agents';

function ParticipantChoices({ world, name, selected = [] }: { world: GroupWorld; name: string; selected?: string[] }) {
  return <fieldset className="pc-field"><legend>Authorized participants</legend>{world.members.filter((m) => m.active).map((m) => <label key={m.id} className="pc-row"><input type="checkbox" name={name} value={m.id} defaultChecked={selected.includes(m.id)} /> {m.name} <span className="pc-muted">{m.role}</span></label>)}</fieldset>;
}
const fields = (form: HTMLFormElement) => Object.fromEntries(new FormData(form).entries());

export function GroupsView({ records, act, busy, navigate, focusId }: PlatformViewProps) {
  const worlds = records.filter((r) => r.kind === 'group_world') as PlatformRecord<GroupWorld>[];
  const [worldId, setWorldId] = useState(focusId || '');
  const world = worlds.find((w) => w.id === worldId) ?? worlds[0];
  const rooms = (records.filter((r) => r.kind === 'group_room') as PlatformRecord<GroupRoom>[]).filter((r) => r.data.worldId === world?.id);
  const memories = (records.filter((r) => r.kind === 'group_memory') as PlatformRecord<GroupMemory>[]).filter((m) => m.data.worldId === world?.id);
  const agents = records.filter((r) => r.kind === 'agent_definition' && r.status === 'draft') as PlatformRecord<AgentConfig>[];
  const [roomId, setRoomId] = useState('');
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  const [capsule, setCapsule] = useState<GroupCapsule | null>(null);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [correctId, setCorrectId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [turns, setTurns] = useState<PlatformRecord<GroupTurn>[]>([]);
  const [turnBusy, setTurnBusy] = useState(false);
  // A returned capsule is only shown while its exact local projection remains current.
  const fingerprint = JSON.stringify([world?.revision, room?.id, room?.revision, memories.map((m) => [m.id, m.revision, m.status])]);
  const [inspectedFingerprint, setInspectedFingerprint] = useState('');
  const visibleCapsule = inspectedFingerprint === fingerprint && capsule?.roomId === room?.id ? capsule : null;
  useEffect(() => {
    if (!room) return;
    const selectedRoomId = room.id;
    const controller = new AbortController();
    fetch(`/api/group-turns?roomId=${encodeURIComponent(selectedRoomId)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not load room turns.');
        return payload.turns as PlatformRecord<GroupTurn>[];
      })
      .then(setTurns)
      .catch((error) => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load room turns.'); });
    return () => controller.abort();
  }, [room?.id, fingerprint]);
  const currentTurns = turns.filter((turn) => turn.data.roomId === room?.id && turn.data.snapshotId === visibleCapsule?.snapshotId);
  async function run(action: string, body: Record<string, unknown>) {
    setError('');
    try { const result = await act(action, body); if (result === undefined) return undefined; setCapsule(null); return result; }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save this change.'); return undefined; }
  }
  async function inspect() {
    if (!room) return;
    const inspected = await run('group.context', { roomId: room.id });
    if (inspected) { setCapsule(inspected as GroupCapsule); setInspectedFingerprint(fingerprint); }
  }
  async function askGroupAI(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!room || !visibleCapsule || turnBusy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const selectedAgent = agentId || agents[0]?.id;
    const selectedMember = memberId || room.data.participantIds[0];
    if (!selectedAgent || !selectedMember) return;
    setError(''); setTurnBusy(true);
    try {
      const response = await fetch('/api/group-turns', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: room.id, agentId: selectedAgent, memberId: selectedMember, text: data.get('text'),
          snapshotId: visibleCapsule.snapshotId, requestId: crypto.randomUUID() }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'GroupAI could not finish this turn.');
      setTurns((previous) => [...previous.filter((turn) => turn.id !== payload.turn.id), payload.turn]);
      form.reset();
    } catch (error) { setError(error instanceof Error ? error.message : 'GroupAI could not finish this turn.'); }
    finally { setTurnBusy(false); }
  }
  return <div className="pc-page">
    <header className="pc-pagehead"><div><h1>GroupAI spaces</h1><p className="pc-muted">Keep private conversations private as people move between rooms.</p></div><button className="pc-button primary" onClick={() => setShowNew(!showNew)}>{showNew ? 'Close form' : 'Create space'}</button></header>
    {error && <p role="alert" className="pc-notice">{error}</p>}
    {(showNew || !world) && <section className="pc-panel"><h2>Create a relationship space</h2><p className="pc-muted">Start with one participant. Add people and define a separate audience for each room.</p><form className="pc-form" onSubmit={async (e) => { e.preventDefault(); const result = await run('group.world.create', { ...fields(e.currentTarget), attested: true }); if (result) { setWorldId((result as PlatformRecord).id); setShowNew(false); } }}>
      <label className="pc-field">Space name<input className="pc-input" name="name" placeholder="Customer and advisory team" required maxLength={120} /></label>
      <label className="pc-field">Purpose<textarea className="pc-textarea" name="purpose" placeholder="What are these people working on together?" required maxLength={1000} /></label>
      <div className="pc-grid"><label className="pc-field">First participant<input className="pc-input" name="memberName" required maxLength={120} /></label><label className="pc-field">Their role<input className="pc-input" name="memberRole" placeholder="Customer, parent, advisor…" required maxLength={120} /></label></div>
      <label className="pc-row"><input type="checkbox" required /> I have authority to record this person’s membership.</label><button className="pc-button primary" disabled={busy}>Create space</button>
    </form></section>}
    {world && <>
      <div className="pc-row"><label className="pc-field">Relationship space<select className="pc-select" value={world.id} onChange={(e) => { setWorldId(e.target.value); setRoomId(''); setCapsule(null); }}>{worlds.map((w) => <option key={w.id} value={w.id}>{w.data.name}</option>)}</select></label><p className="pc-muted">{world.data.purpose}</p></div>
      <div className="pc-split"><section className="pc-panel"><h2>People in this space</h2><p className="pc-muted">Membership is attested by your operator. Channel identities are not verified. Membership alone never grants memory access.</p><div className="pc-list">{world.data.members.filter((m) => m.active).map((m) => <div className="pc-row" key={m.id}><div><strong>{m.name}</strong><p className="pc-muted">{m.role} · Operator-attested</p></div><button className="pc-button quiet" disabled={busy} onClick={() => void run('group.world.member', { worldId: world.id, revision: world.revision, memberId: m.id, active: false, attested: true })}>Remove</button></div>)}</div>
        <details><summary>Add participant</summary><form className="pc-form" key={world.id} onSubmit={async (e) => { e.preventDefault(); const form = e.currentTarget; if (await run('group.world.member', { ...fields(form), worldId: world.id, revision: world.revision, attested: true })) form.reset(); }}><label className="pc-field">Name<input className="pc-input" name="name" required maxLength={120} /></label><label className="pc-field">Role<input className="pc-input" name="role" required maxLength={120} /></label><label className="pc-row"><input type="checkbox" required /> I have authority to add this participant.</label><button className="pc-button primary" disabled={busy}>Add participant</button></form></details>
      </section><section className="pc-panel"><h2>Rooms and current audience</h2>
        {rooms.length === 0 ? <p className="pc-empty">Create your first room and select who is present.</p> : <label className="pc-field">Room<select className="pc-select" value={room?.id ?? ''} onChange={(e) => { setRoomId(e.target.value); setCapsule(null); }}>{rooms.map((r) => <option value={r.id} key={r.id}>{r.data.name}</option>)}</select></label>}
        {room && <form className="pc-form" key={`${room.id}:${room.revision}:${world.revision}`} onSubmit={(e) => { e.preventDefault(); const form = new FormData(e.currentTarget); void run('group.room.audience', { roomId: room.id, revision: room.revision, participantIds: form.getAll('participantIds'), mode: form.get('mode') }); }}><ParticipantChoices world={world.data} name="participantIds" selected={room.data.participantIds} /><label className="pc-field">Agent participation<select className="pc-select" name="mode" defaultValue={room.data.mode}><option value="reply">May reply with permitted context</option><option value="silent">Remain silent</option></select></label><p className="pc-muted">Changing the audience invalidates the previous context snapshot.</p><button className="pc-button primary" disabled={busy}>Save audience</button></form>}
        <details><summary>Create room</summary><form className="pc-form" key={world.id} onSubmit={async (e) => { e.preventDefault(); const form = new FormData(e.currentTarget); const result = await run('group.room.create', { worldId: world.id, name: form.get('name'), participantIds: form.getAll('participantIds') }); if (result) setRoomId((result as PlatformRecord).id); }}><label className="pc-field">Room name<input className="pc-input" name="name" required maxLength={120} placeholder="Private consultation" /></label><ParticipantChoices world={world.data} name="participantIds" /><button className="pc-button primary" disabled={busy}>Create room</button></form></details>
      </section></div>
      <section className="pc-panel"><div className="pc-pagehead"><div><h2>What can this agent use?</h2><p className="pc-muted">A fresh server-filtered view for {room?.data.name ?? 'the selected room'}. Only approved evidence authorized for everyone present is included.</p></div><button className="pc-button primary" disabled={busy || !room} onClick={() => void inspect()}>Inspect permitted context</button></div>
        {!visibleCapsule ? <p className="pc-empty">Inspect the current audience to generate a fresh context capsule.</p> : <><p><span className="pc-badge">{visibleCapsule.mode === 'silent' ? 'Agent remains silent' : 'Reply permitted'}</span> Audience epoch {visibleCapsule.audienceEpoch}</p><p className="pc-muted">Present: {visibleCapsule.participants.map((p) => p.name).join(', ')}</p>{visibleCapsule.evidence.length ? <div className="pc-list">{visibleCapsule.evidence.map((item) => <article key={item.id}><p>{item.content}</p><p className="pc-muted">{item.epistemic} · {item.source} · Revision {item.revision}</p></article>)}</div> : <p className="pc-empty">No evidence may be used for this audience and participation mode.</p>}<p className="pc-muted">The room turn below uses this exact context snapshot.</p></>}
      </section>
      {room && <section className="pc-panel"><h2>Room conversation with GroupAI</h2>
        <p className="pc-muted">Internal operator simulation. You choose a participant to speak as; that person’s identity is operator-attested, not verified by a messaging channel. Replies stay in this workspace and are shown only for the current audience and evidence snapshot.</p>
        {currentTurns.length ? <div className="pc-list">{currentTurns.map((turn) => <article key={turn.id} className="pc-panel"><p><strong>{turn.data.actorName}</strong> <span className="pc-muted">· Operator simulation</span></p><p>{turn.data.inputText}</p>{turn.status === 'replied' ? <><p><strong>{turn.data.agentName} · AI</strong></p><p>{turn.data.replyText}</p><p className="pc-muted">Permitted evidence offered: {turn.data.evidenceIds.length ? turn.data.evidenceIds.join(', ') : 'none'} · Audience epoch {turn.data.audienceEpoch}</p></> : <p className="pc-muted">GroupAI stayed silent: {turn.data.reason}</p>}</article>)}</div> : <p className="pc-empty">No turns are visible for this exact room snapshot.</p>}
        <form className="pc-form" onSubmit={(event) => void askGroupAI(event)}>
          <div className="pc-grid"><label className="pc-field">Representative<select className="pc-select" value={agentId || agents[0]?.id || ''} onChange={(event) => setAgentId(event.target.value)} disabled={!agents.length}>{agents.length ? agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.data.name} · draft</option>) : <option value="">Create an agent in Build first</option>}</select></label>
          <label className="pc-field">Simulated speaker<select className="pc-select" value={memberId && room.data.participantIds.includes(memberId) ? memberId : room.data.participantIds[0] || ''} onChange={(event) => setMemberId(event.target.value)}>{room.data.participantIds.map((id) => { const member = world.data.members.find((item) => item.id === id); return <option key={id} value={id}>{member?.name ?? 'Removed participant'}</option>; })}</select></label></div>
          <label className="pc-field">Message<textarea className="pc-textarea" name="text" required maxLength={3000} placeholder="Ask this agent a question for the selected participant…" /></label>
          <p className="pc-muted">The agent uses its name, role, language and speaking style. Its general prompt and knowledge sources are excluded until they have a room-specific audience grant.</p>
          <button className="pc-button primary" disabled={!visibleCapsule || !agents.length || turnBusy || busy}>{turnBusy ? 'GroupAI is responding…' : visibleCapsule?.mode === 'silent' ? 'Record silent turn' : 'Ask GroupAI'}</button>
        </form>
      </section>}
      <section className="pc-panel"><h2>Evidence review</h2><p className="pc-muted">Company operators can review the space’s records here. This review list is separate from the agent’s permitted context above.</p>
        <details><summary>Propose evidence</summary><form className="pc-form" key={world.id} onSubmit={async (e) => { e.preventDefault(); const form = e.currentTarget; const data = new FormData(form); if (await run('group.memory.create', { ...Object.fromEntries(data.entries()), worldId: world.id, allowedParticipantIds: data.getAll('allowedParticipantIds'), attested: true })) form.reset(); }}>
          <label className="pc-field">Evidence<textarea className="pc-textarea" name="content" required maxLength={2000} /></label><label className="pc-field">Source or exact excerpt<textarea className="pc-textarea" name="source" required maxLength={1000} /></label><div className="pc-grid"><label className="pc-field">Provenance<select className="pc-select" name="epistemic"><option value="reported">Reported by a person</option><option value="observed">Directly observed</option><option value="inferred">Inferred — uncertain</option></select></label><label className="pc-field">Visibility<select className="pc-select" name="visibility"><option value="private">Private — one participant</option><option value="shared">Shared — selected participants</option></select></label></div><ParticipantChoices world={world.data} name="allowedParticipantIds" /><label className="pc-field">Basis for sharing with this audience<input className="pc-input" name="authoritySource" required maxLength={500} placeholder="Customer authorized sharing in the consultation" /></label><label className="pc-row"><input type="checkbox" required /> I have authority to record this evidence and audience.</label><button className="pc-button primary" disabled={busy}>Propose for review</button>
        </form></details>
        {!memories.length && <p className="pc-empty">No relationship evidence yet. Add a sourced statement and review its audience.</p>}
        <div className="pc-list">{memories.map((memory) => <article key={memory.id} className="pc-panel"><div className="pc-row"><span className="pc-badge">{memory.status}</span><span className="pc-muted">{memory.data.visibility} · {memory.data.epistemic} · Revision {memory.revision}</span></div><p>{memory.data.content}</p><p className="pc-muted">Source: {memory.data.source}</p><p className="pc-muted">Authorized: {memory.data.allowedParticipantIds.map((id) => world.data.members.find((m) => m.id === id)?.name ?? 'Removed participant').join(', ')}</p><p className="pc-muted">Authority: {memory.data.authoritySource}</p>
          {memory.status !== 'revoked' && <div className="pc-row">{memory.status === 'proposed' && <button className="pc-button primary" disabled={busy} onClick={() => void run('group.memory.approve', { memoryId: memory.id, revision: memory.revision, attested: true })}>Approve stated audience</button>}<button className="pc-button quiet" disabled={busy} onClick={() => setCorrectId(correctId === memory.id ? '' : memory.id)}>Correct</button><button className="pc-button danger" disabled={busy} onClick={() => void run('group.memory.revoke', { memoryId: memory.id, revision: memory.revision })}>Revoke agent use</button></div>}
          {correctId === memory.id && memory.status !== 'revoked' && <form className="pc-form" onSubmit={async (e) => { e.preventDefault(); if (await run('group.memory.correct', { ...fields(e.currentTarget), memoryId: memory.id, revision: memory.revision })) setCorrectId(''); }}><label className="pc-field">Corrected evidence<textarea className="pc-textarea" name="content" defaultValue={memory.data.content} required maxLength={2000} /></label><label className="pc-field">Correction source<input className="pc-input" name="source" required maxLength={1000} /></label><p className="pc-muted">The old statement stops being used immediately. The correction requires approval.</p><button className="pc-button primary" disabled={busy}>Save correction for review</button></form>}
        </article>)}</div>
      </section>
    </>}
  </div>;
}
