// Parity with product/voice/tests/test_disclosure.py: the same disclosure.json vectors, judged by the TS door. A text
// affirms she is an AI when it carries lexicon.ai_affirm and no RD2 rule fires on it (as safety.py affirms_ai does).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandLexicon, normalise, replyDoor, type DoorContext } from '../shared/safety/index.ts';
import { DISCLOSURE, disclosureLine } from '../shared/safety/disclosure.ts';
import raw from '../shared/safety/disclosure.json' with { type: 'json' };

const V = raw as unknown as { render_vectors: { brand: string; language: string | null; line: string }[]; affirm_vectors: { text: string; affirms: boolean }[] };
const AFFIRM = new RegExp(expandLexicon('@ai_affirm'), 'iu');
const NEUTRAL: DoorContext = { category: 'service', sectorPacks: ['base'], brand: { name: '', verifiedDomains: [] }, facts: [], neverSay: [],
  disclosed: true, identityVerified: true, recordingRefused: false, crisis: false, turnIndex: 1 } as DoorContext;
const affirms = (text: string) => {
  const v = replyDoor(text, NEUTRAL);
  if (v.action !== 'pass' && 'rule' in v && v.rule === 'RD2') return false;
  return AFFIRM.test(normalise(text));
};

test('disclosure: affirm vectors agree with the Python door', () => {
  for (const v of V.affirm_vectors) assert.equal(affirms(v.text), v.affirms, v.text);
});

test('disclosure: every fixed line renders as the Python side renders it, and affirms', () => {
  for (const v of V.render_vectors) assert.equal(disclosureLine(v.brand, v.language), v.line);
  for (const [lang, l] of Object.entries(DISCLOSURE.lines)) {
    for (const k of ['brand', 'nobrand'] as const) assert.ok(affirms(l[k].replace('{brand}', 'Suraksha Health')), `${lang} ${k}`);
  }
});

test('disclosure: the template guidance clause is not a speakable line', () => {
  assert.ok(!Object.values(DISCLOSURE.lines).some(l => /mentioned in passing|that you are/i.test(l.brand + l.nobrand)));
});
