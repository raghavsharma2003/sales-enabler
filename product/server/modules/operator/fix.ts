// What to do about a refusal. A NOT DONE with a field path reached the model as the bare reason ("templateId: no
// template x"), and models then guessed again: invented template ids, guessed brief fields (2026-10-23 bench,
// rejected.2026-10-23.exclusive-args-checked-only-at-run). This reads the tool's own JSON Schema at that path and
// says what is valid there: the allowed values, the fields that exist, what the field is for, and the tool's own
// note on how its arguments go together. Nothing here decides anything; it only words the next step.
import type { ToolDef } from '../../tools.ts';

type Schema = Record<string, any>;

/** The schema node at a validator path ('patch[0].path', 'filter.all[1].op'); the parent too, for unknown fields. */
export function schemaAt(root: Schema | undefined, path: string): { node?: Schema; parent?: Schema; key?: string } {
  if (!root) return {};
  const keys = [...path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)].map(m => m[1] ?? Number(m[2]));
  let node: Schema | undefined = root, parent: Schema | undefined;
  let key: string | undefined;
  for (const k of keys) {
    if (!node) break;
    if (typeof k === 'number') { node = node.items; continue; }
    parent = node; key = k;
    node = node.properties?.[k];
  }
  return { node, parent, key };
}

const list = (xs: unknown[], max = 30) => xs.slice(0, max).map(String).join(', ') + (xs.length > max ? `, … (${xs.length - max} more)` : '');

/** A one-line fix for a refusal at `path`, from the tool's schema. Empty when the schema has nothing to add. */
export function fixFor(def: ToolDef | undefined, path: string | undefined, reason: string): { fix?: string } {
  if (!def) return {};
  const root = def.input.schema as Schema | undefined;
  const parts: string[] = [];
  if (path) {
    const { node, parent, key } = schemaAt(root, path);
    if (/is not a known field/.test(reason) && parent?.properties) {
      parts.push(`use only these fields${parent === root ? '' : ' there'}: ${list(Object.keys(parent.properties))}`);
    } else if (node) {
      if (Array.isArray(node.enum)) parts.push(`${key ?? path} must be one of: ${list(node.enum)}`);
      if (typeof node.description === 'string') parts.push(`${key ?? path}: ${node.description}`);
      if (Array.isArray(node.required) && node.properties) parts.push(`${key ?? path} needs: ${node.required.join(', ')}`);
    }
  }
  if (typeof root?.description === 'string') parts.push(root.description);
  return parts.length ? { fix: parts.join('; ') } : {};
}
