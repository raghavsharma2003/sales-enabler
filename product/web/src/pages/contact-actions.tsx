// Compliance actions on people: look up DND, stop calling someone, allow calls again, export. Each is one tool call;
// nothing here keeps a draft. A reason is required wherever the server requires one, and the button says so until it is given.
import { useState } from 'react';
import { Download, ShieldAlert } from 'lucide-react';
import { useApp, useData } from '../store.tsx';
import { Btn, Card, CardHead, Locked, Sheet, SelectField, TextField, Toggle } from '../ui.tsx';
import { audienceList } from '../data.ts';
import { date } from '../format.ts';

const role = (me: ReturnType<typeof useApp>['me']) => me?.member?.role ?? 'viewer';
export const canStop = (me: ReturnType<typeof useApp>['me']) => ['owner', 'operator', 'compliance'].includes(role(me));
export const canRelease = (me: ReturnType<typeof useApp>['me']) => ['owner', 'compliance'].includes(role(me));

interface DndTally { checked: number; registered: number; not_registered: number; unknown: number }
export const tallyText = (t: DndTally) => `Checked ${t.checked} number${t.checked === 1 ? '' : 's'}: ${t.registered} on the Do Not Disturb list, ${t.not_registered} not on it, ${t.unknown} without an answer.${t.unknown === t.checked && t.checked > 0 ? ' The register gave no answer, so they stay marked as not checked. Try again later.' : ''}`;

/** Looks up DND for the given people and says what came back. */
export function useDndCheck(onDone: () => void) {
  const { act } = useApp();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const run = async (contactIds: string[]) => {
    setBusy(true); setNote(null);
    const r = await act<DndTally>('contact.dnd_refresh', { contactIds }, { quiet: true });
    setBusy(false);
    if (r.ok) { setNote(tallyText(r.result as DndTally)); onDone(); }
  };
  return { busy, note, run };
}

export function DndExplain({ checkedAt, status }: { checkedAt: string | null; status: string }) {
  if (status !== 'unknown') return null;
  return <p className="small muted">{checkedAt
    ? 'The Do Not Disturb register did not give an answer for this number the last time it was checked, so it is still marked as not checked. Promotional calls are held back until it answers. Service calls are not affected.'
    : 'Nothing has looked this number up on the national Do Not Disturb register yet. Until it is checked, promotional calls to this person are held back. Service calls are not affected. Use Check DND now to look it up.'}</p>;
}

export function DndButton({ contactId, onDone }: { contactId: string; onDone: () => void }) {
  const d = useDndCheck(onDone);
  return <div className="stack-s"><div><Btn size="sm" busy={d.busy} onClick={() => void d.run([contactId])}>Check DND now</Btn></div>{d.note && <p className="small" role="status">{d.note}</p>}</div>;
}

export function StopCard({ contactId, me, onDone }: { contactId: string; me: ReturnType<typeof useApp>['me']; onDone: () => void }) {
  const { act } = useApp();
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  const ok = reason.trim().length >= 2;
  return (
    <Card><CardHead title="Stop calling this person" sub="Takes effect at once, for every campaign. It can be released later with a reason and an approval." />
      {!canStop(me) ? <Locked role="owner, operator or compliance lead" /> : <>
        <TextField label="Reason" value={reason} onChange={e => setReason(e.target.value)} hint="Recorded with the change, for example: asked by email not to be called." />
        <div style={{ marginTop: 12 }}>{ok
          ? <Btn kind="danger" busy={busy} onClick={async () => { setBusy(true); const r = await act('contact.suppress', { contactId, reason: reason.trim() }, { describe: 'This person will not be called.' }); setBusy(false); if (r.ok) { setReason(''); onDone(); } }}>Stop calling this person</Btn>
          : <Btn disabled reason="Give a reason first.">Stop calling this person</Btn>}</div></>}
    </Card>
  );
}

export function SuppressionNote({ suppressions, me, onDone, reasonText }: { suppressions: { id: string; reason: string; scope: string; created_at?: string }[]; me: ReturnType<typeof useApp>['me']; onDone: () => void; reasonText: (r: string) => string }) {
  const { act } = useApp();
  const [open, setOpen] = useState<string | null>(null); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  if (suppressions.length === 0) return null;
  return (
    <div className="state state-failed" role="note" style={{ marginBottom: 16, textAlign: 'left', justifyItems: 'start' }}>
      <strong><ShieldAlert size={16} aria-hidden /> She will not call this number.</strong>
      <ul className="plainlist" style={{ margin: 0 }}>{suppressions.map(s => (
        <li key={s.id}><span>{reasonText(s.reason)}{s.scope === 'campaign' ? ' (one campaign)' : ''}{s.created_at ? ` · since ${date(s.created_at, true)}` : ''}</span>{' '}
          {canRelease(me) ? <Btn size="sm" onClick={() => { setOpen(s.id); setReason(''); }}>Allow calls again…</Btn> : <Locked role="owner or compliance lead" />}</li>))}</ul>
      {open && <Sheet title="Allow calls to this person again" onClose={() => setOpen(null)}>
        <p className="muted">This is a policy change, so it asks for approval. The reason is kept in the activity record.</p>
        <TextField label="Reason" value={reason} onChange={e => setReason(e.target.value)} data-autofocus />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}><Btn kind="ghost" onClick={() => setOpen(null)}>Cancel</Btn>
          {reason.trim().length >= 5 ? <Btn kind="primary" busy={busy} onClick={async () => { setBusy(true); const r = await act('contact.unsuppress', { suppressionId: open, reason: reason.trim() }, { describe: 'Calls are allowed again.' }); setBusy(false); if (r.ok) { setOpen(null); onDone(); } }}>Ask to allow calls</Btn> : <Btn disabled reason="Give a reason of a few words.">Ask to allow calls</Btn>}</div></Sheet>}
    </div>
  );
}

/** Export people as a CSV. The file is created when the approval is given and handed to the approver here; nothing is kept. */
export function ExportButton({ me }: { me: ReturnType<typeof useApp>['me'] }) {
  const { act } = useApp();
  const [open, setOpen] = useState(false); const [aud, setAud] = useState(''); const [withSupp, setWithSupp] = useState(false); const [busy, setBusy] = useState(false);
  const audiences = useData('audiences-export', open ? audienceList : null);
  if (!canRelease(me)) return <Locked role="owner or compliance lead">Export needs the owner or compliance lead</Locked>;
  const go = async () => {
    setBusy(true);
    const r = await act<{ rows: number; csv: string }>('contact.export', { ...(aud ? { audienceId: aud } : {}), ...(withSupp ? { includeSuppressed: true } : {}) }, { describe: 'Export ready.' });
    setBusy(false);
    if (r.ok && r.result) {
      const blob = new Blob([r.result.csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = ['contacts', 'csv'].join('.'); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setOpen(false);
    }
  };
  return <>
    <Btn size="sm" icon={<Download size={14} aria-hidden />} onClick={() => setOpen(true)}>Export as CSV…</Btn>
    {open && <Sheet title="Export people as a CSV file" onClose={() => setOpen(false)}>
      <p className="muted">Personal data leaves Vyakti in this file, so the owner or compliance lead approves it and it is recorded. The file is built when you approve and is not kept.</p>
      <SelectField label="Who" value={aud} onChange={e => setAud(e.target.value)}><option value="">Everyone</option>{(audiences.data ?? []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectField>
      <Toggle checked={withSupp} onChange={setWithSupp} label="Include people we must not call" hint="They are marked as suppressed in the file." />
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}><Btn kind="ghost" onClick={() => setOpen(false)}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={() => void go()}>Ask to export</Btn></div>
    </Sheet>}
  </>;
}

export function BulkDnd({ ids, allUnchecked, onDone }: { ids: string[]; allUnchecked: boolean; onDone: () => void }) {
  const d = useDndCheck(onDone);
  return (
    <div className="stack-s" style={{ marginBottom: 12 }}>
      {allUnchecked && <p className="small muted">Do Not Disturb has not been checked for these numbers. Nothing has looked them up on the national register yet, so promotional calls to them are held back until it has. Service calls are not affected.</p>}
      <div className="row"><Btn size="sm" busy={d.busy} onClick={() => void d.run(ids)}>{`Check DND for the ${ids.length} ${ids.length === 1 ? 'person' : 'people'} shown`}</Btn></div>
      {d.note && <p className="small" role="status">{d.note}</p>}
    </div>
  );
}
