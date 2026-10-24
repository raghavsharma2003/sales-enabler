// Contacts from a connected CRM (HubSpot lists, Zoho CRM views), loaded as its own chunk. Pick a list, check it with the
// same column matching and per-row verdicts as a file, save, then choose whether it syncs on a timer. Read only: Vyakti
// never writes to the CRM.
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useApp, useData } from '../store.tsx';
import { Link } from '../router.tsx';
import { Async, Btn, Card, CardHead, Empty, SelectField } from '../ui.tsx';
import { agentNames, crmConnections, crmLists, crmPull, crmSources, importMap, type CrmKind, type CrmPull, type CrmSource } from '../data.ts';
import { ago, count, plural } from '../format.ts';
import type { ImportPreview } from '../types.ts';
import { ImportReview } from './import-review.tsx';

const NAME: Record<CrmKind, string> = { hubspot: 'HubSpot', zoho_crm: 'Zoho CRM' };
const LIST: Record<CrmKind, string> = { hubspot: 'list', zoho_crm: 'view' };
const EVERY: [string, string][] = [['', 'Off: sync only when you ask'], ['1', 'Every hour'], ['6', 'Every 6 hours'], ['24', 'Once a day']];

export default function CrmImport({ kind }: { kind: CrmKind }) {
  const conns = useData(['crm-conns', kind], () => crmConnections(kind));
  return (
    <Async q={conns} what={`${NAME[kind]} connections`} tool="integration.list" rows={2}>{list => list.length === 0
      ? <Card><Empty title={`${NAME[kind]} is not connected`} body={`Connect ${NAME[kind]} in Settings, then come back here to choose a ${LIST[kind]}. Vyakti only reads contacts from it; nothing is written back.`}
          action={<Link to="/settings/integrations">Go to Integrations</Link>} /></Card>
      : <Pick kind={kind} conns={list} />}</Async>
  );
}

function Pick({ kind, conns }: { kind: CrmKind; conns: { id: string; name: string }[] }) {
  const { toast } = useApp();
  const [conn, setConn] = useState(conns[0].id);
  const [listId, setListId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [pulled, setPulled] = useState<CrmPull | null>(null);
  const [pv, setPv] = useState<ImportPreview | null>(null);
  const lists = useData(['crm-lists', conn], () => crmLists(conn));
  const agents = useData('import-agents', agentNames);
  const synced = useData(['crm-sources', kind], () => crmSources(kind));
  const check = async () => {
    setBusy(true); setPv(null);
    try { const p = await crmPull(conn, listId); setPulled(p); setPv(await importMap(p.uploadId, '', undefined, agentId || undefined)); }
    catch (e) { toast(e instanceof Error ? e.message : `Could not read that ${LIST[kind]}.`, 'bad'); }
    setBusy(false);
  };
  return (
    <div className="stack">
      <Card><CardHead title={`1. Choose a ${NAME[kind]} ${LIST[kind]}`} sub={`Vyakti reads the contacts in it; nothing is written back to ${NAME[kind]}. Nothing is saved as contacts until step 4.`} />
        <div className="formgrid">
          {conns.length > 1 && <SelectField label="Account" value={conn} onChange={e => { setConn(e.target.value); setListId(''); setPv(null); }}>{conns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField>}
          <Async q={lists} what={`${NAME[kind]} ${LIST[kind]}s`} tool="source.crm.lists" rows={1}>{ls => (
            <SelectField label={`${NAME[kind]} ${LIST[kind]}`} value={listId} onChange={e => { setListId(e.target.value); setPv(null); }}
              hint={ls.length ? undefined : `${NAME[kind]} has no contact ${LIST[kind]}s to offer yet.`}>
              <option value="">Choose a {LIST[kind]}</option>{ls.map(l => <option key={l.id} value={l.id}>{l.name}{l.size != null ? ` (${count(l.size)} people)` : ''}</option>)}</SelectField>)}</Async>
          <Async q={agents} what="Agents" tool="agent.list" rows={1}>{as => (
            <SelectField label="Which agent will call them? (optional)" value={agentId} onChange={e => { setAgentId(e.target.value); setPv(null); }}
              hint="We check the list has every detail she says from each person's record, before anything is saved.">
              <option value="">Decide later</option>{as.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectField>)}</Async>
        </div>
        <div className="row" style={{ marginTop: 12 }}>{listId ? <Btn kind="primary" busy={busy} onClick={() => void check()}>Check this {LIST[kind]}</Btn> : <Btn disabled reason={`Choose a ${LIST[kind]} first.`}>Check this {LIST[kind]}</Btn>}</div>
        {pulled && <p className="hint" role="status">Read {plural(pulled.records, 'contact')} from {NAME[kind]}.{pulled.unchangedSkipped ? ` ${count(pulled.unchangedSkipped)} unchanged since the last import ${pulled.unchangedSkipped === 1 ? 'was' : 'were'} skipped.` : ''}{pulled.numberChanged ? ` ${plural(pulled.numberChanged, 'contact')} now ${pulled.numberChanged === 1 ? 'has' : 'have'} a different number in ${NAME[kind]}; ${pulled.numberChanged === 1 ? 'it is' : 'they are'} left out until you check ${pulled.numberChanged === 1 ? 'it' : 'them'}.` : ''}{pulled.truncated ? ' The list is larger than one import reads (50,000); the first 50,000 were read.' : ''}</p>}
      </Card>
      {pv && <ImportReview pv={pv} setPv={setPv} srcText="" agentId={agentId} saveSub={`Saves contacts and an audience. It does not call anyone, and writes nothing to ${NAME[kind]}.`}
        onSaved={() => { setPv(null); setPulled(null); synced.reload(); }} />}
      <Async q={synced} what={`Lists from ${NAME[kind]}`} tool="source.crm.sources" rows={2}>{ss => ss.some(s => s.imported) ? <Synced kind={kind} sources={ss.filter(s => s.imported)} onChange={synced.reload} /> : null}</Async>
    </div>
  );
}

function Synced({ kind, sources, onChange }: { kind: CrmKind; sources: CrmSource[]; onChange: () => void }) {
  const { act } = useApp();
  return (
    <Card><CardHead title={`Lists kept in step with ${NAME[kind]}`} sub="A sync re-reads the list and imports what changed, with the columns you matched last time. Timed syncs are off unless you choose one." />
      <ul className="facts">{sources.map(s => (
        <li key={s.id}>
          <div className="row" style={{ justifyContent: 'space-between' }}><strong>{s.listName}</strong>
            <span className="small muted">{s.lastSyncedAt ? `Last read ${ago(s.lastSyncedAt)}` : 'Not synced yet'}</span></div>
          {s.lastSyncError && <p className="hint hint-bad" role="status">The last sync did not finish: {s.lastSyncError}. It will try again at the next time you chose.</p>}
          <div className="formgrid">
            <SelectField label="Sync on a timer" value={s.everyHours ? String(s.everyHours) : ''} onChange={async e => {
              const v = e.target.value;
              const r = await act('source.sync.schedule', v ? { sourceId: s.id, everyHours: Number(v) } : { sourceId: s.id, off: true }, { describe: v ? 'Timed sync on.' : 'Timed sync off.' });
              if (r.ok) onChange(); }}>{EVERY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField>
            <div className="row" style={{ alignItems: 'flex-end' }}><Btn icon={<RefreshCw size={16} aria-hidden />} onClick={async () => {
              const r = await act<{ counts: Record<string, number>; unchangedSkipped: number }>('source.sync', { sourceId: s.id }, { describe: 'Synced.' });
              if (r.ok) onChange(); }}>Sync now</Btn></div>
          </div>
        </li>))}</ul>
    </Card>
  );
}
