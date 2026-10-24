// Typed extraction fields on an outcome definition (must-be brief 7): what the analysis fills from what the PERSON said.
// Each value is quoted from one caller line, exactly, or left empty; code checks the type and the quote, never the model.
// Sentiment is a field too: a coded five-point scale with the quote that shows it.
import { ValidationError } from '../../../shared/validate.ts';

export const FIELD_TYPES = ['text', 'number', 'date', 'enum', 'sentiment'] as const;
export type FieldType = typeof FIELD_TYPES[number];
export interface FieldDef { key: string; label?: string; type: FieldType; values?: string[] }
export const SENTIMENT_SCALE = ['very_negative', 'negative', 'neutral', 'positive', 'very_positive'] as const;
export const MAX_FIELDS = 12;

/** Throws ValidationError for a definition's fields that code could not check. */
export function validateFields(fields: FieldDef[]): FieldDef[] {
  const seen = new Set<string>();
  fields.forEach((f, i) => {
    const at = `fields[${i}]`;
    if (seen.has(f.key)) throw new ValidationError(`${at}.key`, `"${f.key}" is used twice`);
    seen.add(f.key);
    if (f.type === 'enum') {
      if (!f.values || f.values.length < 2) throw new ValidationError(`${at}.values`, 'a choice field needs at least two values');
      if (new Set(f.values).size !== f.values.length) throw new ValidationError(`${at}.values`, 'values must be distinct');
    } else if (f.values?.length) throw new ValidationError(`${at}.values`, `only a choice field (enum) has values; ${f.type} does not`);
  });
  if (fields.filter(f => f.type === 'sentiment').length > 1) throw new ValidationError('fields', 'one sentiment field is enough');
  return fields;
}

/** The contract lines for fields. Empty when the definition has none, so a definition without fields sends the
 *  measured contract byte for byte (scripts/analysis-variant-probe.ts). */
export function fieldsPrompt(fields: FieldDef[]): string[] {
  if (!fields.length) return [];
  const kind = (f: FieldDef) => f.type === 'enum' ? `one of ${JSON.stringify(f.values)}` : f.type === 'sentiment' ? `one of ${JSON.stringify(SENTIMENT_SCALE)}, how the PERSON feels`
    : f.type === 'number' ? 'a number, digits only' : f.type === 'date' ? 'a date, YYYY-MM-DD' : 'short text';
  return [
    'FIELDS: add "fields":{KEY:{"value":VALUE,"quote":string}|null} to the JSON object; VALUE from what the PERSON said, quoted from that PERSON line; null when they did not say it:',
    ...fields.map(f => `- ${f.key}: ${kind(f)}${f.label ? ` (${f.label})` : ''}`),
  ];
}

export interface FieldValue { value: string | number; quote: string; type: FieldType }
export interface Grounded { values: Record<string, FieldValue>; dropped: { key: string; reason: string }[]; proposed: number }

/** Keep a field only when its value has the right type and its quote is an exact substring of one caller line. */
export function groundFields(raw: unknown, fields: FieldDef[], callerLines: string[]): Grounded {
  const out: Grounded = { values: {}, dropped: [], proposed: 0 };
  if (!fields.length || !raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const byKey = new Map(fields.map(f => [f.key, f]));
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === null || v === undefined) continue;                       // left empty: nothing proposed
    out.proposed++;
    const f = byKey.get(key);
    const drop = (reason: string) => { out.dropped.push({ key, reason }); };
    if (!f) { drop('not a field of this outcome'); continue; }
    const e = v as { value?: unknown; quote?: unknown };
    const quote = typeof e?.quote === 'string' ? e.quote.trim() : '';
    if (quote.length < 2 || !callerLines.some(l => l.includes(quote))) { drop('no exact quote from the caller'); continue; }
    const value = typed(f, e?.value);
    if (value === null) { drop(`not a valid ${f.type}`); continue; }
    out.values[key] = { value, quote, type: f.type };
  }
  return out;
}

function typed(f: FieldDef, v: unknown): string | number | null {
  switch (f.type) {
    case 'number': {
      const n = typeof v === 'number' ? v : typeof v === 'string' && /^[\d,.\s₹-]+$/.test(v) ? Number(v.replace(/[,\s₹]/g, '')) : NaN;
      return Number.isFinite(n) ? n : null;
    }
    case 'date': {
      if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
      const d = new Date(v + 'T00:00:00Z');
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
    }
    case 'enum': return typeof v === 'string' && f.values!.includes(v) ? v : null;
    case 'sentiment': return typeof v === 'string' && (SENTIMENT_SCALE as readonly string[]).includes(v) ? v : null;
    case 'text': return typeof v === 'string' && v.trim() && v.length <= 300 ? v.trim() : null;
  }
}
