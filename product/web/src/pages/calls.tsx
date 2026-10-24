// Calls: search, and the call page: who spoke when (drawn from turn timing), the words you can click, what happened and why,
// the safety rules that acted, and what it cost. Outcomes carry their grade: confirmed by your system, by a person, or an AI guess.
import { useMemo, useRef, useState } from 'react';
import { Check, CircleX, Info, Play } from 'lucide-react';
import { useApp, useData } from '../store.tsx';
import { Link, useQuery } from '../router.tsx';
import { Async, Btn, Card, CardHead, Chip, Empty, Kv, NotMeasured, PageHead, SelectField, Table, Tabs, TextField, type Col, scrollMotion } from '../ui.tsx';
import { callExplain, callGet, callSearch, campaignList } from '../data.ts';
import { prettyCode } from './contacts.tsx';
import { costPart, RULE_LABEL } from '../labels.ts';
import { voiceStackOf } from '../catalog.ts';
import { DID, SHORT, TimingCard, marksFor, playable } from './call-review.tsx';
import { clock, date, dur, inr, ms } from '../format.ts';
import type { CallDoc, CallExplain, CallRow } from '../types.ts';

const GRADE: Record<string, [string, 'leaf' | 'peacock' | 'marigold']> = { verified: ['Confirmed by your system', 'leaf'], manager: ['Confirmed by a person', 'peacock'], ai_guess: ['AI guess', 'marigold'] };
const outcomeChip = (o: string | null, g: string | null) => !o ? <NotMeasured>No outcome yet</NotMeasured> : <span className="row" style={{ gap: 6 }}><Chip>{prettyCode(o)}</Chip>{g && GRADE[g] && <Chip tone={GRADE[g][1]}>{GRADE[g][0]}</Chip>}</span>;

export default function Calls({ id }: { id?: string }) { return id ? <CallPage id={id} /> : <List />; }

function List() {
  const [qs, setQs] = useQuery();
  const [text, setText] = useState(''); const [why, setWhy] = useState('');
  const camps = useData('campaign-names', campaignList);
  const campName = (id: string | null) => (id && camps.data?.find(x => x.id === id)?.name) || null;
  const view = qs.get('view') ?? '';
  const campaignId = qs.get('campaign') ?? '';
  const q = useData(['calls', campaignId, view], () => callSearch({ campaignId: campaignId || undefined, includeTest: view === 'test' }));
  const cols: Col<CallRow>[] = [
    { key: 'w', label: 'Who', primary: true, render: c => <>{c.contactName}{c.channel === 'test' && <> <Chip>Test</Chip></>}</> }, { key: 'o', label: 'Outcome', render: c => outcomeChip(c.outcome, c.grade) },
    { key: 'p', label: 'Campaign', render: c => campName(c.campaignId) ?? <span className="muted">{c.channel === 'test' ? 'Practice' : 'None'}</span> },
    { key: 'r', label: 'Why it ended', render: c => c.reasonLabel ?? <NotMeasured /> }, { key: 't', label: 'When', render: c => date(c.startedAt, true) },
    { key: 'd', label: 'Length', num: true, render: c => dur(c.durationS) }, { key: 'c', label: 'Cost', num: true, render: c => c.costMilli == null ? <NotMeasured /> : inr(c.costMilli, { paise: true }) },
  ];
  return (
    <div className="page">
      <PageHead title="Calls" sub="Every call, with what was said, why it ended, and what it cost. Practice calls are hidden unless you ask." />
      <Card>
        <Tabs label="Which calls" value={view} onChange={v => setQs({ view: v || null })} items={[{ id: '', label: 'Real calls' }, { id: 'test', label: 'With practice calls' }]} />
        <div className="filters"><TextField label="Filter by name" type="search" value={text} onChange={e => setText(e.target.value)} />
          {q.data && q.data.length > 0 && <SelectField label="Why it ended" value={why} onChange={e => setWhy(e.target.value)}><option value="">Any reason</option>{[...new Set(q.data.map(c => c.reasonLabel).filter((x): x is string => !!x))].sort().map(r => <option key={r} value={r}>{r}</option>)}</SelectField>}{campaignId && <div className="field"><label>Campaign</label><div className="row"><Chip tone="peacock">One campaign</Chip><button type="button" className="btn btn-sm" onClick={() => setQs({ campaign: null })}>Clear</button></div></div>}</div>
        <Async q={q} what="Calls" tool="call.search" empty={d => d.length === 0 ? <Empty title="No calls yet" body="Once a campaign or a test dials, each call appears here with its words, reason and cost." /> : null}>
          {d => <Table caption="Calls" cols={cols} rows={d.filter(c => (!text || c.contactName.toLowerCase().includes(text.toLowerCase())) && (!why || c.reasonLabel === why))} rowKey={r => r.id} onRow={r => `/calls/${r.id}`} />}</Async>
      </Card>
    </div>
  );
}

function CampaignName({ id }: { id: string }) {
  const camps = useData('campaign-names', campaignList);
  const name = camps.data?.find(x => x.id === id)?.name;
  return <Link to={`/campaigns/${id}`}>{name ?? 'Its campaign'}</Link>;
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
  const audio = useRef<HTMLAudioElement | null>(null);
  const marks = useMemo(() => marksFor(c), [c]);
  const [audioFailed, setAudioFailed] = useState(false);
  const canPlay = playable(c.recordingUri) && !audioFailed;
  const current = c.turns.find(t => t.startMs != null && at >= t.startMs && at <= (t.endMs ?? t.startMs + 1))?.idx;
  const seek = (msv: number | null) => { if (msv == null) return; setAt(msv); if (audio.current) audio.current.currentTime = msv / 1000; const t = c.turns.find(x => x.startMs != null && msv >= x.startMs && msv <= (x.endMs ?? x.startMs + 1)); if (t) turnRefs.current[t.idx]?.scrollIntoView({ block: 'center', behavior: scrollMotion() }); };
  const [why, setWhy] = useState<CallExplain | null>(null); const [whyBusy, setWhyBusy] = useState(false);
  const { toast } = useApp();
  const explain = async () => { setWhyBusy(true); try { setWhy(await callExplain(c.id)); } catch (e) { toast(e instanceof Error ? e.message : 'Could not explain.', 'bad'); } setWhyBusy(false); };
  const quotes = c.moments.filter(m => m.quote);
  const best = [...c.outcomes].sort((a, b) => ['verified', 'manager', 'ai_guess'].indexOf(a.grade) - ['verified', 'manager', 'ai_guess'].indexOf(b.grade))[0];

  return (
    <>
      <PageHead crumb={<><Link to="/calls">Calls</Link><span aria-hidden>/</span><span>{c.contactName}</span></>} title={c.contactName} pill={c.test ? <span className="pill">Practice call</span> : undefined}
        sub={<span className="tnum">{c.startedAt ? date(c.startedAt, true) : '—'} · {dur(c.durationS)} · {prettyCode(c.status)}{c.campaignId && <> · <CampaignName id={c.campaignId} /></>}</span>}
        actions={c.contactId ? <Link to={`/contacts/${c.contactId}`} className="btn" style={{ textDecoration: 'none' }}><span>Open the contact</span></Link> : undefined} />
      <div className="cols-main">
        <div className="stack">
          <Card aria-labelledby="player-h">
            <CardHead id="player-h" title="Who spoke when" sub={canPlay ? 'Play the recording, or select a line below to jump to it. The line being played is highlighted.' : audioFailed ? 'The voice server did not return this recording (it may have been removed, or the link expired: reload to try again). The bars are drawn from turn timing.' : c.recordingUri ? `${c.recordingWhy ?? 'A recording exists, but this page cannot open it.'} The bars are drawn from turn timing.` : 'No recording is stored for this call. The bars are drawn from turn timing, not from audio.'} />
            {canPlay && <audio ref={audio} className="callaudio" controls preload="metadata" src={c.recordingUri!} aria-label="Call recording" onError={() => setAudioFailed(true)} onTimeUpdate={e => setAt(e.currentTarget.currentTime * 1000)} onSeeked={e => setAt(e.currentTarget.currentTime * 1000)} />}
            {c.turns.length > 0 ? <Lanes c={c} at={at} onSeek={seek} /> : <Empty title="Nobody spoke" body="There is no transcript. The reason is in the outcome card." />}
          </Card>
          {c.turns.length > 0 && <Card><TimingCard c={c} onSeek={t => { setAt(t.startMs ?? 0); turnRefs.current[t.idx]?.scrollIntoView({ block: 'center', behavior: scrollMotion() }); }} /></Card>}
          {c.transcriptWhy && <Card aria-labelledby="tr-gone-h"><CardHead id="tr-gone-h" title="What was said" sub={c.transcriptWhy} /></Card>}
          {c.turns.length > 0 && !c.transcriptWhy && <Card aria-labelledby="tr-h"><CardHead id="tr-h" title="What was said" sub="Only what the caller actually heard. Select a line to mark it on the timeline." />
            <ol className="turns">{c.turns.map(t => (
              <li key={t.idx} ref={el => { turnRefs.current[t.idx] = el; }} className={`turn ${t.who}${current === t.idx ? ' now' : ''}`}>
                <button type="button" onClick={() => { setAt(t.startMs ?? 0); if (audio.current && t.startMs != null) { audio.current.currentTime = t.startMs / 1000; void audio.current.play().catch(() => {}); } }} aria-label={`${t.who === 'agent' ? 'Agent' : 'Caller'}${t.startMs != null ? ` at ${clock(t.startMs / 1000)}` : ''}: ${canPlay ? 'play from here' : 'mark here'}`}>
                  <span className="turn-who">{t.who === 'agent' ? 'Agent' : 'Caller'} {t.startMs != null && <span className="tnum muted">{clock(t.startMs / 1000)}</span>}</span>
                  <span className="turn-text" lang="hi">{t.text}</span>
                  <span className="turn-meta">{t.latencyMs ? <Chip title="Time from the caller finishing to her first audio, as the voice runtime measured it">reply gap {ms(t.latencyMs)}</Chip> : t.who === 'agent' && c.turns.slice(0, c.turns.indexOf(t)).some(x => x.who === 'caller') ? <Chip title="The voice runtime recorded no timing for this reply">gap not recorded</Chip> : null}{t.interrupted ? <Chip tone="marigold" title="Someone spoke over the other">cut-in</Chip> : null}{(marks.get(t.idx) ?? []).map((m, k) => <Chip key={k} tone={m.kind === 'disclosure' ? 'leaf' : m.kind === 'no-disclosure' ? 'marigold' : m.kind === 'optout' ? 'brick' : 'peacock'} title={m.title}>{m.text}</Chip>)}</span>
                </button></li>))}</ol></Card>}
        </div>
        <div className="stack">
          <Card><CardHead title="What happened" />
            <p style={{ marginBottom: 8 }}>{c.reason?.label ?? (c.status === 'live' ? 'The call is still live.' : 'No reason has been recorded.')}</p>
            {c.reason && <p className="small muted">{c.reason.code === 'END_OPTED_OUT' ? 'Nothing to do. Vyakti will not call this number again.' : /^none\b/i.test(c.reason.action) ? `Nothing to do.${c.reason.action.replace(/^none;?\s*/i, '') ? ' ' + c.reason.action.replace(/^none;?\s*/i, '').replace(/^./, x => x.toUpperCase()).replace(/\.?$/, '.') : ''}` : `What you can do: ${c.reason.action.replace(/\.$/, '')}.`}</p>}
            <div style={{ margin: '10px 0' }}>{outcomeChip(best?.value ?? c.outcome, best?.grade ?? null)}</div>
            {best?.grade === 'ai_guess' && <p className="small muted">An AI guess is not verified by your system or a person.</p>}
            {c.analysis && c.analysis.status !== 'done' && <p className="small muted">{c.analysis.status === 'not_configured' ? 'The written summary and outcome guess are off, because no analysis model is set up on this server.' : c.analysis.status === 'failed' ? 'The written summary could not be made this time. The words, timing and cost here are not affected.' : 'This call was not analysed.'}</p>}
            <div style={{ marginTop: 12 }}>{why ? <div className="why"><p><strong>{why.headline}</strong></p>{why.because.map((b, i) => { const ev = b.evidence as { quote?: string; atMs?: number | null }; return <p key={i} className="small">{b.point}{ev.quote && <> <button type="button" className="linklike" onClick={() => seek(ev.atMs ?? null)}>{ev.atMs != null ? clock(ev.atMs / 1000) : 'quote'}</button> <span lang="hi">“{ev.quote}”</span></>}</p>; })}{why.notes.map(n => <p key={n} className="small muted">{n}</p>)}</div> : <Btn size="sm" busy={whyBusy} onClick={explain}>Explain this call</Btn>}</div></Card>
          {quotes.length > 0 && <Card><CardHead title="In their words" /><ul className="quotes">{quotes.map((m, i) => <li key={i}><blockquote lang="hi">“{m.quote}”</blockquote><div className="row"><Chip>{prettyCode(m.kind)}</Chip>{m.atMs != null && <button type="button" className="btn btn-sm" onClick={() => seek(m.atMs)}><Play size={12} aria-hidden /><span>Mark {clock(m.atMs / 1000)}</span></button>}</div></li>)}</ul></Card>}
          <Card><CardHead title="Safety rules that acted" sub="Code, not the model, decides these." />
            {c.safety.length === 0 ? <p className="small"><Check size={16} aria-hidden style={{ verticalAlign: '-3px', color: 'var(--leaf)' }} /> No safety rule needed to act on this call.</p> :
              <ul className="trace">{c.safety.map(s => <li key={s.seq}><CircleX size={18} aria-hidden className="bad" /><div><strong>{SHORT[s.rule] ?? 'Safety rule'} {DID[s.action] ?? 'acted'}</strong><p className="small muted">{RULE_LABEL[s.rule] ?? ''}</p><p className="small muted">{s.detail}</p></div></li>)}</ul>}
            {c.judgeMarks.length > 0 && <ul className="trace" aria-label="What the safety checker noticed">{c.judgeMarks.map(j => <li key={j.seq}>{j.outcome === 'raised' ? <CircleX size={18} aria-hidden className="bad" /> : <Info size={18} aria-hidden className="muted" />}<p className="small">{j.text}</p></li>)}</ul>}
            {c.handOffs.length > 0 && <p className="small" style={{ marginTop: 8 }}>Handed to {c.handOffs.map(h => h.destination).join(', ')}.</p>}
            {c.tools.length > 0 && <p className="small muted">Tools used: {c.tools.map(t => `${t.name} (${t.status})`).join(', ')}.</p>}</Card>
          <Card><CardHead title="What ran and what it cost" />
            <Kv rows={[['Voice stack', c.ran ? ((voiceStackOf({ stackId: c.ran, components: c.ranParts })?.label ?? '') || 'A stack that is no longer listed') : <NotMeasured key="r" />], ['Total', <strong key="t" className="tnum">{inr(c.costTotal, { paise: true })}</strong>], ['Charged', c.costTotal > 0 ? 'Yes' : 'Not charged']]} />
            {c.costLines.length > 0 && <><hr className="rule" /><Kv rows={c.costLines.map(l => [`${costPart(l.component, prettyCode)} · ${prettyCode(l.provider)}`, inr(l.inr_milli, { paise: true })] as [string, string])} /></>}</Card>
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
