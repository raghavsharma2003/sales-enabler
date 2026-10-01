import type { ReviewColumn } from '../business/contracts';
import type { AnswerField, AnswerSource, AnswerTurn, AnswerValue } from './contracts';
import { HttpError } from '../server/http';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const negative = /\b(no|not|never|neither|without|decline|declined|refuse|refused|don't|doesn't|didn't|cannot|can't|won't|isn't|wasn't|aren't)\b/i;
const uncertain = /\b(maybe|perhaps|unsure|uncertain|probably|might|possibly|not sure|don't know|do not know|I think|roughly|approximately|about|around|if|would|could|suppose|hypothetical|used to|previously)\b/i;
const retracted = /\b(actually|correction|rather|instead|I mean|scratch that|ignore that|forget that|take that back|no wait|sorry|not really|not anymore|no longer|wrong|incorrect|on second thought)\b|[,;.!?]\s*(?:no|never mind)\b|\bI (?:am not|don't|do not)[.!]?\s*$/i;
const sensitive = /\b(consent|permission|verified|identity|authenticated|opt.?in)\b/i;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fieldTerms = (column: ReviewColumn) => {
  const label = column.label.trim().toLowerCase(), key = column.key.replaceAll('_', ' ').trim().toLowerCase();
  // Prefer the more specific complete field name: "annual budget" must not bind to "monthly budget".
  return [label.split(/\s+/).length >= key.split(/\s+/).length ? label : key];
};
const clauses = (text: string) => text.split(/[!?;\n]|\.(?!\d)|\b(?:but|however|although|yet)\b/i).map(clause => clause.trim().replace(/,$/, ''));
const mentionsField = (column: ReviewColumn, text: string) => fieldTerms(column).some(term => new RegExp(`\\b${escape(term)}\\b`, 'i').test(text));
function questionFor(column: ReviewColumn, source: AnswerSource, turns?: AnswerTurn[]): boolean {
  const previous = turns?.[source.turnIndex - 1];
  if (!previous || previous.role !== 'assistant' || typeof previous.text !== 'string') return false;
  const text = previous.text.trim();
  const aboutCaller = /\b(you|your)\b/i.test(text) || fieldTerms(column).some(name => text.toLowerCase() === `${name}?`);
  return aboutCaller && text.endsWith('?') && (text.match(/\?/g) || []).length === 1 && !negative.test(text) && !uncertain.test(text) && !/\b(and|or|friend|colleague|partner|they|he|she|customer)\b/i.test(text) && mentionsField(column, text);
}
function booleanProposition(column: ReviewColumn, text: string): boolean | undefined {
  const outcomes = new Set<boolean>();
  for (const clause of clauses(text)) for (const term of fieldTerms(column)) {
    if (!new RegExp(`\\b${escape(term)}\\b`, 'i').test(clause)) continue;
    const localNo = new RegExp(`\\b(?:not|never|isn't|aren't|wasn't|don't|do not|cannot|can't)\\s+(?:(?:really|currently|very|have|feel)\\s+)?${escape(term)}\\b`, 'i').test(clause);
    // A first-person statement or explicit field:value form is required. Other people's predicates are not caller facts.
    const firstPerson = /^\s*(?:yes[,\s]+|no[,\s]+)?(?:I\b|I'm\b|I've\b|my\b)/i.test(clause);
    const labelled = new RegExp(`^\\s*${escape(term)}\\s*:\\s*(yes|no|true|false)\\s*[.,]?$`, 'i').exec(clause);
    if (labelled) { outcomes.add(/^(yes|true)$/i.test(labelled[1])); continue; }
    if (!firstPerson || /\b(friend|colleague|partner|they|he|she)\b/i.test(clause)) continue;
    if (localNo) outcomes.add(false);
    else if (!negative.test(clause) && /\b(am|want|need|prefer|have|will|agree)\b|\bI'm\b/i.test(clause)) outcomes.add(true);
  }
  return outcomes.size === 1 ? [...outcomes][0] : undefined;
}
function explicitFieldValue(column: ReviewColumn, text: string, value: string): boolean {
  // Deliberately small grammar: a literal field name followed by its value. Mere co-occurrence is insufficient.
  return clauses(text).some(clause => !negative.test(clause) && fieldTerms(column).some(term => new RegExp(`^(?:my\\s+)?${escape(term)}\\s*(?:(?:is|was|equals|of|at)\\s*|[:=]\\s*)(?:[$€£₹]\\s*)?${escape(value)}(?![\\p{L}\\p{N}.])`, 'iu').test(clause)));
}

const smallNumbers = ['zero','one','two','three','four','five','six','seven','eight','nine','ten'];
const ratingNumber = (text: string) => /^\d+$/.test(text) ? Number(text) : smallNumbers.indexOf(text.toLowerCase());
/** A named first-person clarity rating on an explicit reviewed scale, not general numeric coercion. */
function explicitRatings(column: ReviewColumn, text: string): { value: number; clause: string }[] {
  if (column.type !== 'number' || !/\bhow clear\b/i.test(column.label)) return [];
  const scale = /\bscale of (zero|one|0|1) to (five|ten|5|10)\b/i.exec(column.label);
  if (!scale) return [];
  const minimum = ratingNumber(scale[1]), maximum = ratingNumber(scale[2]);
  const fieldWords = new Set((column.label.toLowerCase().replace(/\bclear\b/g,'clarity').match(/[a-z]+/g) || []));
  const results: { value: number; clause: string }[] = [];
  for (const clause of clauses(text)) {
    const matched = /^(?:I (?:would )?rate (?:the |my )?(.+?)|My (.+?) score is) (zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+) out of (five|ten|5|10)$/i.exec(clause);
    if (!matched) continue;
    const subject = (matched[1] || matched[2]).toLowerCase().split(/\s+/);
    // Require both the rated dimension and its subject; a different workshop,
    // another person's score, or an unrelated numeral cannot supply this field.
    if (subject.length < 2 || !subject.includes('clarity') || subject.some(word => !fieldWords.has(word)) || /\b(friend|colleague|partner|they|he|she|his|her|their)\b/i.test(clause)) continue;
    const value = ratingNumber(matched[3]);
    if (ratingNumber(matched[4]) === maximum && value >= minimum && value <= maximum) results.push({value,clause});
  }
  return results;
}

/** Offsets and receipt timestamps are located exclusively in saved caller text. */
export function locateSource(turns: AnswerTurn[], quote: unknown, turnIndex: unknown, scope: 'typed' | 'literal_text' = 'typed'): AnswerSource {
  if (typeof quote !== 'string' || !quote.trim() || quote.length > 2000 || !Number.isSafeInteger(turnIndex)) throw new HttpError(400, 'Choose a bounded exact caller quote and turn.');
  const turn = turns[turnIndex as number];
  if (!turn || turn.role !== 'user' || typeof turn.text !== 'string') throw new HttpError(400, 'Evidence must come from a saved caller turn.');
  const start = turn.text.indexOf(quote);
  if (start < 0 || turn.text.indexOf(quote, start + 1) !== -1) throw new HttpError(400, 'Use a unique exact caller excerpt, including its surrounding context.');
  // Do not allow a substring to strip a preceding negation or uncertainty.
  const sentenceStart = Math.max(turn.text.lastIndexOf('.', start - 1), turn.text.lastIndexOf('!', start - 1), turn.text.lastIndexOf('?', start - 1), turn.text.lastIndexOf('\n', start - 1)) + 1;
  const prefix = turn.text.slice(sentenceStart, start);
  if ((negative.test(prefix) && !negative.test(quote)) || (uncertain.test(prefix) && !uncertain.test(quote))) throw new HttpError(400, 'Include the caller’s negation or uncertainty in the quote.');
  if (scope !== 'literal_text' && ((uncertain.test(turn.text) && !uncertain.test(quote)) || (retracted.test(turn.text) && !retracted.test(quote)))) throw new HttpError(400, 'The full caller turn contains uncertainty or a retraction. Keep this answer unknown.');
  return { quote, turnIndex: turnIndex as number, start, end: start + quote.length, ...(typeof turn.receivedAt === 'string' ? { receivedAt: turn.receivedAt } : {}) };
}

/** Text answers are complete verbatim clauses, not claims that a hypothetical request already happened. */
function literalTextSupported(value: unknown, source: AnswerSource, fullText: string): value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000 || value !== value.trim() || !source.quote.includes(value)) return false;
  const literal = value.replace(/[.!?;]+$/, '').trimEnd(), start = fullText.indexOf(literal), end = start + literal.length;
  if (start < 0 || fullText.indexOf(literal, start + 1) !== -1) return false;
  const spans: { start: number; end: number; text: string; separator: string }[] = [];
  let previous = 0;
  const add = (until: number, separator: string) => {
    const raw = fullText.slice(previous, until), text = raw.trim();
    if (text) { const offset = raw.indexOf(text); spans.push({ start: previous + offset, end: previous + offset + text.length, text, separator }); }
  };
  for (const match of fullText.matchAll(/[.!?;\n]+|,\s*(?:but|however|although|yet)\s+/gi)) { add(match.index!, match[0]); previous = match.index! + match[0].length; }
  add(fullText.length, '');
  const first = spans.findIndex(span => span.start === start), last = spans.findIndex(span => span.end === end);
  // Cropping within a clause can drop "not", "maybe", a qualification or the predicate itself.
  if (first < 0 || last < first) return false;
  if (retracted.test(fullText) && !retracted.test(value)) return false;
  if (/\b(but|however|although|yet)\b/i.test(spans[last].separator) && spans[last + 1] && negative.test(spans[last + 1].text)) return false;
  const terms = (literal.toLowerCase().match(/[a-z]{4,}/g) || []).filter(term => !['this', 'that', 'have', 'from', 'with', 'would', 'could', 'should', 'please', 'after', 'before', 'been', 'were', 'they', 'there', 'their'].includes(term));
  if (spans.slice(last + 1).some(span => negative.test(span.text) && terms.some(term => new RegExp(`\\b${escape(term)}\\b`, 'i').test(span.text)))) return false;
  return true;
}

/** Conservative literal support; ambiguous semantics stay unknown for human follow-up. */
export function supportedValue(column: ReviewColumn, value: unknown, source: AnswerSource, turns?: AnswerTurn[]): value is AnswerValue {
  const quote = source.quote.trim();
  const fullText = turns?.[source.turnIndex]?.text || quote;
  if (sensitive.test(`${column.key.replaceAll('_', ' ')} ${column.label}`)) return false;
  if (column.type === 'text') return literalTextSupported(value, source, fullText);
  if (column.type === 'number' && typeof value === 'number') {
    const ratings = explicitRatings(column,fullText);
    if (ratings.some(rating => rating.value === value) && explicitRatings(column,quote).some(rating => rating.value === value)) {
      // "I would rate ..." is a conventional explicit rating only in the exact
      // grammar above. Other modal clauses and qualifications remain uncertain.
      const certaintyText = ratings.reduce((text,rating) => text.replace(rating.clause,rating.clause.replace(/\bwould\s+/i,'')),fullText);
      return !negative.test(certaintyText) && !uncertain.test(certaintyText) && !retracted.test(certaintyText);
    }
  }
  if (uncertain.test(fullText) || retracted.test(fullText)) return false;
  if (column.type === 'boolean') {
    if (typeof value !== 'boolean' || negative.test(column.label)) return false;
    if (questionFor(column, source, turns) && /^(yes|no|true|false)[.!]?$/i.test(fullText.trim())) return value === /^(yes|true)/i.test(fullText.trim());
    return booleanProposition(column, fullText) === value && booleanProposition(column, quote) === value;
  }
  if (negative.test(fullText)) return false;
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  const directlyBound = explicitFieldValue(column, fullText, String(value));
  const questionBound = questionFor(column, source, turns) && fullText.trim().replace(/[.!]$/, '') === String(value);
  if (!directlyBound && !questionBound) return false;
  if (column.type === 'enum') {
    const options = column.options?.filter(option => new RegExp(`(?<![\\p{L}\\p{N}])${option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu').test(quote)) || [];
    return typeof value === 'string' && options.length === 1 && options[0] === value;
  }
  if (column.type === 'number') { const numbers = quote.match(/[-+]?(?:\d+(?:\.\d+)?|\.\d+)/g) || []; return typeof value === 'number' && Number.isFinite(value) && numbers.length === 1 && Number(numbers[0]) === value && !/[−–]\s*\d|\d\s*(?:[kKmMbBlL]\b|cr\b|thousand\b|million\b|billion\b|la[ck]h?\b|crore\b|%)/.test(quote); }
  if (column.type === 'date') { const dates = quote.match(/\b\d{4}-\d{2}-\d{2}\b/g) || []; return typeof value === 'string' && dates.length === 1 && dates[0] === value && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
  return false;
}

function explicitCallerValues(column: ReviewColumn, turns: AnswerTurn[]): { value: AnswerValue; source: AnswerSource }[] {
  const entries: { value: AnswerValue; source: AnswerSource }[] = [];
  for (const [turnIndex, turn] of turns.entries()) {
    if (turn.role !== 'user' || typeof turn.text !== 'string' || !turn.text.trim() || turn.text.length > 2000) continue;
    for (const excerpt of new Set(['number', 'date', 'enum'].includes(column.type) ? [turn.text, ...clauses(turn.text).filter(Boolean)] : [turn.text])) {
      let source: AnswerSource;
      try { source = locateSource(turns, excerpt, turnIndex, column.type === 'text' ? 'literal_text' : 'typed'); } catch { continue; }
      const possible: AnswerValue[] = column.type === 'boolean' ? [true, false]
        : column.type === 'number' ? [...(excerpt.match(/[-+]?(?:\d+(?:\.\d+)?|\.\d+)/g) || []).map(Number), ...explicitRatings(column,excerpt).map(rating => rating.value)]
          : column.type === 'date' ? excerpt.match(/\b\d{4}-\d{2}-\d{2}\b/g) || []
            : column.type === 'enum' ? column.options || []
              : questionFor(column, source, turns) ? [excerpt.trim()] : [];
      for (const value of possible) if (supportedValue(column, value, source, turns)) entries.push({ value, source });
    }
  }
  return entries;
}
export function conflictingCallerEvidence(column: ReviewColumn, turns: AnswerTurn[]): boolean {
  return new Set(explicitCallerValues(column, turns).map(entry => JSON.stringify(entry.value))).size > 1;
}

export function validateAnswers(text: string, columns: ReviewColumn[], turns: AnswerTurn[]): AnswerField[] {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new HttpError(502, 'Extraction returned invalid JSON. The original reply is retained; no automatic retry.'); }
  if (!object(parsed) || Object.keys(parsed).some(key => key !== 'answers') || !Array.isArray(parsed.answers) || parsed.answers.length > 36) throw new HttpError(502, 'Extraction returned an unsupported answer structure.');
  const answers = parsed.answers;
  if (answers.some(item => !object(item) || Object.keys(item).some(key => !['key', 'state', 'value', 'quote', 'turnIndex'].includes(key)) || typeof item.key !== 'string' || !columns.some(column => column.key === item.key))) throw new HttpError(502, 'Extraction included unsupported fields or identity bindings.');
  return columns.map(column => {
    const matches = answers.filter(item => item.key === column.key);
    const sources: AnswerSource[] = [], values: AnswerValue[] = [];
    let invalid = false, conflicting = false;
    for (const item of matches) {
      if (!['proposed', 'unknown', 'conflicting'].includes(String(item.state))) { invalid = true; continue; }
      if (item.state === 'unknown') { if (item.value !== undefined && item.value !== null) invalid = true; continue; }
      conflicting ||= item.state === 'conflicting';
      try {
        const source = locateSource(turns, item.quote, item.turnIndex, column.type === 'text' ? 'literal_text' : 'typed');
        sources.push(source);
        if (supportedValue(column, item.value, source, turns)) values.push(item.value);
        else invalid = true;
      } catch { invalid = true; }
    }
    // Recheck every explicit, field-bound caller answer, including evidence omitted by the model.
    for (const { value, source } of explicitCallerValues(column, turns)) {
      values.push(value);
      if (!sources.some(item => item.turnIndex === source.turnIndex && item.quote === source.quote)) sources.push(source);
    }
    conflicting ||= new Set(values.map(value => JSON.stringify(value))).size > 1;
    if (conflicting) return { column, state: 'conflicting', sources, reason: 'Conflicting caller evidence. Mark unknown or rejected and clarify with the caller.' };
    if (!matches.length || !values.length || invalid) return { column, state: 'unknown', sources, reason: sensitive.test(`${column.key.replaceAll('_', ' ')} ${column.label}`) ? 'Consent and verified identity require their dedicated review workflow.' : 'No unambiguous, literal caller answer supports this field.' };
    return { column, state: 'proposed', value: values[0], sources, reason: 'Review the caller’s exact words before accepting.' };
  });
}
