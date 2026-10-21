// Calls: search, and the call page: who spoke when (drawn from turn timing), the words you can click, what happened and why,
// the safety rules that acted, and what it cost. Outcomes carry their grade: confirmed by your system, by a person, or an AI guess.
import { useMemo, useRef, useState } from 'react';
import { Check, CircleX, Play } from 'lucide-react';
import { useApp, useData } from '../store.tsx';
import { Link, useQuery } from '../router.tsx';
import { Async, Btn, Card, CardHead, Chip, Empty, Kv, NotMeasured, PageHead, Table, Tabs, TextField, type Col } from '../ui.tsx';
import { callExplain, callGet, callSearch } from '../data.ts';
import { prettyCode } from './contacts.tsx';
import { prettyId } from '../catalog.ts';
import { clock, date, dur, inr, ms } from '../format.ts';
import type { CallDoc, CallExplain, CallRow } from '../types.ts';

const GRADE: Record<string, [string, 'leaf' | 'peacock' | 'marigold']> = { verified: ['Confirmed by your system', 'leaf'], manager: ['Confirmed by a person', 'peacock'], ai_guess: ['AI guess', 'marigold'] };
const outcomeChip = (o: string | null, g: string | null) => !o ? <NotMeasured>No outcome yet</NotMeasured> : <span className="row" style={{ gap: 6 }}><Chip>{prettyCode(o)}</Chip>{g && GRADE[g] && <Chip tone={GRADE[g][1]}>{GRADE[g][0]}</Chip>}</span>;

export default function Calls({ id }: { id?: string }) { return id ? <CallPage id={id} /> : <List />; }

function List() {
  const [qs, setQs] = useQuery();
  const [text, setText] = useState('');
  const view = qs.get('view') ?? '';
  const campaignId = qs.get('campaign') ?? '';
  const q = useData(['calls', campaignId, view], () => callSearch({ campaignId: campaignId || undefined, includeTest: view === 'test' }));
  const cols: Col<CallRow>[] = [
    { key: 'w', label: 'Who', primary: true, render: c => <>{c.contactName}{c.channel === 'test' && <> <Chip>Test</Chip></>}</> }, { key: 'o', label: 'Outcome', render: c => outcomeChip(c.outcome, c.grade) },
    { key: 'r', label: 'Why it ended', hideMobile: true, render: c => c.reasonLabel ?? <NotMeasured /> }, { key: 't', label: 'When', render: c => date(c.startedAt, true) },
    { key: 'd', label: 'Length', num: true, render: c => dur(c.durationS) }, { key: 'c', label: 'Cost', num: true, hideMobile: true, render: c => c.costMilli == null ? <NotMeasured /> : inr(c.costMilli, { paise: true }) },
  ];
  return (
    <div className="page">
      <PageHead title="Calls" sub="Every call, with what was said, why it ended, and what it cost. Practice calls are hidden unless you ask." />
      <Card>
        <Tabs label="Which calls" value={view} onChange={v => setQs({ view: v || null })} items={[{ id: '', label: 'Real calls' }, { id: 'test', label: 'With practice calls' }]} />
        <div className="filters"><TextField label="Filter by name" type="search" value={text} onChange={e => setText(e.target.value)} />{campaignId && <div className="field"><label>Campaign</label><div className="row"><Chip tone="peacock">One campaign</Chip><button type="button" className="btn btn-sm" onClick={() => setQs({ campaign: null })}>Clear</button></div></div>}</div>
        <Async q={q} what="Calls" tool="call.search" empty={d => d.length === 0 ? <Empty title="No calls yet" body="Once a campaign or a test dials, each call appears here with its words, reason and cost." /> : null}>
          {d => <Table caption="Calls" cols={cols} rows={d.filter(c => !text || c.contactName.toLowerCase().includes(text.toLowerCase()))} rowKey={r => r.id} onRow={r => `/calls/${r.id}`} />}</Async>
      </Card>
    </div>
  );
}

function CallPage({ id }: { id: string }) {
  const q = useData(['call', id], () => callGet(id));
  return <div className="page"><Async q={q} what="This call" tool="call.get" rows={6}>{c => <Body c={c} />}</Async></div>;
}

function Body({ c }: { c: CallDoc }) {
  const [qs] = useQuery();
  const t0 = Number(qs.get('t') ?? NaN);
  const [at, setAt] = useState<number>(Number.isFinite(t0) ? t0 * 1000 : 0);
  const turnRefs = useRef<Record<number, HTMLLIElement | null>>({});
  const current = c.turns.find(t => t.startMs != null && at >= t.startMs && at <= (t.endMs ?? t.startMs + 1))?.idx;
  const seek = (msv: number | null) => { if (msv == null) return; setAt(msv); const t = c.turns.find(x => x.startMs != null && msv >= x.startMs && msv <= (x.endMs ?? x.startMs + 1)); if (t) turnRefs.current[t.idx]?.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  const [why, setWhy] = useState<CallExplain | null>(null); const [whyBusy, setWhyBusy] = useState(false);
  const { toast } = useApp();
  const explain = async () => { setWhyBusy(true); try { setWhy(await callExplain(c.id)); } catch (e) { toast(e instanceof Error ? e.message : 'Could not explain.', 'bad'); } setWhyBusy(false); };
  const quotes = c.moments.filter(m => m.quote);
  const best = [...c.outcomes].sort((a, b) => ['verified', 'manager', 'ai_guess'].indexOf(a.grade) - ['verified', 'manager', 'ai_guess'].indexOf(b.grade))[0];

  return (
    <>
      <PageHead crumb={<><Link to="/calls">Calls</Link><span aria-hidden>/</span><span>{c.contactName}</span></>} title={c.contactName} pill={c.test ? <span className="pill">Practice call</span> : undefined}
        sub={<span className="tnum">{c.startedAt ? date(c.startedAt, true) : '—'} · {dur(c.durationS)} · {prettyCode(c.status)}</span>}
        actions={c.contactId ? <Link to={`/contacts/${c.contactId}`} className="btn" style={{ textDecoration: 'none' }}><span>Open the contact</span></Link> : undefined} />
      <div className="cols-main">
        <div className="stack">
          <Card aria-labelledby="player-h">
            <CardHead id="player-h" title="Who spoke when" sub={c.recordingUri ? 'A recording exists for this call. Playback is not built into this page yet.' : 'No recording is stored for this call. The bars are drawn from turn timing, not from audio.'} />
            {c.turns.length > 0 ? <Lanes c={c} at={at} onSeek={seek} /> : <Empty title="Nobody spoke" body="There is no transcript. The reason is in the outcome card." />}
          </Card>
          {c.turns.length > 0 && <Card aria-labelledby="tr-h"><CardHead id="tr-h" title="What was said" sub="Only what the caller actually heard. Click a line to mark it on the timeline." />
            <ol className="turns">{c.turns.map(t => (
              <li key={t.idx} ref={el => { turnRefs.current[t.idx] = el; }} className={`turn ${t.who}${current === t.idx ? ' now' : ''}`}>
                <button type="button" onClick={() => setAt(t.startMs ?? 0)} aria-label={`${t.who === 'agent' ? 'Agent' : 'Caller'}${t.startMs != null ? ` at ${clock(t.startMs / 1000)}` : ''}: mark here`}>
                  <span className="turn-who">{t.who === 'agent' ? 'Agent' : 'Caller'} {t.startMs != null && <span className="tnum muted">{clock(t.startMs / 1000)}</span>}</span>
                  <span className="turn-text" lang="hi">{t.text}</span>
                  <span className="turn-meta">{t.latencyMs ? <Chip title="Time from the caller finishing to her first audio">reply gap {ms(t.latencyMs)}</Chip> : null}{t.interrupted ? <Chip tone="marigold" title="Someone spoke over the other">cut-in</Chip> : null}</span>
                </button></li>))}</ol></Card>}
        </div>
        <div className="stack">
          <Card><CardHead title="What happened" />
            <p style={{ marginBottom: 8 }}>{c.reason?.label ?? (c.status === 'live' ? 'The call is still live.' : 'No reason has been recorded.')}</p>
            {c.reason && <p className="small muted">What you can do: {c.reason.action}.</p>}
            <div style={{ margin: '10px 0' }}>{outcomeChip(best?.value ?? c.outcome, best?.grade ?? null)}</div>
            {best?.grade === 'ai_guess' && <p className="small muted">An AI guess is not verified by your system or a person.</p>}
            {c.analysis && <p className="small muted">Analysis: {c.analysis.status.replace(/_/g, ' ')}.</p>}
            <div style={{ marginTop: 12 }}>{why ? <div className="why"><p><strong>{why.headline}</strong></p>{why.because.map((b, i) => { const ev = b.evidence as { quote?: string; atMs?: number | null }; return <p key={i} className="small">{b.point}{ev.quote && <> <button type="button" className="linklike" onClick={() => seek(ev.atMs ?? null)}>{ev.atMs != null ? clock(ev.atMs / 1000) : 'quote'}</button> <span lang="hi">“{ev.quote}”</span></>}</p>; })}{why.notes.map(n => <p key={n} className="small muted">{n}</p>)}</div> : <Btn size="sm" busy={whyBusy} onClick={explain}>Explain this call</Btn>}</div></Card>
          {quotes.length > 0 && <Card><CardHead title="In their words" /><ul className="quotes">{quotes.map((m, i) => <li key={i}><blockquote lang="hi">“{m.quote}”</blockquote><div className="row"><Chip>{prettyCode(m.kind)}</Chip>{m.atMs != null && <button type="button" className="btn btn-sm" onClick={() => seek(m.atMs)}><Play size={12} aria-hidden /><span>Mark {clock(m.atMs / 1000)}</span></button>}</div></li>)}</ul></Card>}
          <Card><CardHead title="Safety rules that acted" sub="Code, not the model, decides these." />
            {c.safety.length === 0 ? <p className="small"><Check size={16} aria-hidden style={{ verticalAlign: '-3px', color: 'var(--leaf)' }} /> No safety rule needed to act on this call.</p> :
              <ul className="trace">{c.safety.map(s => <li key={s.seq}><CircleX size={18} aria-hidden className="bad" /><div><strong>{prettyCode(s.rule)} {s.action.replace(/_/g, ' ')}</strong><p className="small muted">{s.detail}</p></div></li>)}</ul>}
            {c.handOffs.length > 0 && <p className="small" style={{ marginTop: 8 }}>Handed to {c.handOffs.map(h => h.destination).join(', ')}.</p>}
            {c.tools.length > 0 && <p className="small muted">Tools used: {c.tools.map(t => `${t.name} (${t.status})`).join(', ')}.</p>}</Card>
          <Card><CardHead title="What ran and what it cost" />
            <Kv rows={[['Ran', c.ran ? <span key="r"><code>{c.ran}</code><br /><span className="small muted">{prettyId(c.ran)}</span></span> : <NotMeasured key="r" />], ['Total', <strong key="t" className="tnum">{inr(c.costTotal, { paise: true })}</strong>], ['Settlement', c.settlement ? prettyCode(c.settlement) : <NotMeasured key="s" />]]} />
            {c.costLines.length > 0 && <><hr className="rule" /><Kv rows={c.costLines.map(l => [`${prettyCode(l.component)} · ${l.provider}`, inr(l.inr_milli, { paise: true })] as [string, string])} /></>}</Card>
        </div>
      </div>
    </>
  );
}

const MOMENT_COLOUR: Record<string, string> = { disclosure: 'var(--leaf)', objection: 'var(--marigold)', commitment: 'var(--leaf)', opt_out: 'var(--brick)', cut_in: 'var(--marigold)', hand_off: 'var(--peacock)' };
function Lanes({ c, at, onSeek }: { c: CallDoc; at: number; onSeek: (ms: number | null) => void }) {
  const W = 1000, H = 28;
  const x = (msv: number) => `${Math.min(100, (msv / c.totalMs) * 100)}%`;
  const spans = (who: 'caller' | 'agent') => c.turns.filter(t => t.who === who && t.startMs != null);
  const moments = useMemo(() => c.moments.filter(m => m.atMs != null).sort((a, b) => a.atMs! - b.atMs!), [c.moments]);
  return (
    <div className="lanes">
      <div className="lane-labels"><span className="lane-c">Caller</span><span className="lane-a">Agent</span></div>
      <div className="lane-wrap" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onSeek(((e.clientX - r.left) / r.width) * c.totalMs); }}>
        <svg viewBox={`0 0 ${W} ${H * 2 + 12}`} preserveAspectRatio="none" role="img" aria-label={`Two lanes over ${dur(c.totalMs / 1000)}: caller above, agent below, drawn from when each person spoke`}>
          {spans('caller').map(t => <rect key={t.idx} className="pk-c" x={(t.startMs! / c.totalMs) * W} width={Math.max(3, (((t.endMs ?? t.startMs! + 1500) - t.startMs!) / c.totalMs) * W)} y={4} height={H} rx="4" />)}
          <line x1="0" x2={W} y1={H + 6} y2={H + 6} className="pk-axis" />
          {spans('agent').map(t => <rect key={t.idx} className="pk-a" x={(t.startMs! / c.totalMs) * W} width={Math.max(3, (((t.endMs ?? t.startMs! + 1500) - t.startMs!) / c.totalMs) * W)} y={H + 10} height={H} rx="4" />)}
        </svg>
        <span className="playhead" style={{ left: x(at) }} aria-hidden />
        {moments.map((m, i) => <button key={i} type="button" className="pin" style={{ left: x(m.atMs!), background: MOMENT_COLOUR[m.kind] ?? 'var(--ink-2)' }} title={`${prettyCode(m.kind)} at ${clock(m.atMs! / 1000)}${m.note ? ': ' + m.note : ''}`} aria-label={`${prettyCode(m.kind)} at ${clock(m.atMs! / 1000)}`} onClick={e => { e.stopPropagation(); onSeek(m.atMs); }} />)}
      </div>
      <div className="lane-axis tnum"><span>0:00</span><span>{clock(c.totalMs / 2000)}</span><span>{clock(c.totalMs / 1000)}</span></div>
      {moments.length > 0 && <ul className="moments" aria-label="Moments in this call">{moments.map((m, i) => <li key={i}><button type="button" className="choice" onClick={() => onSeek(m.atMs)}><span className="dot" style={{ background: MOMENT_COLOUR[m.kind] ?? 'var(--ink-2)' }} aria-hidden /><span className="tnum">{clock(m.atMs! / 1000)}</span> {prettyCode(m.kind)}{m.note ? `: ${m.note}` : ''}</button></li>)}</ul>}
      <p className="small muted">Marked position {clock(at / 1000)} of {clock(c.totalMs / 1000)}.</p>
    </div>
  );
}
