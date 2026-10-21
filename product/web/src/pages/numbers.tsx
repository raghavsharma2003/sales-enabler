// Numbers: what you can call from, the timer for KYC shown honestly, price before purchase, and ring-your-own-phone verification.
import { useState } from 'react';
import { PhoneCall } from 'lucide-react';
import * as api from '../api.ts';
import { useApp, useTool } from '../store.tsx';
import { Async, Btn, Card, CardHead, Chip, Empty, NotMeasured, PageHead, SelectField, TextField } from '../ui.tsx';
import { inr, phone as fmtPhone } from '../format.ts';
import type { NumberRow } from '../types.ts';

const STATUS: Record<string, [string, 'leaf' | 'marigold' | 'peacock' | 'neutral']> = { active: ['Ready', 'leaf'], verifying: ['Verifying', 'peacock'], kyc_pending: ['KYC in progress', 'marigold'], paused: ['Paused', 'neutral'] };
export default function Numbers() {
  const { act, refresh, toast } = useApp();
  const q = useTool<{ rows: NumberRow[] }>('number.list', {});
  const [kind, setKind] = useState('rent'); const [cat, setCat] = useState('service');
  const [quote, setQuote] = useState<{ priceMilli: number | null; setupDays: string; note: string } | null>(null);
  const [mine, setMine] = useState(''); const [v, setV] = useState<{ dialTo: string; expiresInS: number } | null>(null);
  const getQuote = async () => { try { setQuote(await api.run('number.quote', { kind, category: cat })); } catch (e) { toast(e instanceof Error ? e.message : 'No quote.', 'bad'); } };
  return (
    <div className="page">
      <PageHead title="Numbers" sub="The numbers calls go out from, in your business's name. Tests and simulations keep working while a number waits for KYC." />
      <div className="stack">
        <Card><CardHead title="Your numbers" />
          <Async q={q} what="Numbers" tool="number.list" empty={d => d.rows.length === 0 ? <Empty title="No numbers yet" body="Verify your own phone to hear the first ring, then rent or connect a number for real campaigns." /> : null}>
            {d => <ul className="issues">{d.rows.map(n => { const [l, t] = STATUS[n.status] ?? [n.status, 'neutral' as const]; return (
              <li key={n.id}><div className="row" style={{ justifyContent: 'space-between' }}><h3 className="tnum">{fmtPhone(n.e164)}</h3><Chip tone={t}>{l}</Chip></div>
                <p className="small muted">{n.provider} · {n.kind === 'trial' ? 'Trial line' : n.kind === 'byo' ? 'Your own' : 'Rented'} · series {n.series}</p>
                {n.note && <p className="small">{n.note}</p>}<p className="small muted">Monthly: {n.monthlyMilli != null ? inr(n.monthlyMilli) : <NotMeasured>not set</NotMeasured>}</p></li>); })}</ul>}</Async></Card>
        <Card><CardHead title="Hear the first ring on your own phone" sub="Give a missed call to prove the number is yours. Then she rings you, as a test, from the trial line." />
          <div className="formgrid"><TextField label="Your phone" inputMode="tel" value={mine} onChange={e => setMine(e.target.value)} placeholder="+91 …" /></div>
          <div style={{ marginTop: 12 }}>{mine.replace(/\D/g, '').length >= 10 ? <Btn kind="primary" icon={<PhoneCall size={16} aria-hidden />} onClick={async () => { const r = await act<{ dialTo: string; expiresInS: number }>('number.verify_start', { phone: mine }, { quiet: true }); if (r.ok) setV(r.result); }}>Start verification</Btn> : <Btn disabled reason="Enter your 10-digit mobile number.">Start verification</Btn>}</div>
          {v && <p className="state" role="status" style={{ marginTop: 12 }}>Give a missed call to <strong className="tnum">{v.dialTo}</strong> within {Math.round(v.expiresInS / 60)} minutes. This page updates when it is seen.</p>}</Card>
        <Card><CardHead title="Get a number for real campaigns" sub="You see the price and the wait before you ask for anything." />
          <div className="formgrid"><SelectField label="How" value={kind} onChange={e => { setKind(e.target.value); setQuote(null); }}><option value="rent">Rent one from VP</option><option value="byo">Bring my own (Exotel, Plivo, Vobiz)</option></SelectField>
            <SelectField label="For what kind of calls" value={cat} onChange={e => { setCat(e.target.value); setQuote(null); }}><option value="service">Service</option><option value="transactional">Transactional</option><option value="promotional">Promotional</option></SelectField></div>
          <div style={{ marginTop: 12 }}><Btn onClick={getQuote}>See price and wait</Btn></div>
          {quote && <div className="state" style={{ marginTop: 12, textAlign: 'left', justifyItems: 'start' }}><p><strong>Price:</strong> {quote.priceMilli != null ? inr(quote.priceMilli) : <NotMeasured>not set yet</NotMeasured>}</p><p><strong>Wait:</strong> {quote.setupDays}</p><p className="small muted">{quote.note}</p>
            {kind === 'rent' && <Btn kind="primary" onClick={async () => { const r = await act('number.rent', { category: cat }, { describe: 'Number requested.' }); if (r.ok) refresh(); }}>Rent this number…</Btn>}</div>}</Card>
      </div>
    </div>
  );
}
