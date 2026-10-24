// The agent builder. Everything is edited in a local draft with an explicit "unsaved" marker and a Save button; no menu,
// dropdown or card click ever writes to the server (state integrity, decision.2026-10-21.wt-synthesis-state-integrity).
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link2, Lock, Plus, Trash2 } from 'lucide-react';
import { useApp, useData } from '../store.tsx';
import { agentGet, diffOps, memberList } from '../data.ts';
import { Link, useLeaveGuard, useQuery } from '../router.tsx';
import { lintWhere } from '../labels.ts';
import { Async, Btn, Card, CardHead, Chip, Field, PageHead, Segmented, SelectField, Skeleton, Tabs, TextArea, TextField, Toggle } from '../ui.tsx';
import { StackPicker, BETA_REASON, type StackChange } from '../stack-picker.tsx';
import { CATEGORY_INFO, HANDOFF_WHEN, JOBS, JOB_INFO, LANGUAGES, LANG_LABEL, PURPOSES, PURPOSE_HINT, PURPOSE_LABEL, REGISTER_INFO, SECTOR_LABEL, SECTOR_PACKS, TOOL_INFO, jobLabel, langShort } from '../catalog.ts';
import { date } from '../format.ts';
import { useVoiceStack } from '../use-voice-stack.tsx';
import type { AgentConfigDraft, AgentDoc } from '../types.ts';
// The Company information tab loads when opened, so the agent page's chunk stays within its budget.
const AgentCompany = lazy(() => import('./agent-company.tsx'));

type TabId = 'basics' | 'persona' | 'job' | 'company' | 'rules' | 'tools' | 'voice' | 'versions';
const TABS: { id: TabId; label: string }[] = [{ id: 'basics', label: 'Basics' }, { id: 'persona', label: 'Persona' }, { id: 'job', label: 'Job and facts' }, { id: 'company', label: 'Company information' }, { id: 'rules', label: 'Objections, hand-off' }, { id: 'tools', label: 'Tools' }, { id: 'voice', label: 'Voice stack' }, { id: 'versions', label: 'Versions' }];

export default function AgentBuilder({ id }: { id: string }) {
  const q = useData<AgentDoc>(['agent', id], () => agentGet(id));
  return <div className="page"><Async q={q} what="This agent" tool="agent.get" rows={6}>{doc => <Builder key={doc.id + ':' + doc.draftHash} doc={doc} reload={q.reload} />}</Async></div>;
}

function Builder({ doc, reload }: { doc: AgentDoc; reload: () => void }) {
  const { act, setAgentCtx, setDockTab, setView, toast } = useApp();
  const [qs, setQs] = useQuery();
  const tab = (TABS.find(t => t.id === qs.get('tab'))?.id ?? 'basics') as TabId;
  // ?test=1 opens the test panel beside the agent: the guided start sends people here to hear her.
  useEffect(() => { if (qs.get('test') === '1') { setDockTab('test'); setView('talk'); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [cfg, setCfg] = useState<AgentConfigDraft>(() => structuredClone(doc.config));
  const savedJson = useRef(JSON.stringify(doc.config));
  const dirty = useMemo(() => JSON.stringify(cfg) !== savedJson.current, [cfg]);
  const draftStack = useVoiceStack(cfg.voice).stack;
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null);
  const set = (f: (c: AgentConfigDraft) => void) => setCfg(c => { const n = structuredClone(c); f(n); return n; });

  useEffect(() => { setAgentCtx({ id: doc.id, name: cfg.persona.name, dirty, stackId: cfg.voice.stackId, components: cfg.voice.components, version: doc.latestVersion ?? 0, saved: !dirty }); }, [cfg, dirty, doc, setAgentCtx]);
  useEffect(() => () => setAgentCtx(null), [setAgentCtx]);
  useLeaveGuard(dirty, `Your changes to ${cfg.persona.name || 'this agent'} are not saved. If you leave now, they are lost.`);
  useEffect(() => {
    if (!dirty) return;
    const f = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    addEventListener('beforeunload', f); return () => removeEventListener('beforeunload', f);
  }, [dirty]);

  const save = async () => {
    setBusy('save');
    const saved: AgentDoc['config'] = JSON.parse(savedJson.current);
    let ok = true;
    const ops = diffOps(saved, cfg);
    if (ok && ops.length) { const r = await act<{ changes: unknown[] }>('brief.edit', { agentId: doc.id, patch: ops }, { quiet: true }); ok = r.ok; }
    setBusy(null);
    if (ok) { toast('Draft saved. Nothing has reached anyone.', 'ok'); reload(); }
  };
  const publish = async () => {
    setBusy('publish');
    const r = await act('version.publish', { agentId: doc.id, draftHash: doc.draftHash }, { describe: 'Published.' });
    setBusy(null);
    if (r.ok) reload();
  };
  // Stack and voice choices are saved to the draft by the server the moment they are made; this tab has no unsaved state of its own.
  const onVoiceChanged = (c: StackChange) => {
    const apply = (x: AgentConfigDraft) => { x.voice = { ...x.voice, stackId: c.stackId, components: c.components, voiceId: c.voiceId ?? undefined }; if (!x.voice.components) delete x.voice.components; if (x.voice.voiceId === undefined) delete x.voice.voiceId; };
    if (dirty) { set(apply); const base = JSON.parse(savedJson.current); apply(base); savedJson.current = JSON.stringify(base); toast('Saved to the draft. Your other edits are still unsaved.', 'ok'); }
    else { toast('Saved to the draft.', 'ok'); reload(); }
  };
  // Linking offerings is saved by the server at once, like the stack; unsaved edits elsewhere stay unsaved.
  const onLinked = (k: NonNullable<AgentConfigDraft['knowledge']>) => {
    const apply = (x: AgentConfigDraft) => { x.knowledge = k; };
    if (dirty) { set(apply); const base = JSON.parse(savedJson.current); apply(base); savedJson.current = JSON.stringify(base); toast('Saved to the draft. Your other edits are still unsaved.', 'ok'); }
    else { toast('Saved to the draft.', 'ok'); reload(); }
  };
  const noStack = !cfg.voice.stackId;
  const pill = dirty ? <span className="pill pill-draft" role="status">Draft · unsaved</span> : doc.latestVersion ? <span className="pill pill-live">Draft saved · latest published v{doc.latestVersion}</span> : <span className="pill">Draft saved · not published</span>;

  return (
    <>
      <PageHead crumb={<><Link to="/agents">Agents</Link><span aria-hidden>/</span><span>{cfg.persona.name}</span></>}
        title={<>{doc.name}</>} pill={pill}
        sub={<>{jobLabel(cfg.job)} · {cfg.persona.name} · {[...new Set(cfg.languages.allowed.map(langShort))].join(', ')}</>}
        actions={<>
          <Btn onClick={() => { setDockTab('test'); setView('talk'); }}>Test her</Btn>
          {dirty ? <Btn kind="primary" busy={busy === 'save'} onClick={save}>Save draft</Btn> : <Btn disabled fix={null} reason="No unsaved changes.">Save draft</Btn>}
          {dirty ? <Btn disabled fix={null} reason="Save your changes first, so what goes live is what you tested.">Publish</Btn>
            : noStack ? <Btn disabled reason="Choose a voice stack first." fix={{ label: 'Choose one', to: `/agents/${doc.id}?tab=voice` }}>Publish</Btn>
            : !doc.compiles ? <Btn disabled fix={null} reason="The brief does not compile yet. See the checks below.">Publish</Btn>
            : <Btn kind="primary" busy={busy === 'publish'} onClick={publish}>Publish…</Btn>}
        </>} />
      {draftStack?.status === 'beta' && <div className="state state-missing" role="note" style={{ marginBottom: 16, textAlign: 'left', justifyItems: 'start' }}><strong>Test calls only</strong><span>This agent's stack is in beta. You can publish it and test it, but a campaign will refuse it. {BETA_REASON}</span> <Link to={`/agents/${doc.id}?tab=voice`}>Choose another stack</Link></div>}
      {doc.lint.length > 0 && <div className="state state-failed" role="alert" style={{ marginBottom: 16, textAlign: 'left', justifyItems: 'start' }}><strong>Checks on the draft</strong><ul style={{ margin: 0, paddingLeft: 20 }}>{[...new Map(doc.lint.map(l => [`${l.path ?? ''}|${l.message}`, l])).values()].map((l, i) => { const w = lintWhere(l.path); const msg = l.message.charAt(0).toUpperCase() + l.message.slice(1); return <li key={i}>{w ? <><Link to={`?tab=${w.tabId}`}>{w.tab}, {w.field}</Link>: {msg}</> : msg}</li>; })}</ul></div>}
      <Tabs label="Builder sections" value={tab} onChange={t => setQs({ tab: t === 'basics' ? null : t })} items={TABS} />
      {tab === 'basics' && <Basics cfg={cfg} set={set} />}
      {tab === 'persona' && <Persona cfg={cfg} set={set} />}
      {tab === 'job' && <JobFacts cfg={cfg} set={set} />}
      {tab === 'company' && <Suspense fallback={<Skeleton rows={4} />}><AgentCompany agentId={doc.id} linked={cfg.knowledge} onLinked={onLinked} /></Suspense>}
      {tab === 'rules' && <Rules cfg={cfg} set={set} />}
      {tab === 'tools' && <Tools cfg={cfg} set={set} />}
      {tab === 'voice' && <Card><StackPicker agentId={doc.id} stackId={cfg.voice.stackId} components={cfg.voice.components} voiceId={cfg.voice.voiceId ?? null} onChanged={onVoiceChanged} />
        <hr className="rule" /><div className="formgrid"><Toggle checked={cfg.recording.enabled} onChange={v => set(c => { c.recording.enabled = v; if (!v) c.recording.announce = false; })} label="Record calls" hint="Recordings stay in India. Retention is set in Settings, Privacy." />
            <Toggle checked={cfg.recording.announce} onChange={v => set(c => { c.recording.announce = v; })} label="Say that the call is recorded" hint={cfg.recording.enabled ? undefined : 'Turn recording on first.'} /></div></Card>}
      {tab === 'versions' && <Versions doc={doc} dirty={dirty} reload={reload} />}
    </>
  );
}

/** "Hinglish, English or Tamil": the languages she may switch to, as a person reads them. */
const listOr = (xs: string[]) => xs.length <= 1 ? (xs[0] ?? 'another language she may use') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`;

// ---------- editors ----------
function ListEditor<T>({ items, onChange, blank, render, addLabel, empty }: { items: T[]; onChange: (f: (list: T[]) => void) => void; blank: () => T; render: (it: T, patch: (f: (x: T) => void) => void, i: number) => ReactNode; addLabel: string; empty?: string }) {
  return (
    <div className="stack-s">
      {items.length === 0 && empty && <p className="small muted">{empty}</p>}
      {items.map((it, i) => (
        <div className="editrow" key={i}>
          <div className="grow">{render(it, f => onChange(l => f(l[i])), i)}</div>
          <button type="button" className="iconbtn" aria-label={`Remove item ${i + 1}`} onClick={() => onChange(l => { l.splice(i, 1); })}><Trash2 size={18} aria-hidden /></button>
        </div>
      ))}
      <div><Btn size="sm" icon={<Plus size={14} aria-hidden />} onClick={() => onChange(l => { l.push(blank()); })}>{addLabel}</Btn></div>
    </div>
  );
}
type S = (f: (c: AgentConfigDraft) => void) => void;

function Basics({ cfg, set }: { cfg: AgentConfigDraft; set: S }) {
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  return (
    <div className="stack">
      <Card><CardHead title="Who she is and who you are" />
        <div className="formgrid">
          <TextField label="Her name" value={cfg.persona.name} onChange={e => set(c => { c.persona.name = e.target.value; })} hint="The name callers hear." />
          <TextField label="Your business name" value={cfg.brand.name} onChange={e => set(c => { c.brand.name = e.target.value; })} />
          <TextField label="How she says your name aloud" value={cfg.brand.spokenName} onChange={e => set(c => { c.brand.spokenName = e.target.value; })} hint="Spell it the way it should sound, in Hindi script if that is clearer." lang="hi" />
          <Field label="Voice">{p => <Segmented label="Voice gender" value={cfg.persona.gender} onChange={v => set(c => { c.persona.gender = v; })} options={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'neutral', label: 'Neutral' }]} />}</Field>
        </div></Card>
      <Card><CardHead title="What the calls are for" sub="A job is a shape of conversation. Pick the nearest one; the rest is in the next tabs." />
        <div className="jobgrid" role="radiogroup" aria-label="Job">
          {JOBS.map(j => <button key={j} type="button" role="radio" aria-checked={cfg.job === j} className={`jobcard${cfg.job === j ? ' on' : ''}`} onClick={() => set(c => { c.job = j; })}><strong>{JOB_INFO[j].label}</strong><span>{JOB_INFO[j].who}</span></button>)}
        </div>
        {cfg.job === 'custom' && <div style={{ marginTop: 16 }}><TextArea label="Describe the job in your own words" value={cfg.jobDescription ?? ''} onChange={e => set(c => { c.jobDescription = e.target.value; })} hint="Plain words: who you call and what should be true at the end." /></div>}
      </Card>
      <Card><CardHead title="Call category" sub="Set once. It decides the number series and what she may say." />
        <div className="jobgrid" role="radiogroup" aria-label="Call category">
          {Object.entries(CATEGORY_INFO).map(([k, v]) => <button key={k} type="button" role="radio" aria-checked={cfg.category === k} className={`jobcard${cfg.category === k ? ' on' : ''}`} onClick={() => set(c => { c.category = k as AgentConfigDraft['category']; })}><strong>{v.label}</strong><span>{v.blurb}</span></button>)}
        </div>
        {cfg.category === 'promotional' && <p className="hint hint-bad" style={{ marginTop: 12 }}>Promotional calls need a recorded consent for each person. People without one are skipped, and the campaign form shows how many.</p>}
      </Card>
      <Card><CardHead title="Languages" />
        <div className="formgrid">
          <SelectField label="She starts in" value={cfg.languages.primary} onChange={e => set(c => { c.languages.primary = e.target.value; if (!c.languages.allowed.includes(e.target.value)) c.languages.allowed.push(e.target.value); })}>{LANGUAGES.map(l => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}</SelectField>
          <Toggle checked={cfg.languages.mirrorCaller} onChange={v => set(c => { c.languages.mirrorCaller = v; })} label="Follow the caller's language" hint={`If they switch to ${listOr([...new Set(cfg.languages.allowed.map(langShort))])}, so does she.`} />
        </div>
        <fieldset className="chipset"><legend>Languages she may use</legend>{LANGUAGES.map(l => <label key={l} className={`choice${cfg.languages.allowed.includes(l) ? ' on' : ''}`}><input type="checkbox" checked={cfg.languages.allowed.includes(l)} disabled={l === cfg.languages.primary} onChange={() => set(c => { c.languages.allowed = toggle(c.languages.allowed, l); })} />{LANG_LABEL[l]}</label>)}</fieldset>
      </Card>
      <Card><CardHead title="Sector rules" sub="Optional. A sector pack adds that sector's rules on top of the base ones. Leave it as a generic business if none fits." />
        <fieldset className="chipset"><legend className="sr">Sector packs</legend>{SECTOR_PACKS.map(p => <label key={p} className={`choice${cfg.sectorPacks.includes(p) ? ' on' : ''}`}><input type="checkbox" checked={cfg.sectorPacks.includes(p)} disabled={p === 'base'} onChange={() => set(c => { c.sectorPacks = toggle(c.sectorPacks, p); })} />{SECTOR_LABEL[p]}</label>)}</fieldset>
      </Card>
    </div>
  );
}

function Wave({ energy }: { energy: number }) {
  const a = 3 + energy * 3.2, pts = Array.from({ length: 41 }, (_, i) => `${i * 4},${(20 + Math.sin(i / 2.2) * a).toFixed(1)}`).join(' ');
  return <svg viewBox="0 0 160 40" width="160" height="40" role="img" aria-label={`Energy ${energy} of 5`} className="shape"><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
}
function Dots({ n }: { n: number }) {
  return <svg viewBox="0 0 60 20" width="60" height="20" role="img" aria-label={['No humour', 'Light humour', 'Playful'][n]} className="shape">{[0, 1, 2].map(i => <circle key={i} cx={10 + i * 20} cy="10" r={i < n ? 6 : 3} fill={i < n ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" />)}</svg>;
}
function Persona({ cfg, set }: { cfg: AgentConfigDraft; set: S }) {
  const p = cfg.persona;
  return (
    <div className="stack">
      <Card><CardHead title="Register" sub="How she carries herself. A shape, never a script." />
        <div className="jobgrid" role="radiogroup" aria-label="Register">{Object.entries(REGISTER_INFO).map(([k, v]) => <button key={k} type="button" role="radio" aria-checked={p.register === k} className={`jobcard${p.register === k ? ' on' : ''}`} onClick={() => set(c => { c.persona.register = k as typeof p.register; })}><strong>{v.label}</strong><span>{v.blurb}</span></button>)}</div></Card>
      <Card><CardHead title="Feel" />
        <div className="formgrid">
          <Field label="Energy" hint={`${['Very calm', 'Calm', 'Even', 'Bright', 'Very bright'][p.energy - 1]}`}>{pr => <><Wave energy={p.energy} /><input {...pr} type="range" min="1" max="5" step="1" value={p.energy} onChange={e => set(c => { c.persona.energy = Number(e.target.value) as 1; })} /></>}</Field>
          <Field label="Humour" hint="Never on dues or when someone sounds upset.">{() => <div className="row"><Dots n={p.humour} /><Segmented label="Humour" value={p.humour} onChange={v => set(c => { c.persona.humour = v as 0; })} options={[{ value: 0, label: 'Off' }, { value: 1, label: 'Light' }, { value: 2, label: 'Playful' }]} /></div>}</Field>
          <Field label="How she addresses people">{() => <Segmented label="Address" value={p.honorific} onChange={v => set(c => { c.persona.honorific = v; })} options={[{ value: 'aap', label: 'Formal', hint: 'Respectful form of address' }, { value: 'tum', label: 'Informal', hint: 'Casual form of address' }, { value: 'mirror', label: 'Match the caller' }]} />}</Field>
        </div></Card>
      <Card><CardHead title="Notes for her" sub="Short shapes, not lines to recite. For example: “explain like to someone driving”." />
        <ListEditor items={p.notes} onChange={f => set(c => f(c.persona.notes))} blank={() => ''} addLabel="Add a note" empty="No notes yet."
          render={(it, _patch, i) => <TextField label={`Note ${i + 1}`} value={it} onChange={e => set(c => { c.persona.notes[i] = e.target.value; })} />} /></Card>
      <Card className="locked-card"><div className="row"><Lock size={18} aria-hidden /><div><h3>AI disclosure is locked on</h3><p className="small muted">Every call says, once and lightly after something useful, that she is an AI assistant. It cannot be removed, and every call page shows when it was spoken.</p></div></div></Card>
    </div>
  );
}

function JobFacts({ cfg, set }: { cfg: AgentConfigDraft; set: S }) {
  return (
    <div className="stack">
      <Card><CardHead title="Open with something useful" sub="The first thing she offers, before she asks for anything. A shape, not a script." />
        <TextArea label="Something useful to say first" value={cfg.opening.usefulFirst} onChange={e => set(c => { c.opening.usefulFirst = e.target.value; })} rows={2} />
        <p className="hint"><Lock size={12} aria-hidden style={{ verticalAlign: '-1px' }} /> Disclosure: {cfg.opening.disclosureClause}.</p></Card>
      <Card><CardHead title="Goals" sub="What counts as done. She records one outcome per goal." />
        <ListEditor items={cfg.goals} onChange={f => set(c => f(c.goals))} blank={() => ({ id: 'goal_' + Date.now().toString(36), description: '', outcome: '', required: true })} addLabel="Add a goal"
          render={(g, _p, i) => <div className="formgrid"><TextArea className="span2 field-grow" rows={1} label="What counts as done" value={g.description} onChange={e => set(c => { c.goals[i].description = e.target.value; })} /><TextField label="Outcome name" value={g.outcome} onChange={e => set(c => { c.goals[i].outcome = e.target.value.replace(/\s+/g, '_').toLowerCase(); })} hint="Shows in Calls and Insights." /><Toggle checked={g.required} onChange={v => set(c => { c.goals[i].required = v; })} label="Required" hint="She keeps going until this is done or the caller declines." /></div>} /></Card>
      <Card><CardHead title="Facts she may state" sub="Each fact says what it is for. An offer never leaks into a service call." />
        <ListEditor items={cfg.facts} onChange={f => set(c => f(c.facts))} blank={() => ({ key: '', value: '', purpose: 'service' as const, source: 'manual' })} addLabel="Add a fact"
          render={(f, _p, i) => <div className="formgrid"><TextField label="Name" value={f.key} onChange={e => set(c => { c.facts[i].key = e.target.value; })} placeholder="clinic_address" /><SelectField label="Purpose" value={f.purpose} onChange={e => set(c => { c.facts[i].purpose = e.target.value as typeof f.purpose; })} hint={PURPOSE_HINT[f.purpose]}>{PURPOSES.map(x => <option key={x} value={x}>{PURPOSE_LABEL[x]}</option>)}</SelectField>
            <TextArea className="span2 field-grow" rows={1} label="Value" value={f.value} onChange={e => set(c => { c.facts[i].value = e.target.value; })} disabled={f.perContact} hint={f.perContact ? 'Filled from each contact at call time.' : undefined} lang="hi" /><p className="small muted span2"><Link2 size={12} aria-hidden style={{ verticalAlign: '-1px' }} /> Source: {f.source}</p></div>} /></Card>
      <Card><CardHead title="Never say" sub="Names and claims she must not use. Safety rules exist whether or not you add any." />
        <ListEditor items={cfg.neverSay} onChange={f => set(c => f(c.neverSay))} blank={() => ''} addLabel="Add one" empty="Nothing added."
          render={(it, _p, i) => <TextField label={`Never say ${i + 1}`} value={it} onChange={e => set(c => { c.neverSay[i] = e.target.value; })} />} /></Card>
    </div>
  );
}

function Rules({ cfg, set }: { cfg: AgentConfigDraft; set: S }) {
  return (
    <div className="stack">
      <Card><CardHead title="When people push back" sub="A trigger and an approach, as a note. She finds her own words." />
        <ListEditor items={cfg.objections} onChange={f => set(c => f(c.objections))} blank={() => ({ trigger: '', approach: '' })} addLabel="Add an objection"
          render={(o, _p, i) => <div className="formgrid"><TextArea label="When they say or feel" rows={2} value={o.trigger} onChange={e => set(c => { c.objections[i].trigger = e.target.value; })} /><TextArea label="Her approach" rows={3} value={o.approach} onChange={e => set(c => { c.objections[i].approach = e.target.value; })} /></div>} /></Card>
      <Card><CardHead title="Hand-off to a person" sub="She hands over warmly and says so. Crisis lines (Tele-MANAS 14416, 112) are always available to her." />
        <fieldset className="chipset"><legend>Hand over when the caller</legend>{Object.entries(HANDOFF_WHEN).map(([k, v]) => <label key={k} className={`choice${cfg.handOff.when.includes(k) ? ' on' : ''}`}><input type="checkbox" checked={cfg.handOff.when.includes(k)} disabled={k === 'crisis'} onChange={() => set(c => { c.handOff.when = c.handOff.when.includes(k) ? c.handOff.when.filter(x => x !== k) : [...c.handOff.when, k]; })} />{v}</label>)}</fieldset>
        <div className="formgrid" style={{ marginTop: 16 }}>
          <SelectField label="Hand over to" value={cfg.handOff.target.kind} onChange={e => set(c => { c.handOff.target.kind = e.target.value as 'phone'; })}><option value="queue">A support queue</option><option value="phone">A phone number</option><option value="callback">A callback task</option></SelectField>
          <TextField label={cfg.handOff.target.kind === 'phone' ? 'Phone number' : 'Queue or task name'} value={cfg.handOff.target.value ?? ''} onChange={e => set(c => { c.handOff.target.value = e.target.value; })} inputMode={cfg.handOff.target.kind === 'phone' ? 'tel' : 'text'} hint={cfg.handOff.target.kind === 'phone' ? 'Must be a number your workspace owns.' : undefined} />
          <Toggle checked={cfg.handOff.warmSummary} onChange={v => set(c => { c.handOff.warmSummary = v; })} label="Give a one-line summary first" hint="She tells the person who is taking over what the call is about." />
        </div></Card>
      <Card><CardHead title="Call limits" sub="Bounded by default so a stuck call cannot run up cost." />
        <div className="formgrid">
          <TextField label="Longest call (seconds)" type="number" inputMode="numeric" min={30} max={1800} value={cfg.limits.maxDurationS} onChange={e => set(c => { c.limits.maxDurationS = Number(e.target.value); })} />
          <TextField label="Longest silence (seconds)" type="number" inputMode="numeric" min={3} max={30} value={cfg.limits.maxSilenceS} onChange={e => set(c => { c.limits.maxSilenceS = Number(e.target.value); })} />
        </div></Card>
    </div>
  );
}

// Ending the call and handing over are not switches: the runtime always lets her end the call after a real goodbye, and hands
// over on the situations chosen on the hand-off tab. A switch here that read "off" while she still did both would be untrue.
function Tools({ cfg, set }: { cfg: AgentConfigDraft; set: S }) {
  const has = (n: string) => cfg.tools.some(t => t.name === n);
  const n = cfg.handOff.when.length, to = cfg.handOff.target;
  const dest = to.kind === 'phone' ? (to.value ? `the number ${to.value}` : 'a phone number not set yet') : to.kind === 'callback' ? 'a callback task' : to.value ? `the ${to.value} queue` : 'a support queue';
  return (
    <Card><CardHead title="What she can do during a call" sub="Each ability has a risk class. Anything that reaches people is checked at one gate, in code, for every call." />
      <ul className="toollist" aria-label="Always part of every call">
        <li><div className="stack-s"><strong>{TOOL_INFO.end_call.label}</strong><span className="small muted">She says a real goodbye, then hangs up. Never mid-question, and never while someone sounds in crisis. The longest call and longest silence are on the hand-off tab.</span></div>
          <Chip tone="leaf">Always on</Chip></li>
        <li><div className="stack-s"><strong>{TOOL_INFO.transfer.label}</strong><span className="small muted">{n ? `In ${n} ${n === 1 ? 'situation' : 'situations'} she hands over to ${dest}${cfg.handOff.warmSummary ? ', with a one-line summary' : ''}.` : 'She does not hand over in any situation yet.'} <Link to="?tab=rules">Change when she hands over</Link></span></div>
          <Chip tone={n ? 'leaf' : 'neutral'}>{n ? 'On' : 'Off'}</Chip></li>
      </ul>
      <ul className="toollist" aria-label="Abilities you choose">{Object.entries(TOOL_INFO).filter(([k]) => k !== 'end_call' && k !== 'transfer').map(([k, v]) => (
        v.available === false
          ? <li key={k}><div className="stack-s"><strong>{v.label}</strong><span className="small muted">{v.blurb} Calls cannot do this yet, so it cannot be switched on.</span></div>
              <Chip tone="neutral">Not available yet</Chip></li>
          : <li key={k}><Toggle checked={has(k)} onChange={on => set(c => { c.tools = on ? [...c.tools, { name: k, risk: v.risk }] : c.tools.filter(t => t.name !== k); })} label={v.label} hint={v.blurb} />
              <Chip tone={v.risk === 'external' ? 'terra' : 'neutral'}>{v.risk === 'external' ? 'Reaches people' : v.risk === 'read' ? 'Reads only' : 'Writes a note'}</Chip></li>))}</ul></Card>
  );
}

// Every published version can be gone back to: version.restore publishes a new version equal to the chosen one and sends
// the agent's calls there, after the same approval as a publish (its card says what changes back).
function Versions({ doc, dirty, reload }: { doc: AgentDoc; dirty: boolean; reload: () => void }) {
  const { act, can } = useApp();
  const members = useData('members', memberList);
  const who = (v: AgentDoc['versions'][number]) => (v.authorId && members.data?.find(m => m.id === v.authorId)?.name) || v.by;
  const [busy, setBusy] = useState<string | null>(null);
  const restore = async (v: AgentDoc['versions'][number]) => {
    setBusy(v.id);
    const r = await act('version.restore', { agentId: doc.id, versionId: v.id }, { describe: `Back to version ${v.number}, published as a new version.` });
    setBusy(null); if (r.ok) reload();
  };
  const canRestore = can(['owner', 'builder']);
  return (
    <Card><CardHead title="How she changed" sub="Each published version is fixed. Campaigns pick a published version, never a draft. Going back to an earlier one publishes it again as a new version, so the history stays whole." />
      {dirty && <p className="hint hint-bad">You have changes that are not saved, so they are not in this list yet.</p>}
      {doc.versions.length === 0 ? <p className="muted">Nothing is published yet. Save the draft, choose a voice stack, then publish.</p> :
        <ol className="versions">{doc.versions.map(v => (
          <li key={v.id}><span className={`pill ${v.id === doc.latestVersionId ? 'pill-live' : ''}`} style={{ marginLeft: 0 }}>v{v.number}{v.id === doc.latestVersionId ? ' · Live' : v.candidate ? ' · Test candidate' : ''}</span>
            <span>{v.candidate ? `${v.note ?? 'A change under test'}. Runs only for the people a test assigns to it; never live.` : v.note ?? 'Published'}</span><span className="small muted">{who(v)} · {date(v.createdAt, true)}</span>
            {v.id !== doc.latestVersionId && !v.candidate && (canRestore
              ? <Btn size="sm" busy={busy === v.id} onClick={() => void restore(v)}>Go back to v{v.number}…</Btn>
              : <Btn size="sm" disabled fix={null} reason="Only an owner or a builder can go back to an earlier version.">Go back to v{v.number}</Btn>)}</li>))}</ol>}
      {doc.briefBytes != null && <p className="small muted" style={{ marginTop: 12 }}>The compiled brief for this draft is {doc.briefBytes.toLocaleString('en-IN')} bytes.</p>}</Card>
  );
}
