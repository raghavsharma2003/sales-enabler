// shared/safety/fixed-lines.json: her fixed lines (bridge, call-back, limit, takeover, member drop, silence) for every
// agent language, in that language's script, and every one passes the TS reply door. Parity: voice/tests/test_fixed_lines.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replyDoor, type DoorContext } from '../shared/safety/index.ts';
import { LANGUAGES } from '../shared/agent-config.ts';
import raw from '../shared/safety/fixed-lines.json' with { type: 'json' };

type Line = string | { female: string; male: string };
const F = raw as unknown as { keys: string[]; scripts: Record<string, string>; lines: Record<string, Record<string, Line>>; fallback: string };
const RANGES: Record<string, RegExp> = { Latn: /[A-Za-z]/gu, Deva: /[ऀ-ॿ]/gu, Taml: /[஀-௿]/gu, Beng: /[ঀ-৿]/gu,
  Knda: /[ಀ-೿]/gu, Telu: /[ఀ-౿]/gu, Mlym: /[ഀ-ൿ]/gu, Gujr: /[઀-૿]/gu, Guru: /[਀-੿]/gu, Orya: /[଀-୿]/gu };
const CTX: DoorContext = { category: 'service', sectorPacks: ['base'], brand: { name: 'Suraksha Health', verifiedDomains: [] }, facts: [], neverSay: [],
  disclosed: true, identityVerified: true, recordingRefused: false, crisis: false, turnIndex: 3 } as DoorContext;

const forms = (l: Line) => typeof l === 'string' ? [l] : [l.female, l.male];

test('fixed lines: every agent language has every line, in its own script', () => {
  for (const lang of LANGUAGES) {
    const table = F.lines[lang]; assert.ok(table, lang);
    const rx = RANGES[F.scripts[lang]!]!; assert.ok(rx, `${lang} script`);
    for (const key of F.keys) {
      assert.ok(table[key], `${lang} ${key}`);
      for (const s of forms(table[key]!)) {
        const letters = [...s].filter(ch => /\p{L}/u.test(ch)).length;
        const own = (s.match(rx) ?? []).length;
        assert.ok(own / letters > 0.8, `${lang} ${key} is in ${F.scripts[lang]}: ${s}`);
      }
    }
  }
});

test('fixed lines: every line passes the reply door', () => {
  for (const [lang, table] of Object.entries(F.lines)) for (const [key, l] of Object.entries(table)) for (const s of forms(l)) {
    assert.equal(replyDoor(s, CTX).action, 'pass', `${lang} ${key}: ${s}`);
  }
});
