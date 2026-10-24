// What an enterprise reviewer needs on a call: how long each reply took (the runtime's own measurement, never an estimate), where she said she
// is an AI, where a safety rule acted, and, when a recording can be played, a transcript that seeks the audio and follows it.
import { RULE_LABEL } from '../labels.ts';
import { clock, ms } from '../format.ts';
import type { CallDoc, CallTurn } from '../types.ts';

/** Reply gaps are measured by the voice runtime from the caller finishing to her first audio. A turn without one has none recorded. */
export function replyTiming(c: CallDoc) {
  const agentTurns = c.turns.filter(t => t.who === 'agent');
  const replies = agentTurns.filter((t, i) => !(i === 0 && !c.turns.slice(0, c.turns.indexOf(t)).some(x => x.who === 'caller')));   // her opening answers no one
  const timed = replies.filter(t => t.latencyMs != null && t.latencyMs > 0);
  const sorted = [...timed].sort((a, b) => a.latencyMs! - b.latencyMs!);
  const mid = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2].latencyMs! : (sorted[sorted.length / 2 - 1].latencyMs! + sorted[sorted.length / 2].latencyMs!) / 2) : null;
  return { replies: replies.length, timed: timed.length, median: mid, worst: sorted.length ? sorted[sorted.length - 1] : null };
}

export function TimingCard({ c, onSeek }: { c: CallDoc; onSeek: (t: CallTurn) => void }) {
  const t = replyTiming(c);
  return (
    <section aria-labelledby="rt-h" className="reviewbox">
      <h3 id="rt-h">Reply timing</h3>
      {t.replies === 0 ? <p className="small muted">She did not reply to anyone on this call, so there is no reply timing.</p>
        : t.timed === 0 ? <p className="small muted">The voice runtime did not record reply timing for this call, so none is shown. It is never estimated.</p>
        : <>
          <dl className="kv small">
            <div><dt>Median reply gap</dt><dd className="tnum">{ms(t.median!)}</dd></div>
            <div><dt>Slowest reply</dt><dd className="tnum">{ms(t.worst!.latencyMs!)} {t.worst!.startMs != null && <button type="button" className="linkbtn" onClick={() => onSeek(t.worst!)}>at {clock(t.worst!.startMs / 1000)}</button>}</dd></div>
            <div><dt>Measured on</dt><dd className="tnum">{t.timed} of {t.replies} {t.replies === 1 ? 'reply' : 'replies'}</dd></div>
          </dl>
          <p className="small muted">The gap is the time from the caller finishing to her first audio, as the voice runtime measured it.{t.timed < t.replies ? ' Replies without a figure had none recorded.' : ''}</p></>}
    </section>
  );
}

const AI_SAID = /\bAI\b|\bA\.I\.|artificial intelligence|virtual assistant|digital assistant|एआई|ए\.आई|कृत्रिम बुद्धि/i;
export const SHORT: Record<string, string> = { RD1: 'Disclosure rule', RD2: 'AI-identity rule', RD3: 'Crisis rule', RD4: 'Sensitive-details rule', RD5: 'Payment and links rule', RD6: 'Scam-pattern rule', RD7: 'Promotion rule', RD8: 'Insurance rule', RD9: 'Dues-call rule', RD10: 'Recording rule', RD11: 'Identity rule' };
export const DID: Record<string, string> = { blocked: 'stopped a sentence before she said it', replaced: 'replaced a sentence before she said it', flagged: 'flagged this turn', redacted: 'removed private details', suspended_goal: 'set the agenda aside' };

export interface Mark { kind: 'disclosure' | 'no-disclosure' | 'safety' | 'optout'; text: string; title?: string }

/** Marks to show on each turn. Safety events carry the runtime's event order, not a time, so each is placed by that order:
 *  what she was stopped from saying sits on her next reply; what was noticed in the caller's words sits on the turn before it. */
export function marksFor(c: CallDoc): Map<number, Mark[]> {
  const out = new Map<number, Mark[]>();
  const add = (idx: number, m: Mark) => out.set(idx, [...(out.get(idx) ?? []), m]);
  const agent = c.turns.filter(t => t.who === 'agent');
  const first = agent[0];
  if (first) {
    const hit = agent.slice(0, 2).find(t => AI_SAID.test(t.text));
    if (hit) add(hit.idx, { kind: 'disclosure', text: 'Says she is an AI', title: 'Found by searching her words for an AI statement. The runtime does not record this as an event.' });
    else add(first.idx, { kind: 'no-disclosure', text: 'No AI statement found in her opening', title: 'Found by searching her first two replies for an AI statement. A paraphrase the search does not know would not be found.' });
  }
  for (const s of c.safety) {
    const speaksNext = ['blocked', 'replaced', 'redacted'].includes(s.action);
    const target = speaksNext ? (agent.find(t => t.idx > s.seq) ?? agent[agent.length - 1]) : ([...c.turns].reverse().find(t => t.idx < s.seq) ?? c.turns[0]);
    if (target) add(target.idx, { kind: 'safety', text: `${SHORT[s.rule] ?? 'Safety rule'} ${DID[s.action] ?? 'acted'}`, title: `${RULE_LABEL[s.rule] ?? ''}${s.detail ? ' · ' + s.detail : ''}`.replace(/^ · /, '') });
  }
  for (const m of c.moments.filter(m => m.kind === 'opt_out' && m.atMs != null)) {
    const t = c.turns.find(x => x.who === 'caller' && x.startMs != null && m.atMs! >= x.startMs && m.atMs! <= (x.endMs ?? x.startMs + 1));
    if (t) add(t.idx, { kind: 'optout', text: `Opt-out heard${m.note ? ': ' + m.note : ''}` });
  }
  return out;
}

/** A recording can be played here only if the runtime gave an address a browser can open. Anything else (a file on the voice server) cannot. */
export const playable = (uri: string | null) => !!uri && /^https?:\/\//i.test(uri);

/** Turn by turn, under the transcript: each reply's gap as the runtime measured it, a marker where something went wrong,
 *  and each row seeks the recording to its turn. Only the runtime's stored trace is read (shared/call-trace.ts). */
export function TimelineCard({ c, onSeek }: { c: CallDoc; onSeek: (ms: number | null) => void }) {
  const rows = c.timeline;
  const wrong = rows.filter(r => r.causes.length).length;
  const widest = Math.max(1, ...rows.map(r => r.gapMs ?? 0));
  return (
    <section aria-labelledby="tl-h" className="reviewbox">
      <h3 id="tl-h">Turn by turn</h3>
      <p className="small muted">{wrong ? `Something went wrong on ${wrong} of ${rows.length} turns.` : `Nothing went wrong on any of the ${rows.length} turns the runtime traced.`} Select a turn to play the recording from it.</p>
      <ol className="timeline" aria-labelledby="tl-h">{rows.map(r => (
        <li key={r.turn} className={r.causes.length ? 'wrong' : undefined}>
          <button type="button" className="linkbtn tnum" onClick={() => onSeek(r.startMs)} disabled={r.startMs == null}>{r.startMs != null ? clock(r.startMs / 1000) : '–'}</button>
          <span className="small">{r.speaker === 'agent' ? 'Agent' : 'Caller'}</span>
          {r.speaker === 'agent'
            ? <span className="small tnum" title="Time from the caller finishing to her first audio, as the voice runtime measured it">{r.gapMs != null ? <><span className="gapbar" style={{ width: `${Math.max(4, Math.round((r.gapMs / widest) * 80))}px` }} aria-hidden />{ms(r.gapMs)}</> : <span className="muted">no gap recorded</span>}</span>
            : <span className="small tnum muted">{r.asrConfidence != null ? `heard with ${Math.round(r.asrConfidence * 100)}% confidence` : ''}</span>}
          {r.causes.length > 0 && <ul className="small">{r.causes.map((k, i) => <li key={i}>{k.text}</li>)}</ul>}
        </li>))}</ol>
    </section>
  );
}
