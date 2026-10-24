// Settings → Outcomes and checks (must-be brief 7): what counts as a result, the values that reach the goal, the typed
// fields the analysis fills (each quoted from the caller), how each outcome is judged (instructions and model) and
// whether that judge is calibrated yet. Edits go through outcome.define and judge.edit (drafts, kept in the activity log).
import { useState } from 'react';
import { run } from '../api.ts';
import { useApp, useData } from '../store.tsx';
import { Async, Btn, Card, CardHead, Chip, Empty, SelectField, TextArea, TextField } from '../ui.tsx';
import { prettyId } from '../catalog.ts';
import { prettyCode } from './contacts.tsx';
import { calibrationWords, FIELD_TYPE_WORDS, type Calibration, type Trust } from '../outcome-text.ts';

interface Field { key: string; label?: string; type: string; values?: string[] }
interface Definition {
  id: string; name: string; question: string; allowedValues: string[]; goalValues: string[]; verifiedBy: string | null; fields: Field[];
  campaigns: { id: string; name: string }[]; judge: { judgeVersionId: string; name: string; model: string; instructions: string; number: number } | null;
  judgedBy: string | null; calibration: Calibration; labelledCalls: number; trust: Trust;
}
const list = (s: string) => s.split(',').map(x => x.trim().toLowerCase().replace(/\s+/g, '_')).filter(Boolean);

export default function Outcomes() {
  const q = useData('outcomes', () => run<{ definitions: Definition[] }>('outcome.list', {}));
  const models = useData('analysis-models', () => run<{ models: string[] }>('analysis.settings.get', {}));
  const [adding, setAdding] = useState(false);
  return <Async q={q} what="Outcomes" tool="outcome.list">{d => <div className="stack">
    <Card><CardHead title="Outcomes and checks" sub="What counts as a result on a call, how it is judged, and whether that judge can be trusted yet. A system that confirms results always outranks a person's label, which outranks a guess." />
      {!adding && <Btn onClick={() => setAdding(true)}>New outcome</Btn>}
      {adding && <DefinitionForm onDone={() => { setAdding(false); q.reload(); }} />}</Card>
    {d.definitions.length === 0 && !adding && <Empty title="No outcome is defined yet" body="Define what a call should achieve (for example agreed, callback, not interested) and which of those reach the goal." />}
    {d.definitions.map(def => <DefinitionCard key={def.id} def={def} models={models.data?.models ?? []} onChange={q.reload} />)}
  </div>}</Async>;
}

function DefinitionCard({ def, models, onChange }: { def: Definition; models: string[]; onChange: () => void }) {
  const { act } = useApp();
  const [edit, setEdit] = useState<'none' | 'outcome' | 'judge'>('none');
  const cal = calibrationWords(def.calibration, def.trust);
  return <Card><CardHead title={def.name} sub={def.question} />
    <dl className="kv">
      <div><dt>Values</dt><dd>{def.allowedValues.map(v => <Chip key={v} tone={def.goalValues.includes(v) ? 'leaf' : undefined}>{prettyCode(v)}{def.goalValues.includes(v) ? ' · goal' : ''}</Chip>)}</dd></div>
      <div><dt>Confirmed by</dt><dd>{def.verifiedBy ? prettyCode(def.verifiedBy) : 'Nothing yet: results stay AI guesses until a system confirms them or a person labels them'}</dd></div>
      <div><dt>Used by</dt><dd>{def.campaigns.length ? def.campaigns.map(c => c.name).join(', ') : 'No campaign yet'}</dd></div>
      <div><dt>Fields</dt><dd>{def.fields.length ? def.fields.map(f => <Chip key={f.key}>{f.label ?? prettyCode(f.key)} · {FIELD_TYPE_WORDS[f.type] ?? f.type}{f.values ? `: ${f.values.map(prettyCode).join(', ')}` : ''}</Chip>) : 'None. Each field is filled only from what the caller said, quoted, or left empty.'}</dd></div>
      <div><dt>Judged by</dt><dd>{def.judge ? <>{def.judge.name}, version {def.judge.number}, on <strong>{prettyId(def.judge.model)}</strong></> : def.judgedBy}</dd></div>
      {def.judge?.instructions && <div><dt>Instructions</dt><dd><blockquote>{def.judge.instructions}</blockquote></dd></div>}
      <div><dt>Calibration</dt><dd><Chip tone={cal.tone}>{cal.label}</Chip><p className="small muted">{cal.detail}</p></dd></div>
    </dl>
    <div className="row" style={{ marginTop: 12 }}>
      <Btn size="sm" onClick={() => setEdit(edit === 'outcome' ? 'none' : 'outcome')}>Edit outcome</Btn>
      <Btn size="sm" onClick={() => setEdit(edit === 'judge' ? 'none' : 'judge')}>Change how it is judged</Btn>
      {def.judge && <Btn size="sm" onClick={async () => { const r = await act('judge.calibrate', { judgeVersionId: def.judge!.judgeVersionId }, { describe: 'Agreement checked.' }); if (r.ok) onChange(); }}>Check agreement</Btn>}
    </div>
    {edit === 'outcome' && <DefinitionForm def={def} onDone={() => { setEdit('none'); onChange(); }} />}
    {edit === 'judge' && <JudgeForm def={def} models={models} onDone={() => { setEdit('none'); onChange(); }} />}
  </Card>;
}

function DefinitionForm({ def, onDone }: { def?: Definition; onDone: () => void }) {
  const { act } = useApp();
  const [name, setName] = useState(def?.name ?? ''), [question, setQuestion] = useState(def?.question ?? '');
  const [values, setValues] = useState((def?.allowedValues ?? []).join(', ')), [goal, setGoal] = useState((def?.goalValues ?? []).join(', '));
  const [fields, setFields] = useState<Field[]>(def?.fields ?? []);
  const setField = (i: number, f: Partial<Field>) => setFields(fs => fs.map((x, k) => k === i ? { ...x, ...f } : x));
  return <div className="stack" style={{ marginTop: 12 }}>
    <div className="formgrid">
      <TextField label="Name" value={name} onChange={e => setName(e.target.value)} />
      <TextField label="Question the call answers" value={question} onChange={e => setQuestion(e.target.value)} hint="For example: Did they agree to renew?" />
      <TextField label="Possible values" value={values} onChange={e => setValues(e.target.value)} hint="Separated by commas, for example: agreed, callback, not interested" />
      <TextField label="Values that reach the goal" value={goal} onChange={e => setGoal(e.target.value)} hint="One or more of the possible values" />
    </div>
    <h3 className="dayhead">Fields</h3>
    {fields.map((f, i) => <div key={i} className="formgrid">
      <TextField label="Field name" value={f.label ?? f.key} onChange={e => setField(i, { label: e.target.value, key: list(e.target.value)[0] ?? '' })} />
      <SelectField label="Type" value={f.type} onChange={e => setField(i, { type: e.target.value, values: e.target.value === 'enum' ? (f.values ?? []) : undefined })}>
        {Object.entries(FIELD_TYPE_WORDS).map(([k, w]) => <option key={k} value={k}>{w}</option>)}</SelectField>
      {f.type === 'enum' && <TextField label="Choices" value={(f.values ?? []).join(', ')} onChange={e => setField(i, { values: list(e.target.value) })} hint="Separated by commas" />}
      <div><Btn size="sm" kind="danger" onClick={() => setFields(fs => fs.filter((_, k) => k !== i))}>Remove</Btn></div>
    </div>)}
    <div className="row"><Btn size="sm" onClick={() => setFields(fs => [...fs, { key: '', type: 'text' }])}>Add a field</Btn>
      <Btn kind="primary" onClick={async () => {
        const r = await act('outcome.define', { ...(def ? { id: def.id } : {}), name, question, allowedValues: list(values), goalValues: list(goal),
          fields: fields.filter(f => f.key).map(f => ({ key: f.key, ...(f.label ? { label: f.label } : {}), type: f.type, ...(f.type === 'enum' ? { values: f.values ?? [] } : {}) })) },
          { describe: def ? 'Outcome changed.' : 'Outcome created.' });
        if (r.ok) onDone();
      }}>{def ? 'Save changes' : 'Create outcome'}</Btn></div>
  </div>;
}

function JudgeForm({ def, models, onDone }: { def: Definition; models: string[]; onDone: () => void }) {
  const { act } = useApp();
  const [model, setModel] = useState(def.judge?.model ?? models[0] ?? ''), [instructions, setInstructions] = useState(def.judge?.instructions ?? '');
  return <div className="stack" style={{ marginTop: 12 }}>
    <p className="small muted">Each change is a new numbered version of the judge. A new version starts uncalibrated: its guesses count only once it agrees with people on enough labelled calls.</p>
    <div className="formgrid">
      <SelectField label="Model" value={model} onChange={e => setModel(e.target.value)}>{(models.length ? models : [model]).filter(Boolean).map(m => <option key={m} value={m}>{prettyId(m)}</option>)}</SelectField>
      <TextArea label="Instructions" value={instructions} onChange={e => setInstructions(e.target.value)} hint="Your own rule for this outcome, for example: a payment link sent counts as agreed." />
    </div>
    <div className="row">{!model ? <Btn disabled reason="No analysis model is configured on this server to judge with.">Save as a new version</Btn> : <Btn kind="primary" onClick={async () => {
      const r = await act('judge.edit', { outcomeDefinitionId: def.id, name: def.judge?.name ?? `${def.name} judge`, model, instructions }, { describe: 'Judge changed. It starts uncalibrated.' });
      if (r.ok) onDone();
    }}>Save as a new version</Btn>}</div>
  </div>;
}
