// The recitable-line lint. Inherited law: sentence-shaped prompt text gets recited (quoted lines recited 4/5, 0 after
// removal), so every shape field must read as a note about behaviour, never as a line she could say. This runs on every
// creation path and at compile; any finding refuses the compile, naming the field.
import type { AgentConfig } from '../../../shared/agent-config.ts';

export interface ShapeFinding { rule: 'SHAPE'; path: string; message: string }

const QUOTED = /["“”«»„]|(^|\s)'[^']*\s[^']*'/;
const FIRST_PERSON = /(^|[^\p{L}'])(I|I'm|I am|I'll|I've|me|my|we|we're|we'll|we've|our|us)(?![\p{L}'])/iu;
const FIRST_PERSON_HI = /(?<![\p{L}\p{M}])(mai|mera|meri|mere|hum|hamara|hamari|hamare|मैं|मेरा|मेरी|मेरे|हम|हमारा|हमारी|हमारे)(?![\p{L}\p{M}])/iu;
const GREETING = /^\s*(hi|hello|hey|namaste|namaskar|good (morning|afternoon|evening)|dear|thank you|thanks|welcome)\b|नमस्ते|नमस्कार/i;
const DIRECTION = /\[[^\]]*\]|<[^>]*>/;
const DEVANAGARI = /[ऀ-ॿ]/;
const DIGIT = /\d/;

type Check = [RegExp, string];
const LINE_CHECKS: Check[] = [
  [QUOTED, 'quoted text gets recited word for word; describe the behaviour instead'],
  [FIRST_PERSON, 'first-person wording reads as a line to say; write it as a note about what she does'],
  [FIRST_PERSON_HI, 'first-person wording reads as a line to say; write it as a note about what she does'],
  [GREETING, 'a greeting is a scripted line; the opening shape covers how she greets'],
  [DIRECTION, 'bracketed or tagged directions are spoken or garbled by voices; remove them'],
];
const SHAPE_ONLY: Check[] = [
  [/\?\s*$/, 'a question here becomes the question she asks; describe what she needs to learn instead'],
  [DEVANAGARI, 'shape fields are notes in English; Hindi text here gets recited'],
  [DIGIT, 'numbers belong in facts rows, where they can be checked; not in shapes'],
];

/** Fields that describe behaviour. Everything here must be a note, never a line. */
export function shapeFields(c: AgentConfig): [string, string][] {
  const out: [string, string][] = [];
  if (c.jobDescription) out.push(['jobDescription', c.jobDescription]);
  c.persona.notes.forEach((n, i) => out.push([`persona.notes[${i}]`, n]));
  c.goals.forEach((g, i) => out.push([`goals[${i}].description`, g.description]));
  out.push(['opening.disclosureClause', c.opening.disclosureClause], ['opening.usefulFirst', c.opening.usefulFirst]);
  c.objections.forEach((o, i) => out.push([`objections[${i}].trigger`, o.trigger], [`objections[${i}].approach`, o.approach]));
  return out;
}

export function shapeLint(c: AgentConfig): ShapeFinding[] {
  const found: ShapeFinding[] = [];
  const run = (path: string, text: string, checks: Check[]) => {
    for (const [rx, message] of checks) if (rx.test(text)) { found.push({ rule: 'SHAPE', path, message }); return; }
  };
  for (const [path, text] of shapeFields(c)) run(path, text, [...LINE_CHECKS, ...SHAPE_ONLY]);
  // Facts are data and may hold numbers and Hindi names, but never a scripted line.
  c.facts.forEach((f, i) => run(`facts[${i}].value`, f.value, LINE_CHECKS.filter(([rx]) => rx !== DIRECTION)));
  return found;
}
