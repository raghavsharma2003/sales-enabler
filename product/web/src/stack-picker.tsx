// The voice stack picker. Owner directive: the user chooses among the finalised stacks; NO default is preselected and nothing
// is marked "recommended". Every figure carries its grade and source; a missing price or latency says so instead of showing 0.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Pause, Play, Volume2 } from 'lucide-react';
import { loadSamples, playableIn, type Sample } from './samples.ts';
import * as api from './api.ts';
import { Async, Btn, Chip, Empty, Figure, NotMeasured, Segmented, SelectField } from './ui.tsx';
import { inr } from './format.ts';
import { useApp, useData } from './store.tsx';

export const BETA_REASON = 'Beta stacks run test calls only: the dial gate refuses them for any call to a real person until their risks are cleared and the stack is marked available.';
interface Price { perMinuteInrMilli: number | null; basis: string; state: 'loading' | 'ready' | 'missing' }

function usePrices(stacks: { id: string }[]): Record<string, Price> {
  const { hasTool } = useApp();
  const [p, setP] = useState<Record<string, Price>>({});
  useEffect(() => {
    if (!hasTool('money.estimate')) { setP(Object.fromEntries(stacks.map(s => [s.id, { perMinuteInrMilli: null, basis: '', state: 'missing' as const }]))); return; }
    let live = true;
    for (const s of stacks) {
      api.run<{ perMinuteInrMilli: number | null; basis: string }>('money.estimate', { stackId: s.id, minutes: 1, calls: 1 })
        .then(r => live && setP(x => ({ ...x, [s.id]: { perMinuteInrMilli: r.perMinuteInrMilli ?? null, basis: r.basis ?? '', state: 'ready' } })))
        .catch(() => live && setP(x => ({ ...x, [s.id]: { perMinuteInrMilli: null, basis: '', state: 'missing' } })));
    }
    return () => { live = false; };
  }, [hasTool, stacks]);
  return p;
}


/** Words a person reads for the parts of a voice stack. The API ids (ears, brain, voice, s2s) never reach the screen. */
export const PART_WORD = { ears: 'Speech recognition', brain: 'Language model', voice: 'Voice', s2s: 'Speech-to-speech model' } as const;
export type Part = keyof typeof PART_WORD;
type Avail = { state: 'available' | 'unavailable' | 'unknown'; reason: string | null };
type Fig = { value: string; grade: 'measured' | 'computed' | 'vendor' | 'not_measured'; source: string };
export interface Parts { ears?: string; brain?: string; voice?: string; s2s?: string }
interface CompRow { id: string; part: Part; label: string; maker: string; processedIn: string; latency: Fig; price: string; status: 'available' | 'beta'; note: string | null; voices: string[]; defaultVoice: string | null; availability: Avail }
interface PartRow { part: Part; id: string; label: string; maker: string; processedIn: string }
interface Gate { state: 'meets' | 'not_yet' | 'not_measured'; label: string; detail: string; target: { replyGapP50Ms: number; cutInRateMax: number } }
// A language the stack serves end to end, graded by its weakest part: 'measured' only where every part ran in it in our tests.
interface StackLang { language: string; name: string; grade: 'measured' | 'stated' }
interface StackRow { id: string; label: string; kind: 'cascade' | 's2s'; status: 'available' | 'beta'; note: string; replyGap: Fig; risks: string[]; availability: Avail; components: Parts; parts: PartRow[]; languages?: StackLang[]; gate?: Gate; cutIn?: Fig; goodAt?: string[]; weakAt?: string[] }
interface StackList { default: string | null; stacks: StackRow[]; components: CompRow[] }

export type StackChange = { stackId: string; components?: Parts; voiceId?: string | null };
type Props = { agentId: string; stackId: string | null; components?: Parts; voiceId?: string | null; onChanged: (c: StackChange) => void; published?: number | null };

const CUSTOM = 'custom';
const find = (list: CompRow[], part: Part, id?: string) => (id ? list.find(c => c.part === part && c.id === id) : undefined);

/** How a stored voice id reads to a person: a name, with the language and the quality tier when the id carries them. */
export function voiceName(id: string): string {
  const [head, tier] = id.split(':');
  const lang = /^hi-in-/i.test(head) ? 'Hindi' : /^en-in-/i.test(head) ? 'English' : '';
  const base = head.replace(/^[a-z]{2}-[a-z]{2}-/i, '').replace(/Neural$/i, '').split('_')[0];
  const name = base.charAt(0).toUpperCase() + base.slice(1);
  const t = !tier ? '' : /^MAI-Voice-/i.test(tier) ? tier.replace(/^MAI-Voice-/i, '').replace('-', ' ') : /Dragon/i.test(tier) ? 'HD' : '';
  return [name, lang].filter(Boolean).join(', ') + (t ? ` · ${t}` : '');
}

export function StackPicker(p: Props) {
  const q = useData<StackList>('stack-list', () => api.run<StackList>('stack.list', {}));
  return <Async q={q} what="Voice stacks" tool="stack.list" rows={5}>{d => <Loaded {...p} d={d} />}</Async>;
}

function Loaded({ agentId, stackId, components, voiceId, onChanged, d, published }: Props & { d: StackList }) {
  const { act } = useApp();
  const prices = usePrices(d.stacks);
  const samples = useData('voice-samples', loadSamples).data ?? {};
  const [filter, setFilter] = useState<'all' | 'cascade' | 's2s' | 'available'>('all');
  const [lang, setLang] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const isCustom = stackId === CUSTOM;
  const curated = d.stacks.find(s => s.id === stackId);
  const parts: Parts = isCustom ? (components ?? {}) : (curated?.components ?? {});
  const [build, setBuild] = useState<{ mode: 'cascade' | 's2s'; ears: string; brain: string; voice: string; s2s: string }>(() => ({
    mode: components?.s2s ? 's2s' : 'cascade', ears: components?.ears ?? '', brain: components?.brain ?? '', voice: components?.voice ?? '', s2s: components?.s2s ?? '' }));

  const choose = async (id: string, comps?: Parts) => {
    setBusy(id); setRefusal(null);
    const r = await act<{ voiceCleared?: boolean }>('stack.set', { agentId, stackId: id, ...(comps ? { components: comps } : {}) }, { quiet: true });
    setBusy(null);
    if (!r.ok) { setRefusal(r.reason ?? 'The server did not accept that choice.'); return; }
    onChanged({ stackId: id, components: comps, voiceId: r.result?.voiceCleared ? null : voiceId });
  };
  const buildParts: Parts = build.mode === 's2s' ? { s2s: build.s2s || undefined } : { ears: build.ears || undefined, brain: build.brain || undefined, voice: build.voice || undefined };
  const complete = build.mode === 's2s' ? !!build.s2s : !!(build.ears && build.brain && build.voice);
  const buildPrice = useBuildPrice(complete ? buildParts : null);
  const useParts = () => choose(CUSTOM, build.mode === 's2s' ? { s2s: build.s2s || undefined } : { ears: build.ears || undefined, brain: build.brain || undefined, voice: build.voice || undefined });

  const speaker = find(d.components, parts.s2s ? 's2s' : 'voice', parts.s2s ?? parts.voice);
  const pickVoice = async (v: string) => {
    setBusy('voice:' + v); setRefusal(null);
    const r = await act('voice.set', { agentId, voiceId: v }, { quiet: true });
    setBusy(null);
    if (!r.ok) { setRefusal(r.reason ?? 'The server did not accept that voice.'); return; }
    onChanged({ stackId: stackId ?? CUSTOM, components: isCustom ? components : undefined, voiceId: v });
  };

  const byKind = d.stacks.filter(s => filter === 'all' || (filter === 'available' ? s.status === 'available' : s.kind === filter));
  const list = byKind.filter(s => !lang || (s.languages ?? []).some(l => l.language === lang));
  // Every language the stacks serve, with how many of the stacks shown speak it (most first), for the language filter.
  const langs = useMemo(() => {
    const m = new Map<string, { name: string; n: number }>();
    for (const s of byKind) for (const l of s.languages ?? []) m.set(l.language, { name: l.name, n: (m.get(l.language)?.n ?? 0) + 1 });
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n || a[1].name.localeCompare(b[1].name));
  }, [byKind]);
  return (
    <div className="stack">
      <Summary d={d} stackId={stackId} curated={curated} parts={parts} isCustom={isCustom} />
      {published ? <p className="small muted" role="note">Choosing a stack changes the draft only. Campaigns and inbound lines keep the stack of published version {published} until you publish again, which asks for approval and names the change.</p> : null}
      {refusal && <p className="hint hint-bad" role="alert">{refusal}</p>}

      <div className="stackbar">
        <div><h3>Recommended stacks</h3><p className="sub">Ready-made combinations we have measured. Choosing one saves it to this draft straight away.</p></div>
        <div className="stackbar-filters">
          <Segmented label="Show stacks" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'cascade', label: 'Separate parts' }, { value: 's2s', label: 'Speech to speech' }, { value: 'available', label: 'Available now' }]} />
          {langs.length > 0 && <SelectField label="Speaks" value={lang} onChange={e => setLang(e.target.value)}>
            <option value="">Any language ({byKind.length})</option>
            {langs.map(([code, l]) => <option key={code} value={code}>{l.name} ({l.n})</option>)}</SelectField>}
        </div>
      </div>
      {lang && list.length === 0 && <Empty title={`No stack here speaks ${langs.find(([c]) => c === lang)?.[1].name ?? 'that language'}`} body="Try another kind of stack above, or build your own from parts that do." />}
      <ul className="stacks" aria-label="Recommended voice stacks">
        {list.map(s => <StackCard key={s.id} s={s} selected={s.id === stackId} isDefault={s.id === d.default} price={prices[s.id]} sample={samples[s.id]} busy={busy === s.id} onPick={() => void choose(s.id)} />)}
      </ul>

      {/* Closed until wanted (open when the agent already runs its own parts): the full parts list is a long page on a phone. */}
      <details className="buildown" open={isCustom || undefined}>
        <summary><h3 id="build-h">Build your own</h3>
        <p className="sub">Choose each part yourself. Every option says who makes it, where it is processed, how fast it was measured to be and what it costs.</p>
        <span className="buildown-toggle"><span className="when-closed">Show the parts</span><span className="when-open">Hide the parts</span></span></summary>
        <Segmented label="How to build it" value={build.mode} onChange={mode => setBuild(b => ({ ...b, mode }))} options={[{ value: 'cascade', label: 'Speech recognition, language model and voice' }, { value: 's2s', label: 'One speech-to-speech model' }]} />
        <div className="partpick">
          {(build.mode === 's2s' ? ['s2s'] as Part[] : ['ears', 'brain', 'voice'] as Part[]).map(part => (
            <PartPicker key={part} part={part} options={d.components.filter(c => c.part === part)} value={build[part]} onChange={v => setBuild(b => ({ ...b, [part]: v }))} />
          ))}
        </div>
        <dl className="kv small buildprice"><div><dt>Provider cost per minute</dt><dd>{!buildPrice ? <span className="muted">Choose every part to see the cost.</span> : buildPrice.refused ? <span className="risk">{buildPrice.refused}</span> : <PriceView price={buildPrice} />}</dd></div></dl>
        <div className="row" style={{ marginTop: 12 }}><Btn kind="primary" busy={busy === CUSTOM} onClick={() => void useParts()}>Use these parts</Btn></div>
        <p className="small muted">A stack you build runs test calls only until it has been measured.</p>
      </details>

      {speaker && speaker.voices.length > 0 && (
        <section aria-labelledby="voice-h">
          <h3 id="voice-h">Choose the voice</h3>
          <p className="sub">The voices of {speaker.label}. The chosen voice stays when you change only the language model.</p>
          {curated && samples[curated.id] && <div style={{ marginTop: 8 }}><SamplePlayer sample={samples[curated.id]} label={curated.label} /></div>}
          <div role="radiogroup" aria-label="Voices" className="chipset" style={{ marginTop: 8 }}>
            {speaker.voices.map(v => { const on = (voiceId ?? speaker.defaultVoice) === v;
              return <button key={v} type="button" role="radio" aria-checked={on} className={`choice${on ? ' on' : ''}`} onClick={() => { if (!on) void pickVoice(v); }}>{voiceName(v)}{v === speaker.defaultVoice && !voiceId && ' (default)'}</button>; })}
          </div>
        </section>
      )}
      <p className="small muted">Reply gap is the time from the caller finishing to the first audio, measured from an India vantage unless the source says otherwise. “Computed” means arithmetic on measured parts. “Vendor says” is never shown beside a measured figure as if it were equal.</p>
    </div>
  );
}

function StatusChips({ status, avail, isDefault }: { status: 'available' | 'beta'; avail?: Avail; isDefault?: boolean }) {
  const down = avail?.state === 'unavailable';
  return <>
    {isDefault && <Chip tone="neutral" title="New agents start on this stack for now. It changes when another stack meets the speed and turn-taking target.">Provisional default</Chip>}
    {status === 'beta' ? <Chip tone="marigold" title={BETA_REASON}>Beta: test calls only</Chip> : !down && <Chip tone="leaf">Available</Chip>}
    {down && <Chip tone="brick">Unavailable</Chip>}
  </>;
}

function Summary({ d, stackId, curated, parts, isCustom }: { d: StackList; stackId: string | null; curated?: StackRow; parts: Parts; isCustom: boolean }) {
  if (!stackId || (!isCustom && !curated)) return <div className="stacksum"><h3>Current stack</h3><p className="muted">No voice stack is chosen yet. Choose a recommended stack or build your own below.</p></div>;
  const rows = (['ears', 'brain', 'voice', 's2s'] as Part[]).flatMap(part => { const c = find(d.components, part, parts[part]); return c ? [c] : []; });
  const down = isCustom ? rows.find(c => c.availability.state === 'unavailable') : curated?.availability.state === 'unavailable' ? curated : undefined;
  const reason = isCustom ? down && (down as CompRow).availability.reason : curated?.availability.reason;
  const avail: Avail | undefined = down ? { state: 'unavailable', reason: reason ?? null } : undefined;
  return (
    <div className="stacksum">
      <h3>Current stack</h3>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <strong>{isCustom ? 'Your own stack' : curated!.label}</strong>
        <StatusChips status={isCustom ? 'beta' : curated!.status} avail={avail} isDefault={stackId === d.default} />
      </div>
      {avail?.reason && <p className="risk small"><AlertTriangle size={14} aria-hidden /> {avail.reason}</p>}
      <dl className="kv small">{rows.map(c => <div key={c.part}><dt>{PART_WORD[c.part]}</dt><dd>{c.label} · {c.processedIn}</dd></div>)}</dl>
    </div>
  );
}

function PartPicker({ part, options, value, onChange }: { part: Part; options: CompRow[]; value: string; onChange: (id: string) => void }) {
  return (
    <fieldset className="partset">
      <legend>{PART_WORD[part]}</legend>
      <div role="radiogroup" aria-label={PART_WORD[part]} className="partopts">
        {options.map(c => {
          const down = c.availability.state === 'unavailable';
          const on = value === c.id;
          return (
            <label key={c.id} className={`partopt${on ? ' on' : ''}${down ? ' off' : ''}`}>
              <input type="radio" name={`part-${part}`} checked={on} disabled={down} onChange={() => onChange(c.id)} />
              <span className="partopt-body">
                <strong>{c.label}</strong>
                <span className="small muted">{c.maker} · {c.processedIn}</span>
                <span className="small"><Figure m={c.latency} /> · <span className="muted">{c.price}</span></span>
                <span className="row" style={{ gap: 6 }}>
                  {c.status === 'beta' && <Chip tone="marigold" title={BETA_REASON}>Beta</Chip>}
                  {down && <Chip tone="brick">Unavailable</Chip>}
                </span>
                {down && c.availability.reason && <span className="small risk">{c.availability.reason}</span>}
                {c.note && <span className="small muted">{c.note}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function PriceView({ price }: { price?: Price }) {
  if (!price || price.state === 'loading') return <span className="muted">Checking…</span>;
  if (price.perMinuteInrMilli != null) return <><span className="fig-v tnum">{inr(price.perMinuteInrMilli, { paise: true })}</span> <Chip tone="peacock">Computed</Chip><details className="how"><summary>Basis</summary><p>{price.basis}</p></details></>;
  return <><NotMeasured>Price not set yet</NotMeasured>{price.basis && <details className="how"><summary>Why</summary><p>{price.basis}</p></details>}</>;
}

/** The provider cost per minute of the parts chosen so far, asked of the server each time the choice changes. A refused combination
 *  shows the server's reason in place of a number. */
function useBuildPrice(parts: Parts | null): (Price & { refused?: string }) | null {
  const key = parts ? JSON.stringify(parts) : '';
  const [p, setP] = useState<{ key: string; v: Price & { refused?: string } } | null>(null);
  useEffect(() => {
    if (!parts) return;
    let live = true;
    api.run<{ perMinuteInrMilli: number | null; basis: string }>('money.estimate', { stackId: CUSTOM, components: parts, minutes: 1, calls: 0 })
      .then(r => { if (live) setP({ key, v: { perMinuteInrMilli: r.perMinuteInrMilli ?? null, basis: r.basis ?? '', state: 'ready' } }); })
      .catch(e => { if (live) setP({ key, v: { perMinuteInrMilli: null, basis: '', state: 'missing', refused: e instanceof api.ToolRefused ? e.reason : 'The price could not be worked out.' } }); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!parts) return null;
  return p && p.key === key ? p.v : { perMinuteInrMilli: null, basis: '', state: 'loading' };
}

/** What a stack speaks, measured apart from stated, so a maker's claim never reads as our own test. Long lists fold. */
function Languages({ list }: { list: StackLang[] }) {
  const line = (grade: StackLang['grade'], words: string) => {
    const names = list.filter(l => l.grade === grade).map(l => l.name);
    if (!names.length) return null;
    const shown = names.slice(0, 5), more = names.length - shown.length;
    return <span className="langline"><span className="muted">{words}: </span>{shown.join(', ')}{more > 0 && <details className="how langmore"><summary>+{more} more</summary><p>{names.slice(5).join(', ')}</p></details>}</span>;
  };
  return <>{line('measured', 'Measured in our tests')}{line('stated', 'The makers say')}</>;
}

function StackCard({ s, selected, isDefault, price, sample, busy, onPick }: { s: StackRow; selected: boolean; isDefault: boolean; price?: Price; sample?: Sample; busy: boolean; onPick: () => void }) {
  const down = s.availability.state === 'unavailable';
  return (
    <li className={`stackcard${selected ? ' sel' : ''}`}>
      <div className="stackcard-head">
        <div className="grow"><h4>{s.label}</h4>
          <div className="row" style={{ gap: 6, marginTop: 6 }}>
            <Chip tone="peacock">{s.kind === 's2s' ? 'Speech to speech' : 'Separate parts'}</Chip>
            <StatusChips status={s.status} avail={s.availability} isDefault={isDefault} />
          </div>
        </div>
      </div>
      {!s.goodAt && <p className="small">{s.note}</p>}
      <dl className="kv small">
        {s.languages && s.languages.length > 0 && <div><dt>Languages</dt><dd><Languages list={s.languages} /></dd></div>}
        <div><dt>Reply gap</dt><dd><Figure m={s.replyGap} /><details className="how"><summary>How we know</summary><p>{s.replyGap.source}</p></details></dd></div>
        {s.gate && <div><dt>Speed and turn-taking</dt><dd><Chip wrap tone={s.gate.state === 'meets' ? 'leaf' : s.gate.state === 'not_yet' ? 'marigold' : 'neutral'}>{s.gate.label}</Chip>
          <details className="how"><summary>How we know</summary><p>{s.gate.detail} The target is a median reply within {(s.gate.target.replyGapP50Ms / 1000).toFixed(1)} s and at most {Math.round(s.gate.target.cutInRateMax * 100)}% of turns where she talks over the caller. Calls still run on a stack that does not meet it.</p></details></dd></div>}
        <div><dt>Talking over the caller</dt><dd>{s.cutIn ? <Figure m={s.cutIn} /> : <NotMeasured />}{s.cutIn && <details className="how"><summary>How we know</summary><p>{s.cutIn.source}</p></details>}</dd></div>
        <div><dt>Provider cost per minute</dt><dd><PriceView price={price} /></dd></div>
        {s.parts.map(c => <div key={c.part}><dt>{PART_WORD[c.part]}</dt><dd>{c.label}<span className="small muted"> · {c.processedIn}</span></dd></div>)}
        <div><dt>Hear it</dt><dd>{sample ? <SamplePlayer sample={sample} label={s.label} /> : <span className="dotted nm" title="No sample clip has been recorded for this stack yet"><Volume2 size={14} aria-hidden style={{ verticalAlign: '-2px' }} /> No sample recorded yet</span>}</dd></div>
      </dl>
      {down && selected && <p className="risk small"><AlertTriangle size={14} aria-hidden /> {s.availability.reason}</p>}
      {s.goodAt ? <div className="traits small">
        {s.goodAt.length > 0 && <div><h5>Good at</h5><ul>{s.goodAt.map(g => <li key={g}><Check size={14} aria-hidden /> {g}</li>)}</ul></div>}
        {s.weakAt && s.weakAt.length > 0 && <div><h5>Weak at</h5><ul>{s.weakAt.map(r => <li key={r} className="risk"><AlertTriangle size={14} aria-hidden /> {r}</li>)}</ul></div>}
      </div> : s.risks.map(r => <p key={r} className="risk small"><AlertTriangle size={14} aria-hidden /> {r}</p>)}
      <div className="stackcard-foot">
        {down && !selected ? <Btn disabled fix={null} reason={s.availability.reason ?? 'This stack is unavailable right now.'}>Choose this stack</Btn>
          : <button type="button" className={`pickbtn${selected ? ' on' : ''}`} aria-pressed={selected} aria-disabled={busy || undefined} onClick={() => { if (!selected && !busy) onPick(); }}>{selected ? <><Check size={16} aria-hidden /> Chosen</> : busy ? 'Saving…' : 'Choose this stack'}</button>}
      </div>
    </li>
  );
}

// One sample plays at a time across the page: starting another stops the one playing.
let playing: HTMLAudioElement | null = null;
/** A sample clip: one button that plays and pauses it (its state is announced), the length, and what she says, in words. */
function SamplePlayer({ sample, label }: { sample: Sample; label: string }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [on, setOn] = useState(false);
  // Known before any tap: a browser that rules out every rendition says so instead of a button that does nothing.
  const [cant, setCant] = useState(() => typeof document !== 'undefined' && !playableIn(sample.sources, t => document.createElement('audio').canPlayType(t)));
  useEffect(() => () => { audio.current?.pause(); }, []);
  const toggle = () => {
    const a = audio.current; if (!a) return;
    if (on) { a.pause(); return; }
    if (playing && playing !== a) playing.pause();
    playing = a; void a.play().catch(() => setCant(true));
  };
  const secs = Math.round(sample.durationS);
  return (
    <div className="sample stack-s">
      {/* One <source> per rendition, best first: the browser takes the first it can play. The last one failing means none could. */}
      <audio ref={audio} preload="none" onPlay={() => setOn(true)} onPause={() => setOn(false)} onEnded={() => setOn(false)}>
        {sample.sources.map((x, i) => <source key={x.src} src={x.src} type={x.type} onError={i === sample.sources.length - 1 ? () => { setOn(false); setCant(true); } : undefined} />)}
      </audio>
      {cant ? <p className="small muted" role="status"><Volume2 size={14} aria-hidden style={{ verticalAlign: '-2px' }} /> This browser can't play the sample.</p>
        : <button type="button" className="btn btn-sm" aria-pressed={on} aria-label={`${on ? 'Pause' : 'Play'} the sample of ${label}, ${secs} seconds`} onClick={toggle}>
          {on ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}<span>{on ? 'Pause' : 'Play sample'}</span><span className="muted tnum">{secs} s</span>
        </button>}
      <details className="how"><summary>What she says</summary><p lang="hi">{sample.text}</p><p className="small muted">Recorded {sample.recorded}.</p></details>
    </div>
  );
}
