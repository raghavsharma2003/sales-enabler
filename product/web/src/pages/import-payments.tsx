// Payment status from the business's own gateway (Razorpay, Cashfree, PayU), loaded as its own chunk. Each connected
// gateway posts signed webhooks; a payment that matches one person's record key (a policy, loan or order id) stops calls to
// them until a newer list arrives, and can mark their recent call as a verified outcome. Read only: nothing is charged.
import { useState } from 'react';
import { useApp, useData } from '../store.tsx';
import { Link } from '../router.tsx';
import { Async, Btn, Card, CardHead, Empty, SelectField, TextField } from '../ui.tsx';
import { outcomeDefs, paymentGateways, paymentSources, type PayRow, type PaySource } from '../data.ts';
import { date, inr } from '../format.ts';

const LABEL = { razorpay: 'Razorpay', cashfree: 'Cashfree', payu: 'PayU' } as const;
const STATUS: Record<PayRow['status'], string> = { matched: 'Matched', unmatched: 'No record has this reference', ambiguous: 'More than one person has this reference' };

export default function PaymentStatus() {
  const gateways = useData('pay-gateways', paymentGateways);
  const sources = useData('pay-sources', paymentSources);
  return (
    <div className="stack">
      <Async q={gateways} what="Payment gateways" tool="integration.list" rows={2}>{gs => gs.length === 0
        ? <Card><Empty title="No payment gateway is connected" body="Connect Razorpay, Cashfree or PayU in Settings. Then payments your customers make stop calls to them, so nobody is called about a bill they already paid."
            action={<Link to="/settings/integrations">Go to Integrations</Link>} /></Card>
        : <Async q={sources} what="Payment status" tool="source.payments.list" rows={2}>{d => <>
            {gs.map(g => <Setup key={g.id} gateway={g} source={d.sources.find(s => s.integrationId === g.id)} onSaved={sources.reload} />)}
            <Recent rows={d.payments} />
          </>}</Async>}</Async>
    </div>
  );
}

function Setup({ gateway, source, onSaved }: { gateway: { id: string; name: string; kind: keyof typeof LABEL }; source?: PaySource; onSaved: () => void }) {
  const { act } = useApp();
  const defs = useData('outcome-defs', outcomeDefs);
  const [key, setKey] = useState(source?.matchKeys.join(', ') ?? '');
  const [outcome, setOutcome] = useState('');
  const save = async () => {
    const [definitionId, value] = outcome ? outcome.split('|') : [];
    const r = await act('source.payments.setup', { integrationId: gateway.id, matchKeys: key.split(',').map(k => k.trim()).filter(Boolean), ...(definitionId ? { outcome: { definitionId, value } } : {}) }, { describe: 'Payment status is on.' });
    if (r.ok) onSaved();
  };
  const url = `${location.origin}/hooks/payments/${gateway.id}`;
  return (
    <Card><CardHead title={`${LABEL[gateway.kind]}: ${gateway.name}`} sub={source ? `On. A payment matched on ${source.matchKeys.join(' or ')} stops calls to that person until a newer list of them is imported.` : 'Not on yet. Choose which contact detail its payments carry.'} />
      <div className="formgrid">
        <TextField label="Contact detail the payment carries" value={key} onChange={e => setKey(e.target.value)} placeholder="Policy number"
          hint="As its column was named in your list: the policy, loan or order id you also send to the gateway (reference id, receipt, notes, order tags or udf). Never the payer's phone, which is often someone else." />
        <Async q={defs} what="Outcomes" tool="outcome.list" rows={1}>{ds => (
          <SelectField label="Also mark their recent call (optional)" value={outcome} onChange={e => setOutcome(e.target.value)} hint="Their latest call in the 14 days before paying gets this as a verified outcome.">
            <option value="">Do not mark calls</option>{ds.flatMap(d => d.allowedValues.map(v => <option key={`${d.id}|${v}`} value={`${d.id}|${v}`}>{d.name}: {v}</option>))}</SelectField>)}</Async>
      </div>
      <div className="row" style={{ marginTop: 12 }}>{key.trim() ? <Btn kind="primary" onClick={() => void save()}>{source ? 'Save' : 'Turn on'}</Btn> : <Btn disabled fix={null} reason="Name the contact detail first.">Turn on</Btn>}</div>
      {source && <p className="hint">In {LABEL[gateway.kind]}, add this webhook for successful payments: <code className="mono">{url}</code>. Deliveries are checked with {LABEL[gateway.kind]}'s own signature; anything else is refused.</p>}
    </Card>
  );
}

function Recent({ rows }: { rows: PayRow[] }) {
  return (
    <Card><CardHead title="Payments in the last 30 days" sub="Each one, and whether it matched a person. Unmatched ones are kept 30 days so you can see why." />
      {rows.length === 0 ? <p className="hint">None yet.</p> : <ul className="facts">{rows.map((p, k) => (
        <li key={k}><div className="row" style={{ justifyContent: 'space-between' }}><strong>{p.name ?? p.reference ?? 'Payment'}</strong><span className="small muted tnum">{p.amountInrMilli != null ? inr(p.amountInrMilli) : ''} · {LABEL[p.provider]} · {date(p.paidAt, true)}</span></div>
          <span className="small muted">{STATUS[p.status]}{p.reference ? ` (${p.reference})` : ''}{p.outcome ? p.outcome.recorded ? '. Their call is marked.' : `. Call not marked: ${p.outcome.why}.` : ''}</span></li>))}</ul>}
    </Card>
  );
}
