// A Google Sheet as a live list, loaded as its own chunk: a sheet shared with the workspace's service account (pick the tab),
// or a published CSV link. It is checked like a file, saved, and can then sync on a timer. Read only: nothing is written to it.
import { useState } from 'react';
import { useApp, useData } from '../store.tsx';
import { Link } from '../router.tsx';
import { Async, Btn, Card, CardHead, SelectField, TextField } from '../ui.tsx';
import { crmSources, googleAccounts, importMap, sheetPull, sheetTabs } from '../data.ts';
import { plural } from '../format.ts';
import type { ImportPreview } from '../types.ts';
import { ImportReview } from './import-review.tsx';
import { Synced } from './import-crm.tsx';

export default function SheetImport() {
  const { toast } = useApp();
  const accounts = useData('google-accounts', googleAccounts);
  const synced = useData(['crm-sources', 'google_sheets'], () => crmSources('google_sheets'));
  const [link, setLink] = useState('');
  const [account, setAccount] = useState('');
  const [address, setAddress] = useState('');
  const [tabs, setTabs] = useState<{ title: string; names: string[] } | null>(null);
  const [tab, setTab] = useState('');
  const [busy, setBusy] = useState<'' | 'tabs' | 'pull'>('');
  const [read, setRead] = useState<number | null>(null);
  const [pv, setPv] = useState<ImportPreview | null>(null);
  const fail = (e: unknown) => toast(e instanceof Error ? e.message : 'Could not read that sheet.', 'bad');
  const pull = async (a: Parameters<typeof sheetPull>[0]) => {
    setBusy('pull'); setPv(null);
    try { const r = await sheetPull(a); setRead(r.records); setPv(await importMap(r.uploadId, '')); } catch (e) { fail(e); }
    setBusy('');
  };
  const showTabs = async (id: string) => {
    setBusy('tabs'); setTabs(null); setTab('');
    try { const r = await sheetTabs(id, address); setTabs({ title: r.title, names: r.tabs.map(t => t.name) }); setTab(r.tabs[0]?.name ?? ''); } catch (e) { fail(e); }
    setBusy('');
  };
  return (
    <div className="stack">
      <Card><CardHead title="1. Choose a Google Sheet" sub="Vyakti reads the rows; nothing is written to the sheet. Nothing is saved as contacts until step 4, and a sync can re-read the sheet later." />
        <Async q={accounts} what="Google accounts" tool="integration.list" rows={1}>{as => {
          const acc = account || as[0]?.id || '';
          return as.length ? (<>
            <div className="formgrid">
              {as.length > 1 && <SelectField label="Service account" value={acc} onChange={e => { setAccount(e.target.value); setTabs(null); }}>{as.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectField>}
              <TextField label="Sheet address" value={address} onChange={e => { setAddress(e.target.value); setTabs(null); }} placeholder="https://docs.google.com/spreadsheets/d/…"
                hint="Share the sheet with the service account's address as a Viewer first." />
              {tabs && <SelectField label={`Tab in “${tabs.title}”`} value={tab} onChange={e => setTab(e.target.value)}>{tabs.names.map(n => <option key={n} value={n}>{n}</option>)}</SelectField>}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              {!tabs ? (address.trim().length >= 20 ? <Btn busy={busy === 'tabs'} onClick={() => void showTabs(acc)}>Show its tabs</Btn> : <Btn disabled fix={null} reason="Paste the sheet's address first.">Show its tabs</Btn>)
                : <Btn kind="primary" busy={busy === 'pull'} onClick={() => void pull({ integrationId: acc, spreadsheet: address, tab })}>Check this tab</Btn>}
            </div>
          </>) : <p className="hint">To read a private sheet, connect a Google service account in <Link to="/settings/integrations">Integrations</Link> and share the sheet with it. Or use a published link below.</p>;
        }}</Async>
        <div className="formgrid" style={{ marginTop: 16 }}>
          <TextField label="Or a published CSV link" value={link} onChange={e => setLink(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/e/…/pub?output=csv"
            hint="In the sheet: File > Share > Publish to the web, choose the tab and CSV. Anyone with this link can read it." />
        </div>
        <div className="row" style={{ marginTop: 12 }}>{link.trim().length >= 20 ? <Btn busy={busy === 'pull'} onClick={() => void pull({ csvUrl: link.trim() })}>Check this link</Btn> : <Btn disabled fix={null} reason="Paste the published CSV link first.">Check this link</Btn>}</div>
        {read !== null && <p className="hint" role="status">Read {plural(read, 'row')} from the sheet.</p>}
      </Card>
      {pv && <ImportReview pv={pv} setPv={setPv} srcText="" agentId="" saveSub="Saves contacts and an audience. It does not call anyone, and writes nothing to the sheet."
        onSaved={() => { setPv(null); setRead(null); synced.reload(); }} />}
      <Async q={synced} what="Sheets kept in step" tool="source.crm.sources" rows={1}>{ss => ss.some(s => s.imported) ? <Synced kind="google_sheets" sources={ss.filter(s => s.imported)} onChange={synced.reload} /> : null}</Async>
    </div>
  );
}
