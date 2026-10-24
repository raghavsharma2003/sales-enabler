// What to do about a refusal. A NOT DONE with a field path reached the model as the bare reason ("templateId: no
// template x"), and models then guessed again: invented template ids, guessed brief fields (2026-10-23 bench,
// rejected.2026-10-23.exclusive-args-checked-only-at-run). This reads the tool's own JSON Schema at that path and
// says what is valid there: the allowed values, the limits, the fields that exist, what the field is for, and the
// tool's own note on how its arguments go together. A path inside an agent draft (brief.edit refuses with paths like
// "limits.maxDurationS" or "persona.mood") is read from the draft's schema (agent.config.schema), so the fix names
// that field's limits instead of falling back to the tool's description (bench r4). Nothing here decides anything.
import type { ToolDef } from '../../tools.ts';

type Schema = Record<string, any>;

/** The schema node at a validator path ('patch[0].path', 'filter.all[1].op'); the parent too, for unknown fields. */
export function schemaAt(root: Schema | undefined, path: string): { node?: Schema; parent?: Schema; key?: string } {
  if (!root) return {};
  const keys = [...path.matchAll(/([^.[\]/]+)|\[(\d+)\]/g)].map(m => m[1] ?? Number(m[2])).map(k => (typeof k === 'string' && /^\d+$/.test(k) ? Number(k) : k));
  let node: Schema | undefined = root, parent: Schema | undefined;
  let key: string | undefined;
  for (const [i, k] of keys.entries()) {
    if (!node) return i === keys.length ? { node, parent, key } : {};   // lost before the last key: the path is not in this schema
    if (typeof k === 'number' || k === '-') { node = node.items; continue; }
    parent = node; key = k;
    node = node.properties?.[k];
    if (!node && i < keys.length - 1) return {};
  }
  return { node, parent, key };
}

const list = (xs: unknown[], max = 30) => xs.slice(0, max).map(String).join(', ') + (xs.length > max ? `, … (${xs.length - max} more)` : '');

/** What a schema node allows, in words: values, range, length, required fields. */
function allows(name: string, node: Schema): string[] {
  const out: string[] = [];
  if (Array.isArray(node.enum)) out.push(`${name} must be one of: ${list(node.enum)}`);
  const range = [node.minimum !== undefined ? `at least ${node.minimum}` : '', node.maximum !== undefined ? `at most ${node.maximum}` : ''].filter(Boolean);
  if (range.length) out.push(`${name} must be ${node.type === 'integer' ? 'a whole number ' : ''}${range.join(' and ')}`);
  const len = [node.minLength !== undefined ? `at least ${node.minLength}` : '', node.maxLength !== undefined ? `at most ${node.maxLength}` : ''].filter(Boolean);
  if (len.length) out.push(`${name} must be ${len.join(' and ')} characters`);
  if (node.maxItems !== undefined) out.push(`${name} holds at most ${node.maxItems} items`);
  if (typeof node.description === 'string') out.push(`${name}: ${node.description}`);
  if (Array.isArray(node.required) && node.required.length && node.properties) out.push(`${name} needs: ${node.required.join(', ')}`);
  if (node.type === 'object' && node.properties && !Array.isArray(node.enum)) out.push(`${name} has the fields: ${list(Object.keys(node.properties))}`);
  return out;
}

/** A one-line fix for a refusal at `path`, from the tool's schema (and, for a draft path, the draft's schema). */
export function fixFor(def: ToolDef | undefined, path: string | undefined, reason: string, draftSchema?: Schema): { fix?: string } {
  if (!def) return {};
  const root = def.input.schema as Schema | undefined;
  const parts: string[] = [];
  const at = (sch: Schema | undefined, p: string) => {
    const { node, parent, key } = schemaAt(sch, p);
    if (/is not a known field|does not exist/.test(reason) && parent?.properties && !node) {
      parts.push(`use only these fields${parent === sch ? '' : ` in ${p.split(/[.[/]/).slice(0, -1).filter(Boolean).join('.') || 'it'}`}: ${list(Object.keys(parent.properties))}`);
      return true;
    }
    if (node) { parts.push(...allows(key ?? p, node)); return true; }
    return false;
  };
  if (path && !at(root, path) && draftSchema) {
    // A draft path: the refusal's own path, or a path quoted in its reason ('"persona.mood" does not exist').
    const quoted = /"(\/?[a-zA-Z][\w./[\]-]*)"/.exec(reason)?.[1];
    const p = /^patch\[\d+\]/.test(path) && quoted ? quoted : path;
    at(draftSchema, p.replace(/^\/?draft[./]/, '').replace(/^\//, ''));
  }
  if (!parts.length && typeof root?.description === 'string') parts.push(root.description);
  return parts.length ? { fix: parts.join('; ') } : {};
}
