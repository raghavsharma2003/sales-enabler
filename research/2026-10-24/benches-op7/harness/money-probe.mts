// op7 (new, zero cost, no model): the pointers for select-rule.txt kind D (wrong-amount money card). For every bench task in
// a run DB it prints the member's message and the rupee figures in it (operator/loop.ts memberRupees, as the server reads
// them, and a plain ₹/Rs/INR/bare-number reading), then:
//   - every approval card (message card type approval) with the action row's stored args, and each *InrMilli field in
//     them as rupees; a card counts as "carries money" when any *InrMilli field is present (the D class);
//   - every NOT DONE receipt whose text says "No card was made" (the server's refusal, 0882b06 / fa8af3f), with its text;
//   - every confirmed receipt of a money tool (cap.*, wallet.*, budget.*) with its *InrMilli args, for the README (not a card).
// Pointers, not verdicts: each is read by hand against the message. Usage: node --import tsx money-probe.mts <label>=<db> ...
// Prints JSON lines. Bench data is synthetic. Not product code.
import pg from '/dev/shm/wt-op7/node_modules/pg/lib/index.js';
import { memberRupees } from '/dev/shm/wt-op7/product/server/modules/operator/loop.ts';
import { TASKS } from '/dev/shm/wt-op7/product/scripts/operator-bench-tasks.ts';
const text = Object.fromEntries(TASKS.map(t => [t.id, t.text]));
const milli = (o: any) => Object.entries(o ?? {}).filter(([k, v]) => /inrmilli$/i.test(k) && typeof v === 'number').map(([k, v]) => ({ field: k, value: v as number, rupees: (v as number) / 1000 }));
const plain = (s: string) => [...s.matchAll(/(₹|\brs\.?\s?|\binr\s?)\s?([\d,]+(?:\.\d+)?)/gi)].map(m => Number(m[2]!.replace(/,/g, '')));
for (const arg of process.argv.slice(2)) {
  const [label, db] = arg.split('=');
  const c = new pg.Client({ host: '/dev/shm/vp-pgbench-op7', port: 55442, user: 'vp', database: db });
  await c.connect();
  const ws = await c.query("SELECT id, substr(name, 7) AS task FROM workspace WHERE name LIKE 'bench %' ORDER BY created_at");
  for (const w of ws.rows) {
    const msgs = await c.query("SELECT role, content FROM message WHERE workspace_id = $1 ORDER BY created_at, id", [w.id]);
    const t0 = await c.query("SELECT min(created_at) AS at FROM message WHERE workspace_id = $1 AND role = 'user'", [w.id]);
    const acts = await c.query("SELECT id, tool, status, args, created_at FROM action WHERE workspace_id = $1 AND created_at >= $2 ORDER BY created_at", [w.id, t0.rows[0]?.at ?? new Date(0)]);
    const byId = new Map(acts.rows.map((a: any) => [a.id, a]));
    const msg = text[w.task] ?? '';
    const cards: any[] = [], refusals: any[] = [], done: any[] = [];
    for (const m of msgs.rows) {
      const k = m.content?.card;
      if (m.content?.kind !== 'card' || !k) continue;
      if (k.type === 'approval') {
        const a: any = byId.get(k.actionId);
        cards.push({ tool: k.tool, actionStatus: a?.status ?? null, milli: milli(a?.args), diff: k.diff, summary: String(k.summary ?? '').slice(0, 160) });
      } else if (k.type === 'receipt' && k.status === 'not_executed' && /No card was made/.test(k.text ?? '')) refusals.push({ tool: k.tool, text: String(k.text).slice(0, 400) });
      else if (k.type === 'receipt' && k.status === 'confirmed' && /^(cap|wallet|budget)\./.test(k.tool ?? '')) done.push({ tool: k.tool });
    }
    // Action rows that are proposals but have no message card (plan steps waiting for a tap still make a card; listed in case).
    const cardIds = new Set(msgs.rows.filter((m: any) => m.content?.card?.type === 'approval').map((m: any) => m.content.card.actionId));
    const orphan = acts.rows.filter((a: any) => a.status === 'proposed' && !cardIds.has(a.id) && milli(a.args).length).map((a: any) => ({ tool: a.tool, milli: milli(a.args) }));
    const doneMoney = acts.rows.filter((a: any) => a.status === 'executed' && milli(a.args).length).map((a: any) => ({ tool: a.tool, milli: milli(a.args) }));
    const moneyCards = cards.filter(x => x.milli.length);
    if (!moneyCards.length && !refusals.length && !orphan.length && !doneMoney.length && !done.length) continue;
    const server = memberRupees(msg, true), serverMarked = memberRupees(msg, false);
    const pointer = moneyCards.map(x => ({ tool: x.tool, amounts: x.milli.map((f: any) => f.rupees),
      matchesMemberFigure: server.length ? x.milli.every((f: any) => server.some(a => Math.abs(a - f.rupees) <= Math.max(0.005, a * 0.005))) : null,
      memberNamedNoFigure: server.length === 0 }));
    console.log(JSON.stringify({ run: label, task: w.task, message: msg, memberRupees: server, memberRupeesMarkedOnly: serverMarked, plainRupees: plain(msg),
      moneyCards, otherCards: cards.filter(x => !x.milli.length).map(x => x.tool), refusals, orphanProposals: orphan, executedMoneyActions: doneMoney, confirmedMoneyReceipts: done, pointer }));
  }
  await c.end();
}
