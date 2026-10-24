// Hand-offs: the people she handed to a person, crisis first, then callbacks by the time the caller asked. Each shows her
// warm brief (why, and a one-line summary of the call) and who has it. Taking one makes it yours; you close it.
import { useState } from 'react';
import { run } from '../api.ts';
import { useApp, useData } from '../store.tsx';
import { Link } from '../router.tsx';
import { Async, Btn, Card, CardHead, Chip, Empty, PageHead, Segmented } from '../ui.tsx';
import { ago, date } from '../format.ts';

export interface HandOff {
  id: string; conversationId: string | null; status: string; crisis: boolean; test: boolean; kind: string; kindText: string; reason: string; brief: string | null;
  due: { at: string | null; stated: string | null; text: string } | null; contact: { id: string; name: string } | null; campaign: { id: string; name: string } | null;
  claimedBy: { id: string; name: string } | null; resolution: string | null; createdAt: string;
}

export default function HandOffs() {
  const [show, setShow] = useState<'open' | 'done'>('open');
  const q = useData(['handoffs', show], () => run<{ items: HandOff[]; open: number; crisisOpen: number }>('handoff.list', { status: show }));
  return <div className="page">
    <PageHead title="Hand-offs" sub="People she handed to a person. A crisis comes first, then callbacks by the time the caller asked." />
    <Segmented label="Show" value={show} onChange={setShow} options={[{ value: 'open' as const, label: 'Waiting' }, { value: 'done' as const, label: 'Closed' }]} />
    <Async q={q} what="Hand-offs" tool="handoff.list">{d => d.items.length === 0
      ? <Empty title={show === 'open' ? 'Nobody is waiting for a person' : 'Nothing closed yet'} body="When she hands a call to a person (they ask for one, a complaint, a callback, a crisis), it shows here with her summary." />
      : <div className="stack">{d.items.map(h => <HandOffCard key={h.id} h={h} onChange={q.reload} />)}</div>}</Async>
  </div>;
}

export function HandOffCard({ h, onChange }: { h: HandOff; onChange: () => void }) {
  const { act, me } = useApp();
  const mine = h.claimedBy?.id === me?.member?.id;
  return <Card><CardHead title={h.contact?.name ?? 'A caller'} sub={`${h.reason} · ${h.kindText} · ${ago(h.createdAt)}`} />
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      {h.crisis && <Chip tone="brick">Crisis: needs a person now</Chip>}
      {h.test && <Chip>Practice call</Chip>}
      {h.claimedBy ? <Chip tone="leaf">{mine ? 'You have it' : `${h.claimedBy.name} has it`}</Chip> : h.status === 'queued' ? <Chip tone="marigold">Not taken yet</Chip> : null}
      {h.resolution && <Chip>{({ reached: 'Reached them', no_answer: 'No answer', not_needed: 'No longer needed' } as Record<string, string>)[h.resolution]}</Chip>}
    </div>
    {h.brief && <blockquote style={{ marginTop: 8 }}>{h.brief}</blockquote>}
    {h.due && <p className="small" style={{ marginTop: 8 }}><strong>Call back {h.due.at ? date(h.due.at, true) : 'as soon as you can'}.</strong> {h.due.stated ? h.due.text : ''}</p>}
    <div className="row" style={{ marginTop: 12, gap: 8 }}>
      {h.conversationId && <Link to={`/calls/${h.conversationId}`} className="btn btn-sm" style={{ textDecoration: 'none' }}>Open the call</Link>}
      {h.contact && <Link to={`/contacts/${h.contact.id}`} className="btn btn-sm" style={{ textDecoration: 'none' }}>Open the person</Link>}
      {h.status === 'queued' && <Btn size="sm" kind="primary" onClick={async () => { const r = await act('handoff.claim', { handOffId: h.id }, { describe: 'It is yours now.' }); if (r.ok) onChange(); }}>Take it</Btn>}
      {h.status === 'claimed' && mine && <>
        <Btn size="sm" onClick={async () => { const r = await act('handoff.resolve', { handOffId: h.id, resolution: 'reached' }, { describe: 'Closed: reached them.' }); if (r.ok) onChange(); }}>Reached them</Btn>
        <Btn size="sm" onClick={async () => { const r = await act('handoff.resolve', { handOffId: h.id, resolution: 'no_answer' }, { describe: 'Closed: no answer.' }); if (r.ok) onChange(); }}>No answer</Btn>
        <Btn size="sm" onClick={async () => { const r = await act('handoff.resolve', { handOffId: h.id, resolution: 'not_needed' }, { describe: 'Closed.' }); if (r.ok) onChange(); }}>No longer needed</Btn></>}
    </div>
  </Card>;
}
