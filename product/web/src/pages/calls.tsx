// Calls: search, and the call page where audio is the hero object: a two-lane waveform with moment pins, a transcript you can
// click (native script, romanised, English), quotes that play from the second they were said, the outcome and why, and a
// compliance trace of why this call was allowed.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CircleX, Pause, Play } from 'lucide-react';
import * as api from '../api.ts';
import { useApp, useTool } from '../store.tsx';
import { Link, useNav, useQuery } from '../router.tsx';
import { Async, Btn, Card, CardHead, Chip, Empty, Kv, NotMeasured, PageHead, Table, Tabs, TextField, type Col } from '../ui.tsx';
import { clock, count, date, dur, inr, ms, phone as fmtPhone } from '../format.ts';
import { OUTCOME_LABEL } from './contacts.tsx';
import { prettyId } from '../catalog.ts';
import type { CallDoc, CallRow } from '../types.ts';

const outcomeChip = (o: string) => <Chip tone={o === 'renewal_confirmed' ? 'leaf' : o === 'opted_out' || o === 'carrier_failed' ? 'brick' : o === 'callback_requested' || o === 'handed_off' ? 'peacock' : 'neutral'}>{OUTCOME_LABEL[o] ?? o}</Chip>;

export default function Calls({ id }: { id?: string }) { return id ? <CallPage id={id} /> : <List />; }

function List() {
  const [qs, setQs] = useQuery();
  const [text, setText] = useState(qs.get('q') ?? '');
  const outcome = qs.get('outcome') ?? ''; const campaign = qs.get('campaign') ?? '';
  useEffect(() => { const h = setTimeout(() => setQs({ q: text || null }), 300); return () => clearTimeout(h); }, [text]); // eslint-disable-line
  const q = useTool<{ rows: CallRow[]; total: number }>('call.search', { q: qs.get('q') ?? '', outcome: outcome || undefined, campaign: campaign || undefined });
  const cols: Col<CallRow>[] = [
    { key: 'w', label: 'Who', primary: true, render: c => c.contactName }, { key: 'o', label: 'Outcome', render: c => outcomeChip(c.outcome) },
    { key: 't', label: 'When', render: c => date(c.startedAt, true) }, { key: 'd', label: 'Length', num: true, render: c => dur(c.durationS) },
    { key: 'g', label: 'Reply gap', num: true, hideMobile: true, render: c => c.gapMs ? ms(c.gapMs) : <NotMeasured>None</NotMeasured> },
    { key: 'a', label: 'Agent', hideMobile: true, render: c => <>{c.agent} <span className="pill" style={{ margin: 0 }}>{c.version}</span></> },
    { key: 'c', label: 'Cost', num: true, hideMobile: true, render: c => c.costMilli == null ? <NotMeasured /> : inr(c.costMilli, { paise: true }) },
  ];
  const tabs = [['', 'All'], ['renewal_confirmed', 'Confirmed'], ['callback_requested', 'Callbacks'], ['failed', 'Failed'], ['opted_out', 'Opt-outs'], ['handed_off', 'Hand-offs']];
  return (
    <div className="page">
      <PageHead title="Calls" sub="Every call, with what was said, why it ended, and why it was allowed." />
      <Card>
        <Tabs label="Outcome" value={outcome} onChange={v => setQs({ outcome: v || null })} items={tabs.map(([id, label]) => ({ id, label }))} />
        <div className="filters"><TextField label="Search" type="search" value={text} onChange={e => setText(e.target.value)} placeholder="Name, phone or outcome" />{campaign && <div className="field"><label>Campaign</label><div className="row"><Chip tone="peacock">{campaign}</Chip><button type="button" className="btn btn-sm" onClick={() => setQs({ campaign: null })}>Clear</button></div></div>}</div>
        <Async q={q} what="Calls" tool="call.search" empty={d => d.rows.length === 0 ? <Empty title={outcome || qs.get('q') ? 'No calls match' : 'No calls yet'} body={outcome || qs.get('q') ? 'Clear a filter to see more.' : 'Once a campaign or a test dials, each call appears here with its transcript and reason.'} /> : null}>
          {d => <><p className="small muted" style={{ marginBottom: 8 }}>{count(d.total)} calls{d.total > d.rows.length && ` · latest ${d.rows.length}`}</p><Table caption="Calls" cols={cols} rows={d.rows} rowKey={r => r.id} onRow={r => `/calls/${r.id}`} /></>}</Async>
      </Card>
    </div>
  );
}

function CallPage({ id }: { id: string }) {
  const q = useTool<CallDoc>('call.get', { id });
  return <div className="page"><Async q={q} what="This call" tool="call.get" rows={6}>{c => <Body c={c} />}</Async></div>;
}

type View = 'native' | 'roman' | 'en';
function Body({ c }: { c: CallDoc }) {
  const [qs] = useQuery(); const go = useNav();
  const t0 = Number(qs.get('t') ?? NaN);
  const [at, setAt] = useState<number>(Number.isFinite(t0) ? t0 : 0);
  const [view, setView] = useState<View>('native');
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const turnRefs = useRef<Record<number, HTMLLIElement | null>>({});
  const current = c.turns.find(t => at >= t.t0 && at <= t.t1)?.i;
  useEffect(() => { if (current && turnRefs.current[current] && Number.isFinite(t0)) turnRefs.current[current]!.scrollIntoView({ block: 'center' }); }, []); // eslint-disable-line
  const seek = (s: number) => { setAt(s); if (audio.current) audio.current.currentTime = s; };
  const [why, setWhy] = useState<{ text: string; evidence: { atSec: number; quote: string }[] } | null>(null);
  const [whyBusy, setWhyBusy] = useState(false);
  const { toast } = useApp();
  const explain = async () => { setWhyBusy(true); try { setWhy(await api.run('call.explain', { id: c.id })); } catch (e) { toast(e instanceof Error ? e.message : 'Could not explain.', 'bad'); } setWhyBusy(false); };

  return (
    <>
      <PageHead crumb={<><Link to="/calls">Calls</Link><span aria-hidden>/</span><span>{c.contactName}</span></>} title={c.contactName} pill={<span className="pill">{c.agent} {c.version}</span>}
        sub={<span className="tnum">{fmtPhone(c.phone)} · {c.campaign} · {date(c.startedAt, true)} · {dur(c.durationS)}</span>}
        actions={<><Btn onClick={() => go(`/contacts/${c.id.replace('k_', 'ct_')}`)}>Open the contact</Btn></>} />
      <div className="cols-main">
        <div className="stack">
          <Card aria-labelledby="player-h">
            <CardHead id="player-h" title="Listen" sub={c.audioUrl ? undefined : 'No audio file is stored for this call, so there is nothing to play. The waveform and words are what was recorded.'} actions={c.audioUrl ? <Btn size="sm" icon={playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />} onClick={() => { const a = audio.current; if (!a) return; if (a.paused) { void a.play(); setPlaying(true); } else { a.pause(); setPlaying(false); } }}>{playing ? 'Pause' : 'Play'}</Btn> : undefined} />
            {c.audioUrl && <audio ref={audio} src={c.audioUrl} onTimeUpdate={e => setAt(e.currentTarget.currentTime)} onEnded={() => setPlaying(false)} preload="none" />}
            {c.totalSec > 0 ? <Lanes c={c} at={at} onSeek={seek} /> : <Empty title="No one picked up" body="There is no audio or transcript. The reason is in the outcome card." />}
          </Card>

          {c.turns.length > 0 && <Card aria-labelledby="tr-h"><CardHead id="tr-h" title="What was said" sub="Only what the caller actually heard. Click any line to jump there." actions={<Tabs label="Transcript view" value={view} onChange={setView} items={[{ id: 'native', label: 'Native script' }, { id: 'roman', label: 'Romanised' }, { id: 'en', label: 'English' }]} />} />
            <ol className="turns">{c.turns.map(t => (
              <li key={t.i} ref={el => { turnRefs.current[t.i] = el; }} className={`turn ${t.who}${current === t.i ? ' now' : ''}`}>
                <button type="button" onClick={() => seek(t.t0)} aria-label={`${t.who === 'agent' ? c.agent : 'Caller'} at ${clock(t.t0)}: jump here`}>
                  <span className="turn-who">{t.who === 'agent' ? c.agent : 'Caller'} <span className="tnum muted">{clock(t.t0)}</span></span>
                  <span className="turn-text" lang={view === 'en' ? 'en' : view === 'roman' ? 'hi-Latn' : 'hi'}>{(view === 'native' ? t.text : view === 'roman' ? t.roman : t.en) ?? t.text}</span>
                  <span className="turn-meta">{t.gapMs ? <Chip title="Time from the caller finishing to her first audio">gap {ms(t.gapMs)}</Chip> : null}{t.cutIn ? <Chip tone="marigold" title="The caller spoke while she was speaking">cut-in</Chip> : null}</span>
                </button></li>))}</ol></Card>}
        </div>

        <div className="stack">
          <Card><CardHead title="Outcome" />
            <div className="row">{outcomeChip(c.outcomeDetail.key)}{c.outcomeDetail.carrierCode && <Chip tone="brick">Carrier {c.outcomeDetail.carrierCode}</Chip>}</div>
            <p style={{ margin: '10px 0' }}>{c.summary}</p>
            <p className="small muted">Reason: {c.outcomeDetail.reason}. This is what the call showed; your own system confirms the real outcome.</p>
            <div style={{ marginTop: 12 }}>{why ? <div className="why"><p>{why.text}</p>{why.evidence.map(e => <p key={e.atSec} className="small" lang="hi"><button type="button" className="linklike" onClick={() => seek(e.atSec)}>{clock(e.atSec)}</button> “{e.quote}”</p>)}</div> : <Btn size="sm" busy={whyBusy} onClick={explain}>Explain this call</Btn>}</div></Card>
          {c.quotes.length > 0 && <Card><CardHead title="In their words" /><ul className="quotes">{c.quotes.map(q => <li key={q.atSec}><blockquote lang="hi">“{q.text}”</blockquote><div className="row"><Chip>{q.tag}</Chip><button type="button" className="btn btn-sm" onClick={() => seek(q.atSec)}><Play size={12} aria-hidden /><span>Play from {clock(q.atSec)}</span></button></div></li>)}</ul></Card>}
          <Card><CardHead title="Why this call was allowed" sub="The checks that ran before it dialled." /><ul className="trace">{c.trace.map(t => <li key={t.label}>{t.ok ? <Check size={18} aria-hidden className="ok" /> : <CircleX size={18} aria-hidden className="bad" />}<div><strong>{t.label}</strong><span className="sr">{t.ok ? ': passed' : ': failed'}</span><p className="small muted">{t.detail}</p></div></li>)}</ul></Card>
          {c.memoryUsed.length > 0 && <Card><CardHead title="Used from memory" /><div className="row">{c.memoryUsed.map(m => <button key={m.text} type="button" className="choice" onClick={() => seek(m.atSec)}>{m.text}</button>)}</div></Card>}
          {c.mood && <Card><CardHead title="Mood path" sub="Signals, not a diagnosis. Not yet calibrated against human labels." /><ol className="mood">{c.mood.map(m => <li key={m.atSec}><span className="tnum muted">{clock(m.atSec)}</span> {m.label}</li>)}</ol></Card>}
          <Card><CardHead title="What ran and what it cost" />
            <Kv rows={[['Ran', <code key="r">{c.ran}</code>], ['Stack', prettyId(c.ran)], ['Average reply gap', c.gapMs ? ms(c.gapMs) : <NotMeasured />], ['Total', c.costMilli == null ? <NotMeasured /> : inr(c.costMilli, { paise: true })]]} />
            {c.cost ? <><hr className="rule" /><Kv rows={[['Telephony', inr(c.cost.telephonyMilli, { paise: true })], ['Voice', inr(c.cost.voiceMilli, { paise: true })], ['Brain', inr(c.cost.brainMilli, { paise: true })], ['Ears', inr(c.cost.earsMilli, { paise: true })]]} /><p className="small muted">{c.cost.basis}</p></> : <p className="small muted" style={{ marginTop: 8 }}>No connected time, so no split.</p>}</Card>
        </div>
      </div>
    </>
  );
}

const MOMENT_COLOUR: Record<string, string> = { disclosure: 'var(--leaf)', objection: 'var(--marigold)', commitment: 'var(--leaf)', optout: 'var(--brick)', cutin: 'var(--marigold)', handoff: 'var(--peacock)' };
const MOMENT_LABEL: Record<string, string> = { disclosure: 'Disclosure', objection: 'Objection', commitment: 'Commitment', optout: 'Opt-out', cutin: 'Cut-in', handoff: 'Hand-off' };
function Lanes({ c, at, onSeek }: { c: CallDoc; at: number; onSeek: (s: number) => void }) {
  const W = 1000, H = 64, n = c.peaks.caller.length;
  const bars = (p: number[], y0: number, dir: 1 | -1, cls: string) => p.map((v, i) => <rect key={i} className={cls} x={(i / n) * W + 1} width={W / n - 2} y={dir === 1 ? y0 : y0 - v * (H / 2 - 4)} height={Math.max(1.5, v * (H / 2 - 4))} rx="1.5" />);
  const x = (s: number) => `${Math.min(100, (s / c.totalSec) * 100)}%`;
  return (
    <div className="lanes">
      <div className="lane-labels"><span className="lane-c">Caller</span><span className="lane-a">{c.agent}</span></div>
      <div className="lane-wrap" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onSeek(((e.clientX - r.left) / r.width) * c.totalSec); }}>
        <svg viewBox={`0 0 ${W} ${H * 2 + 8}`} preserveAspectRatio="none" role="img" aria-label={`Two-lane waveform of a ${dur(c.totalSec)} call: caller above, ${c.agent} below`}>
          {bars(c.peaks.caller, H, -1, 'pk-c')}<line x1="0" x2={W} y1={H + 4} y2={H + 4} className="pk-axis" />{bars(c.peaks.agent, H + 8, 1, 'pk-a')}
        </svg>
        <span className="playhead" style={{ left: x(at) }} aria-hidden />
        {c.moments.map(m => <button key={m.atSec + m.kind} type="button" className="pin" style={{ left: x(m.atSec), background: MOMENT_COLOUR[m.kind] }} title={`${MOMENT_LABEL[m.kind]} at ${clock(m.atSec)}: ${m.label}`} aria-label={`${MOMENT_LABEL[m.kind]} at ${clock(m.atSec)}: ${m.label}`} onClick={e => { e.stopPropagation(); onSeek(m.atSec); }} />)}
      </div>
      <div className="lane-axis tnum"><span>0:00</span><span>{clock(c.totalSec / 2)}</span><span>{clock(c.totalSec)}</span></div>
      <ul className="moments" aria-label="Moments in this call">{[...c.moments].sort((a, b) => a.atSec - b.atSec).map(m => <li key={m.atSec + m.kind}><button type="button" className="choice" onClick={() => onSeek(m.atSec)}><span className="dot" style={{ background: MOMENT_COLOUR[m.kind] }} aria-hidden /><span className="tnum">{clock(m.atSec)}</span> {m.label}</button></li>)}</ul>
      <p className="small muted">Position {clock(at)} of {clock(c.totalSec)}.</p>
    </div>
  );
}
