// Safety module: the reply door and the caller signals as read tools, so the UI and the Operator can preview what the
// door would do to a sentence before any call runs. The predicates themselves live in shared/safety (the runtime and
// the compile step import them directly); this module only exposes them. Nothing here writes, so there is no table.
import type { Module } from '../../app.ts';
import { tool } from '../../tools.ts';
import { CALL_CATEGORIES, JOBS, SECTOR_PACKS, type CallCategory, type Fact, type Job, type SectorPack } from '../../../shared/agent-config.ts';
import { arr, bool, num, obj, opt, str } from '../../../shared/validate.ts';
import { callerSignals, replyDoor, rulesSummary, type DoorContext } from '../../../shared/safety/index.ts';
import cases from '../../../shared/safety/cases.json' with { type: 'json' };

const fact = obj({
  key: str({ min: 1, max: 80 }),
  value: str({ max: 500 }),
  purpose: str({ oneOf: ['service', 'offer', 'identity', 'logistics'] as const }),
  source: str({ max: 200 }),
  perContact: opt(bool()),
});

// Every field is optional: a preview fills the rest with the defaults a service call starts from.
const doorCtx = obj({
  category: opt(str({ oneOf: CALL_CATEGORIES })),
  sectorPacks: opt(arr(str({ oneOf: SECTOR_PACKS }), { max: SECTOR_PACKS.length })),
  brand: opt(obj({ name: str({ max: 120 }), verifiedDomains: arr(str({ max: 253 }), { max: 20 }) })),
  facts: opt(arr(fact, { max: 100 })),
  neverSay: opt(arr(str({ max: 200 }), { max: 100 })),
  disclosed: opt(bool()),
  identityVerified: opt(bool()),
  recordingRefused: opt(bool()),
  crisis: opt(bool()),
  turnIndex: opt(num({ min: 0, max: 10_000, int: true })),
  job: opt(str({ oneOf: JOBS })),
});

const checkInput = obj({
  text: str({ min: 1, max: 2000, desc: 'one sentence the agent would say, or (speaker = caller) one caller utterance' }),
  speaker: opt(str({ oneOf: ['agent', 'caller'] as const })),
  ctx: opt(doorCtx),
});

type CtxIn = NonNullable<ReturnType<typeof checkInput>['ctx']>;
// The validators above admit only the listed values, so the narrowing casts below are checked at the boundary.
function fillCtx(c: CtxIn = {} as CtxIn): DoorContext {
  return {
    category: (c.category ?? 'service') as CallCategory,
    sectorPacks: (c.sectorPacks ?? ['base']) as SectorPack[],
    brand: c.brand ?? { name: '', verifiedDomains: [] },
    facts: (c.facts ?? []) as Fact[],
    neverSay: c.neverSay ?? [],
    disclosed: c.disclosed ?? true,
    identityVerified: c.identityVerified ?? true,
    recordingRefused: c.recordingRefused ?? false,
    crisis: c.crisis ?? false,
    turnIndex: c.turnIndex ?? 1,
    ...(c.job ? { job: c.job as Job } : {}),
  };
}

export const module: Module = {
  name: 'safety',
  register(registry) {
    registry.register(tool(checkInput, {
      name: 'safety.check',
      risk: 'read',
      summary: 'Preview the safety door: what it does to one agent sentence (pass, replace, block) or which signals one caller line raises',
      async run(_ctx, input) {
        if (input.speaker === 'caller') return { speaker: 'caller' as const, signals: callerSignals(input.text) };
        return { speaker: 'agent' as const, verdict: replyDoor(input.text, fillCtx(input.ctx)) };
      },
    }));

    registry.register(tool(obj({}), {
      name: 'safety.cases',
      risk: 'read',
      summary: 'List the safety rules and the counts of test vectors that hold them',
      async run() {
        const all = (cases as { cases: { fn: string; label: string; rule: string }[] }).cases;
        const count = (pick: (c: (typeof all)[number]) => string) =>
          all.reduce<Record<string, number>>((m, c) => { const k = pick(c); m[k] = (m[k] ?? 0) + 1; return m; }, {});
        return { rules: rulesSummary(), cases: { total: all.length, byLabel: count(c => c.label), byFn: count(c => c.fn), byRule: count(c => c.rule) } };
      },
    }));
  },
};
