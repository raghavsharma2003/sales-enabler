// Today: the morning paper. Since-you-left, what needs a tap (fixed priority, at most 7), live campaigns, money, one next action.
// Numbers come from tool results only; a missing source shows "not measured", never 0.
import { useMemo } from 'react';
import { ArrowRight, Pause, PhoneCall, ShieldAlert } from 'lucide-react';
import { useApp, useData, useTool } from '../store.tsx';
import { campaignList, walletGet } from '../data.ts';
import { Link } from '../router.tsx';
import { Async, Btn, Card, CardHead, Chip, Empty, Meter, NotMeasured, PageHead, Skeleton } from '../ui.tsx';
import { ago, count, date, inr, plural, time } from '../format.ts';
import { RISK_WORDS } from '../tools.ts';
import { toolAsk } from '../labels.ts';
import type { Brief, CampaignRow } from '../types.ts';

const ACTION_WORDS: Record<string, [string, string]> = { 'brief.edit': ['draft', 'drafts'], 'agent.create': ['draft', 'drafts'], 'stack.set': ['draft', 'drafts'], 'audience.create': ['draft', 'drafts'], 'source.commit': ['draft', 'drafts'], 'test.simulate': ['test', 'tests'], 'test.browser_call': ['test', 'tests'], 'campaign.pause': ['guarded pause', 'guarded pauses'], 'campaign.stop_at_cap': ['guarded pause', 'guarded pauses'], 'contact.suppress_after_opt_out': ['guarded opt-out', 'guarded opt-outs'] };

export default function Today() {
  const { me, hasTool, review, act, refresh } = useApp();
  const brief = useTool<Brief>('brief.today', {});
  const camps = useData<CampaignRow[]>('camps', hasTool('campaign.list') ? campaignList : null);
  const wallet = useData('wallet', hasTool('wallet.get') ? walletGet : null);
  const dayCap = wallet.data?.caps.find(c => c.period === 'day')?.capInrMilli ?? null;
  const dateLine = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
  const live = useMemo(() => (camps.data ?? []).filter(c => c.state === 'running' || c.state === 'paused'), [camps.data]);

  return (
    <div className="page">
      <PageHead title="Today" sub={<>{dateLine} · {brief.data ? <>updated {time(brief.data.asOf)}</> : 'loading'}</>} />
      <Async q={brief} what="The Today brief" tool="brief.today" rows={6}>{b => {
        const did = summarise(b);
        const day0 = b.liveCampaigns.n === 0 && (camps.data?.length ?? 0) === 0 && b.needsTap.n === 0 && b.changed.n === 0;
        const next = nextAction(b, camps.data ?? []);
        return (
          <div className="today">
            <section className="since" aria-labelledby="since-h">
              <h2 id="since-h" className="serif">Since you left</h2>
              {b.changed.n > 0
                ? <p className="lead">VP did <strong className="tnum">{count(b.changed.n)}</strong> {b.changed.n === 1 ? 'thing' : 'things'}{did ? <>: {did}</> : ''}. <Link to="/settings/activity">See the ledger</Link></p>
                : <p className="lead">Nothing has changed since {time(b.since)}. <span className="muted">That is a measured zero from the activity ledger, not a missing number.</span></p>}
            </section>

            {day0 && <Card><Empty title="No campaigns yet" body="The quickest way to start is to hear an agent. It takes about three minutes, and nothing reaches anyone." action={<Link to="/agents" className="btn btn-primary" style={{ textDecoration: 'none' }}><PhoneCall size={16} aria-hidden /><span>Hear an agent</span></Link>} /></Card>}

            <div className="cols-main">
              <div className="stack">
                <Card aria-labelledby="needs-h">
                  <CardHead id="needs-h" title="Needs you" sub={b.needsTap.n ? `${count(b.needsTap.n)} waiting. Safety first, then deadlines, then impact.` : undefined} />
                  {b.needsTap.n === 0 && b.issues.n === 0 ? <Empty title="Nothing is waiting for you" body={`VP did ${count(b.changed.n)} ${b.changed.n === 1 ? 'thing' : 'things'} on its own. Nothing is waiting on you.`} action={<Link to="/settings/activity">See activity</Link>} /> : (
                    <ul className="needs">
                      {groupNeeds(b.needsTap.items).map(({ a, n }) => {
                        const w = RISK_WORDS[a.risk] ?? { label: a.risk, line: '' };
                        return (
                          <li key={a.id} className="need">
                            <div className="need-text">
                              <div className="row"><Chip tone={a.risk === 'spend' || a.risk === 'external' ? 'terra' : 'marigold'}>{w.label}</Chip>{a.expires_at && <span className="small muted">expires {date(a.expires_at, true)}</span>}</div>
                              <p className="need-title">{a.summary ?? a.tool}</p>
                            </div>
                            <Btn kind="primary" size="sm" onClick={() => review({ actionId: a.id, tool: a.tool, summary: a.summary ?? toolAsk(a.tool, 'Approve this change'), risk: a.risk, expiresAt: a.expires_at })}>Review</Btn>
                          </li>
                        );
                      })}
                      {b.needsTap.n > b.needsTap.items.length && <li className="small muted">{count(b.needsTap.n - b.needsTap.items.length)} more waiting. They appear here as the first ones are handled.</li>}
                      {b.issues.items.map(i => (
                        <li key={i.id} className="need">
                          <div className="need-text"><div className="row"><Chip tone={i.severity === 'critical' ? 'brick' : 'marigold'} icon={<ShieldAlert size={12} aria-hidden />}>{i.severity === 'critical' ? 'Critical issue' : 'Issue'}</Chip><span className="small muted">{ago(i.created_at)}</span></div><p className="need-title">{i.category.replace(/_/g, ' ')}</p></div>
                          <Link to="/insights" className="btn btn-sm" style={{ textDecoration: 'none' }}><span>Open</span></Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card aria-labelledby="live-h">
                  <CardHead id="live-h" title="Live now" sub="Counts and pace as of the last update" />
                  {camps.state === 'missing' ? <p className="muted small">Campaign details are not switched on in this server yet. {b.liveCampaigns.n} campaign{b.liveCampaigns.n === 1 ? ' is' : 's are'} active.</p>
                    : camps.state === 'loading' ? <Skeleton rows={2} />
                    : live.length === 0 ? <Empty title="No campaign is dialling" body="When one is live you see its pace, pickups and a pause control here." action={<Link to="/campaigns/new">Start a campaign</Link>} />
                    : <ul className="livelist">{live.map(c => (
                      <li key={c.id} className="livestrip">
                        <div className="grow">
                          <div className="row"><Link to={`/campaigns/${c.id}`} className="rowlink">{c.name}</Link><Chip tone={c.state === 'running' ? 'leaf' : 'marigold'}>{c.state === 'running' ? 'Dialling' : 'Paused'}</Chip></div>
                          <p className="small muted tnum">{count(c.attempts)} attempts · {count(c.blocked)} held back by the checks{c.pauseCause ? ` · paused: ${c.pauseCause.replace(/_/g, ' ')}` : ''}</p>
                        </div>
                        {c.state === 'running' && <Btn size="sm" icon={<Pause size={14} aria-hidden />} onClick={async () => { const r = await act('campaign.pause', { id: c.id }, { describe: `${c.name} paused.` }); if (r.ok) refresh(); }}>Pause</Btn>}
                      </li>))}</ul>}
                </Card>
              </div>

              <div className="stack">
                <Card aria-labelledby="money-h">
                  <CardHead id="money-h" title="Money" sub={`Spend today, ${b.spendToday.timezone === 'Asia/Kolkata' ? 'IST day' : b.spendToday.timezone}`} />
                  <p className="bignum serif tnum" aria-label={`Spent today ${inr(b.spendToday.inrMilli)}`}>{inr(b.spendToday.inrMilli)}</p>
                  {dayCap ? <Meter label="Today against your cap" value={b.spendToday.inrMilli} max={dayCap} tone={b.spendToday.inrMilli / dayCap > 0.85 ? 'brick' : 'leaf'} note={`${inr(b.spendToday.inrMilli)} of ${inr(dayCap)}`} /> : <p className="small muted">No daily cap is set. <Link to="/settings/billing">See the wallet</Link></p>}
                  <hr className="rule" />
                  {b.wallet ? <dl className="kv"><div><dt>Wallet</dt><dd className="tnum">{inr(b.wallet.balanceInrMilli)} {b.wallet.state !== 'active' && <Chip tone="brick">{b.wallet.state === 'empty' ? 'Empty' : b.wallet.state}</Chip>}</dd></div>
                    <div><dt>Runway at today's pace</dt><dd>{wallet.data?.runwayDays != null ? <span className="tnum">{wallet.data.runwayDays} days</span> : <NotMeasured />}</dd></div></dl> : <p className="small muted">No wallet yet.</p>}
                </Card>

                {next && <Card aria-labelledby="next-h"><CardHead id="next-h" title="Next best step" /><p><strong>{next.title}</strong></p><p className="muted small" style={{ margin: '4px 0 12px' }}>{next.why}</p><Link to={next.href} className="btn btn-primary" style={{ textDecoration: 'none' }}><span>{next.label}</span><ArrowRight size={16} aria-hidden /></Link></Card>}
              </div>
            </div>
          </div>
        );
      }}</Async>
    </div>
  );
}

function groupNeeds(items: Brief['needsTap']['items']) {
  const m = new Map<string, { a: Brief['needsTap']['items'][number]; n: number }>();
  for (const a of items) { const k = a.tool + '|' + a.summary; const g = m.get(k); if (g) g.n++; else m.set(k, { a, n: 1 }); }
  return [...m.values()];
}

function summarise(b: Brief): string {
  const g = new Map<string, [number, [string, string]]>();
  for (const a of b.changed.byAction) { const w = ACTION_WORDS[a.action] ?? ['other change', 'other changes']; const k = w[0]; g.set(k, [(g.get(k)?.[0] ?? 0) + a.n, w]); }
  return [...g.values()].map(([n, w]) => `${count(n)} ${n === 1 ? w[0] : w[1]}`).join(', ');
}

function nextAction(b: Brief, camps: CampaignRow[]): { title: string; why: string; label: string; href: string } | null {
  if (b.issues.n > 0) return { title: `Look at ${plural(b.issues.n, 'open issue')}`, why: 'Issues are ranked by calls affected and severity; the top one has a suggested fix.', label: 'Open Insights', href: '/insights' };
  const draft = camps.find(c => c.state === 'draft');
  if (draft) return { title: `Finish "${draft.name}"`, why: 'It is saved as a draft and has not reached anyone. The launch card shows who, when and the cost before you decide.', label: 'Open the draft', href: `/campaigns/${draft.id}` };
  return null;
}
