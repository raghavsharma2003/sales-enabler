// Contract between the agents compiler and the voice runtime (product/voice): marker spellings, the brief hash format,
// per-contact facts and the marker rules. Where python3 can import vpvoice, the runtime's own parser checks the text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentConfig } from '../shared/agent-config.ts';
import { compile, contactRows, CONTACT_ROWS_HEADER, markerRules, PER_CONTACT } from '../server/modules/agents/compile.ts';
import { TEMPLATES } from '../server/modules/agents/templates.ts';

const VOICE = join(dirname(fileURLToPath(import.meta.url)), '..', 'voice');
// Every <...> or [..] form the runtime understands; anything else in a brief would be spoken or garbled.
const ALLOWED_TAG = /^<(end_call|goal:[A-Za-z0-9_.-]{1,64}|tool:[A-Za-z0-9_.-]{1,64}|handoff:[A-Za-z_]{1,40}|goal:ID|tool:NAME|handoff:REASON|laugh|chuckle|sigh|breath)>$/;

/** Every template, with each kind of stack, so voice-specific sections (sounds, delivery) are covered too. */
function variants(): { id: string; agent: AgentConfig }[] {
  return TEMPLATES.flatMap(t => ['', 'v2-flashlite', 'v2-mai', 'v2-live'].map(stackId =>
    ({ id: `${t.id}/${stackId || 'no-stack'}`, agent: { ...t.config, voice: { stackId } } })));
}

test('the brief teaches only the runtime marker spellings', () => {
  for (const { id, agent } of variants()) {
    const text = compile(agent).text;
    for (const tag of text.match(/<[^<>\n]{1,80}>/g) ?? []) assert.match(tag, ALLOWED_TAG, `${id}: ${tag}`);
    assert.match(text, /writing <end_call> at the very end of that reply/, id);
    assert.doesNotMatch(text, /end_call tool|\[end_call\]|<hangup>|<end call>|<\/end_call>/i, id);
    for (const tag of (text + markerRules(agent)).match(/\[[^\]\n]{0,60}\]/g) ?? []) assert.match(tag, /^\[tone: /, `${id}: ${tag}`);
  }
});

test('brief.hash is the bare sha256 hex of brief.text (the runtime also accepts a sha256: prefix)', () => {
  for (const t of TEMPLATES) {
    const b = compile(t.config);
    assert.equal(b.hash, createHash('sha256').update(b.text, 'utf8').digest('hex'));
    assert.match(b.hash, /^(sha256:)?[0-9a-f]{64}$/);                      // product/voice/vpvoice/ticket.py HEX64
    assert.equal(b.bytes, Buffer.byteLength(b.text, 'utf8'));
  }
});

test('per-contact facts never enter the brief: it points at the contact rows block, which carries the values', () => {
  const t = TEMPLATES.find(x => x.id === 'insurance-renewal')!;
  const text = compile(t.config).text;
  const per = t.config.facts.filter(f => f.perContact);
  assert.ok(per.length >= 2);
  for (const f of per) {
    assert.ok(text.includes(`${f.key.replace(/_/g, ' ')}: ${PER_CONTACT}`), f.key);
    assert.ok(!text.includes(f.value), `${f.key}: the template's placeholder value is not in the brief`);
  }
  const rows = contactRows({ premium: '18,450 rupees', renewal_due: '2 November' });
  assert.equal(rows, `${CONTACT_ROWS_HEADER}\npremium: 18,450 rupees\nrenewal due: 2 November`, 'same key spelling as the facts rows');
  assert.equal(contactRows({}), `${CONTACT_ROWS_HEADER}\nnone`);
});

const py = spawnSync('python3', ['-I', '-c', 'import sys; sys.path.insert(0, sys.argv[1]); import vpvoice.brief', VOICE], { encoding: 'utf8' });
const noPython = py.status !== 0 ? 'python3 cannot import product/voice/vpvoice' : false;

test("the voice runtime's own parser agrees: marker rules match, the brief parses to no goal/tool/handoff, nothing tag-like is spoken", { skip: noPython }, () => {
  const items = variants().map(({ id, agent }) => ({ id, agent, text: compile(agent).text }));
  const script = `
import sys, json
sys.path.insert(0, sys.argv[1])
from vpvoice import brief
out = []
for it in json.load(sys.stdin):
    t = it['text']
    tags = brief.ANY_TAG.findall(t)
    known = [g for g in tags if brief.END.fullmatch(g) or brief.SOUND_TAG.fullmatch(g) or brief.GOAL.fullmatch(g) or brief.TOOL.fullmatch(g) or brief.HANDOFF.fullmatch(g)]
    m = brief.markers(t)
    out.append({'id': it['id'], 'rules': brief.marker_rules(it['agent']), 'unknown': [g for g in tags if g not in known],
                'goals': m['goals'], 'tools': m['tools'], 'handoff': m['handoff'], 'spoken_has_tag': '<' in brief.spoken(t, keep_sounds=False)})
print(json.dumps(out))`;
  const r = spawnSync('python3', ['-I', '-c', script, VOICE], { input: JSON.stringify(items), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr);
  const res: { id: string; rules: string; unknown: string[]; goals: unknown[]; tools: unknown[]; handoff: unknown; spoken_has_tag: boolean }[] = JSON.parse(r.stdout);
  assert.equal(res.length, items.length);
  for (const [i, x] of res.entries()) {
    assert.equal(x.rules, markerRules(items[i].agent), `${x.id}: TS markerRules mirrors the runtime's marker_rules`);
    assert.deepEqual(x.unknown, [], x.id);
    assert.deepEqual([x.goals, x.tools, x.handoff], [[], [], null], `${x.id}: the static brief settles nothing by itself`);
    assert.equal(x.spoken_has_tag, false, x.id);
  }
});
