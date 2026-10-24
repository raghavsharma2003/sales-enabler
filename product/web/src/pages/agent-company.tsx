// An agent's Company information: which offerings she draws on, and every fact in them with whether she may say it on her
// calls, and why not (an offer on a service call, a safety rule, a passage no longer approved). Linking saves to the
// draft at once, as the voice stack does. Loaded only when the tab is opened.
import { useState } from 'react';
import { run } from '../api.ts';
import { useApp, useData } from '../store.tsx';
import { Async, Btn, Card, CardHead, Chip, Empty } from '../ui.tsx';
import { Link } from '../router.tsx';
import { place } from '../why-said.tsx';

interface SayableFact { offering: string; text: string; purpose: string; onCalls: boolean; why: string | null; source: { sourceTitle: string; location: Record<string, unknown>; quote: string } | null }
interface Knowledge { category: string; offerings: { id: string; name: string; facts: number; linked: boolean }[]; facts: SayableFact[]; onCalls: number; rule: string }
export interface Linked { offeringIds: string[]; purposes?: string[] }
const MAX_LINKED = 5;

export default function AgentCompany({ agentId, linked, onLinked }: { agentId: string; linked: Linked | undefined; onLinked: (k: Linked) => void }) {
  const { act } = useApp();
  const q = useData<Knowledge>(['agent-knowledge', agentId, linked?.offeringIds], async () => run<Knowledge>('agent.knowledge', { agentId }));
  const [busy, setBusy] = useState<string | null>(null);
  // The box shows the choice at once; the server's answer replaces it (a refusal puts it back).
  const [want, setWant] = useState<Record<string, boolean>>({});
  const toggle = async (id: string, on: boolean, current: string[]) => {
    const ids = current;                             // what the boxes show now, not the draft as last loaded
    const next: Linked = { ...(linked?.purposes ? { purposes: linked.purposes } : {}), offeringIds: on ? [...ids.filter(x => x !== id), id] : ids.filter(x => x !== id) };
    setBusy(id); setWant(w => ({ ...w, [id]: on }));
    const r = await act('brief.edit', { agentId, patch: [{ op: 'set', path: 'knowledge', value: next }] }, { quiet: true });
    setBusy(null);
    if (r.ok) onLinked(next); else setWant(w => { const n = { ...w }; delete n[id]; return n; });
  };
  return (
    <Async q={q} what="Company information" tool="agent.knowledge" rows={4}>{k => {
      const current = k.offerings.filter(o => want[o.id] ?? o.linked).map(o => o.id);
      const n = current.length;
      const say = k.facts.filter(f => f.onCalls), off = k.facts.filter(f => !f.onCalls);
      return (
        <div className="stack">
          <Card><CardHead title="What she draws on" sub={<>Link the offerings this agent talks about. She states only approved facts from them. Add and approve facts in <Link to="/settings/knowledge">Settings, Company information</Link>.</>} />
            {k.offerings.length === 0 ? <Empty title="No offerings yet" body="Read your website or import your price sheet, then approve the facts she may say." action={<Link to="/settings/knowledge">Add company information</Link>} />
              : <fieldset className="chipset" style={{ margin: 0 }}><legend className="sr">Offerings this agent draws on</legend>
                {k.offerings.map(o => {
                  const on = want[o.id] ?? o.linked, full = !on && n >= MAX_LINKED;
                  return <label key={o.id} className={`choice${on ? ' on' : ''}`} title={full ? `At most ${MAX_LINKED} offerings per agent` : undefined}>
                    <input type="checkbox" checked={on} disabled={full || busy !== null} onChange={() => void toggle(o.id, !on, current)} />{o.name} <span className="tnum">({o.facts} fact{o.facts === 1 ? '' : 's'})</span></label>;
                })}</fieldset>}
            {n >= MAX_LINKED && <p className="small muted">{MAX_LINKED} offerings is the most one agent can draw on.</p>}
            <p className="small muted" style={{ marginTop: 8 }}>{k.rule}</p></Card>
          {k.facts.length > 0 && <Card><CardHead title={`She may say ${say.length} of ${k.facts.length} facts`} sub={`This agent makes ${k.category} calls. Facts kept off her calls say why.`} />
            {say.length > 0 && <ul className="cd-facts" aria-label="Facts she may say">{say.map((f, i) => <SayRow key={i} f={f} />)}</ul>}
            {off.length > 0 && <><h4 style={{ margin: '16px 0 8px' }}>Not on her calls</h4><ul className="cd-facts" aria-label="Facts kept off her calls">{off.map((f, i) => <SayRow key={i} f={f} />)}</ul></>}
          </Card>}
        </div>
      );
    }}</Async>
  );
}

function SayRow({ f }: { f: SayableFact }) {
  return (
    <li className="cd-fact"><div className="cd-body">
      <p lang="hi">{f.onCalls ? <Chip tone="leaf">She may say</Chip> : <Chip tone="marigold">Not on her calls</Chip>} {f.text}</p>
      <p className="small muted">In “{f.offering}”{f.source ? <> · from {place(f.source)}</> : null}</p>
      {f.why && <p className="small">{f.why}</p>}
      {f.source && <details><summary>Show the passage</summary><blockquote lang="hi">{f.source.quote}</blockquote></details>}
    </div></li>
  );
}
