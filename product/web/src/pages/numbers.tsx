// Numbers: search before you rent (price and wait shown before any approval), ring your own phone to hear a test, and the honest
// state of the server's telephony. The server has no "list my numbers" tool yet, so that part says so.
import { useState } from 'react';
import { PhoneCall } from 'lucide-react';
import { run, ToolRefused } from '../api.ts';
import { useApp, useData } from '../store.tsx';
import { Btn, Card, CardHead, Chip, NotMeasured, PageHead, SelectField, TextField } from '../ui.tsx';
import { agentGet, agentList } from '../data.ts';
import { inr } from '../format.ts';

const SERIES: [string, string][] = [['1600', '1600 series (service and transactional, regulated businesses)'], ['140', '140 series (promotional)'], ['ten_digit', 'Ten-digit mobile-style number'], ['trial', 'Trial line']];
export default function Numbers() {
  const { act, hasTool, toast } = useApp();
  const [series, setSeries] = useState('1600');
  const [found, setFound] = useState<{ rows: Record<string, unknown>[]; note?: string } | { error: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const agents = useData('agents', agentList);
  const published = (agents.data ?? []).filter(a => a.latestVersion);
  const [agent, setAgent] = useState(''); const [mine, setMine] = useState('');
  const [ring, setRing] = useState<string | null>(null);
  const search = async () => {
    setBusy(true);
    try {
      const r = await run<any>('number.search', { series, limit: 10 });
      const rows = (Array.isArray(r) ? r : r.offers ?? r.numbers ?? r.results ?? []) as Record<string, unknown>[];
      setFound({ rows, note: r.note });
    } catch (e) { setFound({ error: e instanceof ToolRefused ? e.reason : e instanceof Error ? e.message : 'Search failed.' }); }
    setBusy(false);
  };
  const tryRing = async () => {
    setBusy(true);
    try {
      const versionId = (await agentGet(agent)).latestVersionId;
      const r = await act<any>('test.ring_member_phone', { agentVersionId: versionId, phone: mine || undefined }, { quiet: true });
      if (r.ok) setRing('Ringing your phone now. She says once that she is an AI.'); else setRing(null);
    } catch { toast('Could not start the test.', 'bad'); }
    setBusy(false);
  };
  return (
    <div className="page">
      <PageHead title="Numbers" sub="The numbers calls go out from, in your business's name. Practice calls and simulations keep working while a number waits for KYC." />
      <div className="stack">
        <Card><CardHead title="Your numbers" /><div className="state state-missing"><h3>The list of your numbers is not available yet</h3><p>This server can search for and rent numbers, but has no tool that lists the ones you already have. Nothing here is a placeholder.</p></div></Card>
        <Card><CardHead title="Find a number to rent" sub="You see what is on offer before you ask for anything. Renting spends money, so it needs your approval." />
          <div className="formgrid"><SelectField label="Series" value={series} onChange={e => { setSeries(e.target.value); setFound(null); }}>{SERIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField></div>
          <div style={{ marginTop: 12 }}>{hasTool('number.search') ? <Btn busy={busy} onClick={search}>Search</Btn> : <Btn disabled reason="Number search is not switched on in this server.">Search</Btn>}</div>
          {found && 'error' in found && <p className="state state-failed" role="alert" style={{ marginTop: 12 }}>{found.error}</p>}
          {found && 'rows' in found && (found.rows.length === 0 ? <p className="state" style={{ marginTop: 12 }}>No numbers are on offer in that series right now.</p> :
            <ul className="issues" style={{ marginTop: 12 }}>{found.rows.map((o, i) => { const ref = String(o.offerRef ?? o.ref ?? o.id ?? ''); return (
              <li key={i}><div className="row" style={{ justifyContent: 'space-between' }}><strong className="tnum">{String(o.e164 ?? o.number ?? ref)}</strong>{o.monthlyInrMilli != null ? <span className="tnum">{inr(Number(o.monthlyInrMilli))} a month</span> : <NotMeasured>Price not shown</NotMeasured>}</div>
                <Btn size="sm" kind="primary" onClick={() => void act('number.rent', { offerRef: ref }, { describe: 'Number requested.' })}>Rent this number…</Btn></li>); })}</ul>)}
        </Card>
        <Card><CardHead title="Hear a test on your own phone" sub="She rings your verified phone as a made-up customer, so you hear what a customer hears. Nothing else is dialled." />
          <div className="formgrid"><SelectField label="Which agent" value={agent} onChange={e => setAgent(e.target.value)} hint={published.length === 0 ? 'Publish an agent first; tests use a published version.' : undefined}><option value="">Choose an agent</option>{published.map(a => <option key={a.id} value={a.id}>{a.name} (v{a.latestVersion})</option>)}</SelectField>
            <TextField label="Your phone" inputMode="tel" value={mine} onChange={e => setMine(e.target.value)} placeholder="+91 …" hint="Leave empty to use the phone on your profile if there is one." /></div>
          <div style={{ marginTop: 12 }}>{!agent ? <Btn disabled reason="Choose an agent first.">Ring me</Btn> : <Btn kind="primary" icon={<PhoneCall size={16} aria-hidden />} busy={busy} onClick={tryRing}>Ring me</Btn>}</div>
          {ring && <p className="state" role="status" style={{ marginTop: 12 }}>{ring}</p>}</Card>
        <Card><CardHead title="Line paperwork" /><p className="small muted">KYC and the A2P declaration for each line are handled at rent time. <Chip>Export</Chip> the declaration pack from the tool <code>a2p.declaration.export</code> when a carrier asks.</p></Card>
      </div>
    </div>
  );
}
