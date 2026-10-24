// Numbers: the lines you have (with the honest state of KYC and A2P), search before you rent, verify your own phone by a spoken
// code, then hear a test on it. KYC "submitted" means waiting on the carrier; only the carrier makes it "verified".
import { useState } from 'react';
import { PhoneCall } from 'lucide-react';
import { run, ToolRefused } from '../api.ts';
import { useApp, useData } from '../store.tsx';
import { Async, Btn, Card, CardHead, Chip, Empty, NotMeasured, PageHead, SelectField, TextField } from '../ui.tsx';
import { agentGet, agentList, numberList } from '../data.ts';
import { phone as fmtPhone } from '../format.ts';
import { prettyCode } from './contacts.tsx';
import { inr } from '../format.ts';

const SERIES: [string, string][] = [['1600', '1600 series (service and transactional, regulated businesses)'], ['140', '140 series (promotional)'], ['ten_digit', 'Ten-digit mobile-style number'], ['trial', 'Trial line']];
const kyc = (k: string | null) => (k === 'verified' ? <Chip tone="leaf">KYC verified by the carrier</Chip> : k === 'submitted' ? <Chip tone="marigold">KYC submitted, waiting on the carrier</Chip> : k ? <Chip>{`KYC ${prettyCode(k)}`}</Chip> : <NotMeasured>KYC not started</NotMeasured>);

export default function Numbers() {
  const { act, hasTool, toast } = useApp();
  const lines = useData('numbers', numberList);
  const [series, setSeries] = useState('1600');
  const [found, setFound] = useState<{ rows: Record<string, unknown>[] } | { error: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const agents = useData('agents', agentList);
  const routes = useData('inbound-routes', hasTool('inbound.route.list') ? () => run<{ routes: InboundRoute[] }>('inbound.route.list', {}) : null);
  const published = (agents.data ?? []).filter(a => a.latestVersion);
  const [agent, setAgent] = useState('');
  const [mine, setMine] = useState(''); const [code, setCode] = useState('');
  const [v, setV] = useState<{ stage: 'idle' | 'ringing' | 'verified'; phone?: string; note?: string }>({ stage: 'idle' });
  const [ring, setRing] = useState<string | null>(null);

  const search = async () => {
    setBusy(true);
    try { const r = await run<any>('number.search', { series, limit: 10 }); setFound({ rows: (Array.isArray(r) ? r : r.offers ?? r.numbers ?? r.results ?? []) as Record<string, unknown>[] }); }
    catch (e) { setFound({ error: e instanceof ToolRefused ? e.reason : e instanceof Error ? e.message : 'Search failed.' }); }
    setBusy(false);
  };
  const start = async () => {
    setBusy(true);
    const r = await act<{ ringing: boolean; phone?: string; reason?: string }>('member.phone.verify_start', { phone: mine }, { quiet: true });
    setBusy(false);
    if (!r.ok) { setV({ stage: 'idle', note: r.reason }); return; }
    if (!r.result.ringing) setV({ stage: 'idle', note: r.result.reason ?? 'The line could not be rung.' });
    else setV({ stage: 'ringing', phone: r.result.phone ?? mine, note: 'Your phone is ringing. A system voice says a six-digit code. It is good for 10 minutes.' });
  };
  const confirm = async () => {
    setBusy(true);
    const r = await act<{ verified: boolean; reason?: string; triesLeft?: number }>('member.phone.verify_confirm', { phone: v.phone ?? mine, code }, { quiet: true });
    setBusy(false);
    if (!r.ok) return;
    if (r.result.verified) setV({ stage: 'verified', phone: v.phone, note: 'This phone is verified as yours.' });
    else setV({ ...v, note: `${r.result.reason ?? 'That code is not right.'}${r.result.triesLeft != null ? ` ${r.result.triesLeft} ${r.result.triesLeft === 1 ? 'try' : 'tries'} left.` : ''}` });
  };
  const tryRing = async () => {
    setBusy(true);
    try {
      const versionId = (await agentGet(agent)).latestVersionId;
      const r = await act<any>('test.ring_member_phone', { agentVersionId: versionId, phone: v.phone }, { quiet: true });
      setRing(r.ok ? 'Ringing your phone now. She says once that she is an AI.' : null);
    } catch { toast('Could not start the test.', 'bad'); }
    setBusy(false);
  };
  return (
    <div className="page">
      <PageHead title="Numbers" sub="The numbers calls go out from, in your business's name. Practice calls and simulations keep working while a number waits for KYC." />
      <div className="stack">
        <Card><CardHead title="Your numbers" />
          <Async q={lines} what="Your numbers" tool="number.list" empty={d => d.length === 0 ? <Empty title="No numbers yet" body="Verify your own phone to hear a test, then rent or connect a number for real campaigns. A campaign cannot launch without one." /> : null}>
            {d => <ul className="issues">{d.map(n => (
              <li key={n.id}><div className="row" style={{ justifyContent: 'space-between' }}><h3 className="tnum">{fmtPhone(n.e164)}</h3><Chip tone={n.status === 'active' ? 'leaf' : 'marigold'}>{prettyCode(n.status)}</Chip></div>
                <p className="small muted">{n.displayName ? `${n.displayName} · ` : ''}series {n.series}{n.trial ? ' · trial line' : ''}{n.byo ? ' · your own' : ''}{n.carrier ? ` · ${n.carrier}` : ''}</p>
                <div className="row">{kyc(n.kycStatus)}{n.a2pStatus ? <Chip tone={n.a2pStatus === 'declared' ? 'leaf' : 'marigold'}>{`A2P ${prettyCode(n.a2pStatus)}`}</Chip> : <NotMeasured>A2P not declared</NotMeasured>}</div>
                {n.pauseCause && <p className="small hint-bad">Paused: {prettyCode(n.pauseCause)}</p>}
                <p className="small muted">{n.campaigns.length ? `Used by ${n.campaigns.map(c => c.name).join(', ')}` : 'Not used by any campaign yet.'}</p>
                <InboundLine numberId={n.id} route={routes.data?.routes.find(r => r.numberId === n.id) ?? null} agents={published} onChange={routes.reload} /></li>))}</ul>}</Async></Card>

        <Card><CardHead title="Find a number to rent" sub="You see what is on offer before you ask for anything. Renting spends money, so it needs your approval." />
          <div className="formgrid"><SelectField label="Series" value={series} onChange={e => { setSeries(e.target.value); setFound(null); }}>{SERIES.map(([val, l]) => <option key={val} value={val}>{l}</option>)}</SelectField></div>
          <div style={{ marginTop: 12 }}>{hasTool('number.search') ? <Btn busy={busy} onClick={search}>Search</Btn> : <Btn disabled fix={null} reason="Number search is not switched on in this server.">Search</Btn>}</div>
          {found && 'error' in found && <p className="state state-failed" role="alert" style={{ marginTop: 12 }}>{found.error}</p>}
          {found && 'rows' in found && (found.rows.length === 0 ? <p className="state" style={{ marginTop: 12 }}>No numbers are on offer in that series right now.</p> :
            <ul className="issues" style={{ marginTop: 12 }}>{found.rows.map((o, i) => { const ref = String(o.offerRef ?? o.ref ?? o.id ?? ''); return (
              <li key={i}><div className="row" style={{ justifyContent: 'space-between' }}><strong className="tnum">{String(o.e164 ?? o.number ?? ref)}</strong>{o.monthlyInrMilli != null ? <span className="tnum">{inr(Number(o.monthlyInrMilli))} a month</span> : <NotMeasured>Price not shown</NotMeasured>}</div>
                <Btn size="sm" kind="primary" onClick={async () => { const r = await act('number.rent', { offerRef: ref }, { describe: 'Number requested.' }); if (r.ok) lines.reload(); }}>Rent this number…</Btn></li>); })}</ul>)}</Card>

        <Card><CardHead title="Verify your own phone" sub="A system voice rings you and says a six-digit code. Only a verified phone can be rung for a test. There are limits to stop misuse, and the server tells you if you hit one." />
          {v.stage !== 'verified' && <div className="formgrid"><TextField label="Your mobile number" inputMode="tel" value={mine} onChange={e => setMine(e.target.value)} placeholder="+91 …" disabled={v.stage === 'ringing'} hint="Calls between 9 am and 9 pm IST only." />
            {v.stage === 'ringing' && <TextField label="The six-digit code" inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} autoComplete="one-time-code" />}</div>}
          <div className="row" style={{ marginTop: 12 }}>
            {v.stage === 'idle' && (mine.replace(/\D/g, '').length >= 10 ? <Btn kind="primary" icon={<PhoneCall size={16} aria-hidden />} busy={busy} onClick={start}>Ring me with a code</Btn> : <Btn disabled fix={null} reason="Enter your 10-digit mobile number.">Ring me with a code</Btn>)}
            {v.stage === 'ringing' && (code.length === 6 ? <Btn kind="primary" busy={busy} onClick={confirm}>Check the code</Btn> : <Btn disabled fix={null} reason="Enter all six digits.">Check the code</Btn>)}
            {v.stage === 'ringing' && <Btn kind="ghost" onClick={() => { setV({ stage: 'idle' }); setCode(''); }}>Use another number</Btn>}</div>
          {v.note && <p className={`state${v.stage === 'verified' ? '' : ' state-missing'}`} role="status" style={{ marginTop: 12 }}>{v.note}{v.stage === 'verified' && v.phone ? ` (${fmtPhone(v.phone)})` : ''}</p>}</Card>

        <Card><CardHead title="Hear a test on your phone" sub="She rings your verified phone as a made-up customer, so you hear what a customer hears. Nothing else is dialled." />
          <div className="formgrid"><SelectField label="Which agent" value={agent} onChange={e => setAgent(e.target.value)} hint={published.length === 0 ? 'Publish an agent first; tests use a published version.' : undefined}><option value="">Choose an agent</option>{published.map(a => <option key={a.id} value={a.id}>{a.name} (v{a.latestVersion})</option>)}</SelectField></div>
          <div style={{ marginTop: 12 }}>{v.stage !== 'verified' ? <Btn disabled fix={null} reason="Verify your phone above first.">Ring me</Btn> : !agent ? <Btn disabled fix={null} reason="Choose an agent first.">Ring me</Btn> : <Btn kind="primary" icon={<PhoneCall size={16} aria-hidden />} busy={busy} onClick={tryRing}>Ring me</Btn>}</div>
          {ring && <p className="state" role="status" style={{ marginTop: 12 }}>{ring}</p>}</Card>
      </div>
    </div>
  );
}

interface InboundRoute { numberId: string; agentId: string | null; agentName: string | null; versionNumber: number | null; deploymentId: string | null }
/** Which agent answers calls to this number (inbound.route.set, a policy change, so it asks for approval). */
function InboundLine({ numberId, route, agents, onChange }: { numberId: string; route: InboundRoute | null; agents: { id: string; name: string }[]; onChange: () => void }) {
  const { act } = useApp();
  const [pick, setPick] = useState('');
  return <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
    <p className="small" style={{ margin: 0 }}>{route?.agentName ? <>Answers calls with <strong>{route.agentName}, version {route.versionNumber}</strong>{route.deploymentId ? ', split by its inbound deployment' : ''}.</> : 'Does not answer calls yet: callers hear the carrier\'s line.'}</p>
    {agents.length > 0 && <SelectField label="Answer calls with" value={pick} onChange={e => setPick(e.target.value)}><option value="">Choose an agent</option>{agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectField>}
    {pick && <Btn size="sm" onClick={async () => {
      const versionId = (await agentGet(pick)).latestVersionId;
      if (!versionId) return;
      const r = await act('inbound.route.set', { numberId, agentVersionId: versionId }, { describe: 'Calls to this number are answered by that agent.' });
      if (r.ok) { setPick(''); onChange(); }
    }}>Ask to answer with her…</Btn>}
    {route && <Btn size="sm" kind="danger" onClick={async () => { const r = await act('inbound.route.clear', { numberId }, { describe: 'This number no longer answers calls.' }); if (r.ok) onChange(); }}>Stop answering…</Btn>}
  </div>;
}
