// agent.create from a description: the drafting contract (agents/draft.ts). On real models both gpt-4.1 and gpt-4.1-mini
// returned languages.mirrorCaller as a language code, and strict validation refused every such draft
// (research/2026-10-23/benches/README.md, bug 2). The prompt now states the type, and a draft that fails validation
// gets one repair turn carrying the exact error; a second failure is refused with a reason that names the field.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { setFakeLlm, type LlmRequest } from '../server/llm.ts';
import { draftFromDescription, DraftError } from '../server/modules/agents/draft.ts';

after(() => setFakeLlm(null));

const DRAFT = {
  brand: { name: 'Smile Dental Clinic', spokenName: 'Smile Dental', verifiedDomains: [] },
  job: 'appointment_confirmation', category: 'service', sectorPacks: ['healthcare'],
  languages: { primary: 'en-IN', allowed: ['en-IN', 'hi-IN', 'hinglish'], mirrorCaller: true },
  persona: { name: 'Isha', gender: 'female', register: 'warm_peer', energy: 3, humour: 1, honorific: 'aap', notes: ['calm with nervous patients'] },
  goals: [{ id: 'confirm_or_move', description: 'the appointment is confirmed or moved', outcome: 'appointment_status', required: true }],
  facts: [{ key: 'appointment', value: 'date and time from the contact record', purpose: 'service', perContact: true }],
  neverSay: [], opening: { disclosureClause: 'mentions in passing that she is the clinic\'s AI assistant', usefulFirst: 'the appointment is tomorrow' },
  objections: [], handOff: { when: ['asks_for_human'], target: { kind: 'callback' }, warmSummary: true },
};
const reply = (o: unknown) => ({ text: JSON.stringify(o), toolCalls: [], usage: { inputTokens: 10, outputTokens: 10 }, model: 'fake', provider: 'fake' });
const asSeen = { ...DRAFT, languages: { primary: 'en-IN', allowed: ['en-IN', 'hi-IN', 'hinglish'], mirrorCaller: 'en-IN' } };   // what both models returned

test('the prompt says mirrorCaller is true or false', async () => {
  const seen: LlmRequest[] = [];
  setFakeLlm(req => { seen.push(req); return reply(DRAFT); });
  await draftFromDescription('A reminder agent for Smile Dental Clinic that confirms appointments a day ahead.');
  assert.match(seen[0]!.messages[0]!.content, /mirrorCaller \(true or false/);
});

test('a draft that fails validation gets one repair turn with the exact error, then passes', async () => {
  const seen: LlmRequest[] = [];
  setFakeLlm(req => { seen.push(req); return reply(seen.length === 1 ? asSeen : DRAFT); });
  const { config } = await draftFromDescription('A reminder agent for Smile Dental Clinic that confirms appointments a day ahead.');
  assert.equal(config.languages.mirrorCaller, true);
  assert.equal(seen.length, 2);
  assert.match(seen[1]!.messages.at(-1)!.content, /languages\.mirrorCaller: must be true or false/);
});

test('a second failure is refused with a reason that names the field and the accepted form; nothing is guessed', async () => {
  let n = 0;
  setFakeLlm(() => { n++; return reply(asSeen); });
  await assert.rejects(draftFromDescription('A reminder agent for Smile Dental Clinic.'), (e: unknown) =>
    e instanceof DraftError && /languages\.mirrorCaller/.test(e.message) && /true or false/.test(e.message));
  assert.equal(n, 2, 'one repair turn, no more');
});
