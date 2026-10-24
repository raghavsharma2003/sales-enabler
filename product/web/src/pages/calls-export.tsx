// Calls > Export as CSV: the calls list for the filter on screen, as a file. Personal data leaves Vyakti, so the owner or
// compliance lead approves it (call.export) and every download is recorded. The file is made when it is downloaded, for 24
// hours, from the calls as they are then: test calls, suppressed people and erased people are never in it.
import { useState } from 'react';
import { Download } from 'lucide-react';
import { useApp } from '../store.tsx';
import { Btn, Locked, Sheet } from '../ui.tsx';
import { canRelease } from './contact-actions.tsx';

export function CallsExportButton({ campaignId, campaignName }: { campaignId?: string; campaignName?: string | null }) {
  const { act, me } = useApp();
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ rows: number; download: string; expiresAt: string } | null>(null);
  if (!canRelease(me)) return <Locked role="owner or compliance lead">Export needs the owner or compliance lead</Locked>;
  const go = async () => {
    setBusy(true);
    const r = await act<{ rows: number; download: string; expiresAt: string }>('call.export', campaignId ? { campaignId } : {}, { describe: 'Export ready to download.' });
    setBusy(false);
    if (r.ok && r.result) setMade(r.result);
  };
  const close = () => { setOpen(false); setMade(null); };
  return <>
    <Btn size="sm" icon={<Download size={14} aria-hidden />} onClick={() => setOpen(true)}>Export as CSV…</Btn>
    {open && <Sheet title="Export calls as a CSV file" onClose={close}>
      {made ? <>
        <p>{made.rows === 1 ? '1 call is' : `${made.rows} calls are`} in the export. The file can be downloaded until {new Date(made.expiresAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}; each download is recorded.</p>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}><Btn kind="ghost" onClick={close}>Close</Btn><a className="btn btn-primary" href={made.download} download><Download size={16} aria-hidden /><span>Download</span></a></div>
      </> : <>
        <p className="muted">Personal data leaves Vyakti in this file, so the owner or compliance lead approves it and it is recorded. It has one row per call {campaignName ? <>in <strong>{campaignName}</strong></> : 'in this workspace'}: when, who (full phone number), outcome, why it ended, cost and the summary. Practice calls, suppressed people and erased people are left out.</p>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}><Btn kind="ghost" onClick={close}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={() => void go()}>Ask to export</Btn></div>
      </>}
    </Sheet>}
  </>;
}
