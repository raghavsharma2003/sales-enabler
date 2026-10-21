// The voice stack picker. Owner directive: the user chooses among the finalised stacks; NO default is preselected and nothing
// is marked "recommended". Every figure carries its grade and source; a missing price or latency says so instead of showing 0.
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, KeyRound, Volume2 } from 'lucide-react';
import { STACKS, type VoiceStack } from '../../shared/stacks.ts';
import * as api from './api.ts';
import { Btn, Chip, Figure, NotMeasured, Segmented } from './ui.tsx';
import { inr } from './format.ts';
import { prettyId } from './catalog.ts';
import { useApp } from './store.tsx';

export const BETA_REASON = 'Beta stacks run test calls only: the dial gate refuses them for any call to a real person until their risks are cleared and the stack is marked available.';
interface Price { perMinuteInrMilli: number | null; basis: string; state: 'loading' | 'ready' | 'missing' }

function usePrices(): Record<string, Price> {
  const { hasTool } = useApp();
  const [p, setP] = useState<Record<string, Price>>({});
  useEffect(() => {
    if (!hasTool('money.estimate')) { setP(Object.fromEntries(STACKS.map(s => [s.id, { perMinuteInrMilli: null, basis: '', state: 'missing' as const }]))); return; }
    let live = true;
    for (const s of STACKS) {
      api.run<{ perMinuteInrMilli: number | null; basis: string }>('money.estimate', { stackId: s.id, minutes: 1, calls: 1 })
        .then(r => live && setP(x => ({ ...x, [s.id]: { perMinuteInrMilli: r.perMinuteInrMilli ?? null, basis: r.basis ?? '', state: 'ready' } })))
        .catch(() => live && setP(x => ({ ...x, [s.id]: { perMinuteInrMilli: null, basis: '', state: 'missing' } })));
    }
    return () => { live = false; };
  }, [hasTool]);
  return p;
}

export function StackPicker({ value, onChange, locked, cannotClear }: { value: string | null; onChange: (id: string | null) => void; locked?: string; cannotClear?: boolean }) {
  const [filter, setFilter] = useState<'all' | 'cascade' | 's2s' | 'available'>('all');
  const prices = usePrices();
  const list = useMemo(() => STACKS.filter(s => filter === 'all' || (filter === 'available' ? s.status === 'available' : s.kind === filter)), [filter]);
  const chosen = STACKS.find(s => s.id === value);
  return (
    <div className="stack">
      <div className="stackbar">
        <div>
          <h3>{chosen ? <>Chosen: {chosen.label}</> : 'Choose a voice stack'}</h3>
          <p className="sub">{chosen ? 'Unsaved until you save the draft. Tests are filed under the combination that actually ran.' : 'There is no default. Compare the measured figures, then pick. Nothing is saved until you press Save draft.'}</p>
        </div>
        <div className="row">
          <Segmented label="Show stacks" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'cascade', label: 'Cascade' }, { value: 's2s', label: 'Speech to speech' }, { value: 'available', label: 'Available now' }]} />
          {chosen && !cannotClear && <Btn size="sm" kind="ghost" onClick={() => onChange(null)}>Clear choice</Btn>}
        </div>
      </div>
      {locked && <p className="hint hint-bad">{locked}</p>}
      <ul className="stacks" aria-label="Voice stacks">
        {list.map(s => <StackCard key={s.id} s={s} selected={s.id === value} price={prices[s.id]} onPick={() => onChange(s.id)} />)}
      </ul>
      <p className="small muted">Reply gap is the time from the caller finishing to her first audio, measured from an India vantage unless the source says otherwise. “Computed” means arithmetic on measured parts. “Vendor says” is never shown beside a measured figure as if it were equal.</p>
    </div>
  );
}

function StackCard({ s, selected, price, onPick }: { s: VoiceStack; selected: boolean; price?: Price; onPick: () => void }) {
  const c = s.components;
  return (
    <li className={`stackcard${selected ? ' sel' : ''}`}>
      <div className="stackcard-head">
        <div className="grow"><h4>{s.label}</h4>
          <div className="row" style={{ gap: 6, marginTop: 6 }}>
            <Chip tone="peacock">{s.kind === 's2s' ? 'Speech to speech' : 'Cascade'}</Chip>
            <Chip tone={s.status === 'available' ? 'leaf' : 'marigold'} title={s.status === 'beta' ? BETA_REASON : undefined}>{s.status === 'available' ? 'Available' : 'Beta: test calls only'}</Chip>
            {s.requires?.map(r => <Chip key={r} icon={<KeyRound size={11} aria-hidden />} title={`Needs the ${r} credential on the voice runtime`}>{r.toLowerCase()}</Chip>)}
          </div>
        </div>
      </div>
      <p className="small">{s.note}</p>
      <dl className="kv small">
        <div><dt>Reply gap</dt><dd><Figure m={{ value: s.replyGap.value, grade: s.replyGap.grade, source: s.replyGap.source }} /><details className="how"><summary>How we know</summary><p>{s.replyGap.source}</p></details></dd></div>
        <div><dt>Provider cost per minute</dt><dd>{!price || price.state === 'loading' ? <span className="muted">Checking…</span> : price.perMinuteInrMilli != null ? <><span className="fig-v tnum">{inr(price.perMinuteInrMilli, { paise: true })}</span> <Chip tone="peacock">Computed</Chip><details className="how"><summary>Basis</summary><p>{price.basis}</p></details></> : <><NotMeasured />{price.basis && <details className="how"><summary>Why</summary><p>{price.basis}</p></details>}</>}</dd></div>
        <div><dt>Made of</dt><dd>{s.kind === 's2s' ? prettyId(c.s2s) : <>{prettyId(c.ears)} ears · {prettyId(c.brain)} brain · {prettyId(c.voice)} voice{!c.gatedEars && ' · ungated ears'}</>}</dd></div>
        <div><dt>Hear it</dt><dd><span className="dotted nm" title="No sample clip has been recorded for this stack yet"><Volume2 size={14} aria-hidden style={{ verticalAlign: '-2px' }} /> No sample recorded yet</span></dd></div>
      </dl>
      {s.risks?.map(r => <p key={r} className="risk small"><AlertTriangle size={14} aria-hidden /> {r}</p>)}
      <div className="stackcard-foot">
        <button type="button" className={`pickbtn${selected ? ' on' : ''}`} aria-pressed={selected} onClick={onPick}>{selected ? <><Check size={16} aria-hidden /> Chosen</> : 'Choose this stack'}</button>
      </div>
    </li>
  );
}
