// Shared by check-context.mjs and context.mjs. Nodes dated on or after SCHEMA_FROM must carry the fields that make
// them useful to a later session (context/PROTOCOL.md): older nodes predate the rule and are left as written.
export const TYPES = new Set(['requirement', 'evidence', 'decision', 'component', 'risk', 'open-question', 'experiment', 'asset', 'rejection', 'measurement', 'repo']);
export const SCHEMA_FROM = '2026-10-20';

const REQUIRED = {
  decision: ['reverse_if'],
  measurement: ['n', 'method'],
  rejection: ['broke'],
  risk: ['mitigation'],
  'open-question': ['closes_when'],
  asset: ['paths'],
};

const present = value => Array.isArray(value) ? value.length > 0 : typeof value === 'string' ? value.trim() !== '' : value != null;

export function nodeErrors(node) {
  const errors = [];
  if (!node.id || !TYPES.has(node.type) || !node.title || !node.status) errors.push('needs id, a known type, title and status');
  if (!node.date || node.date < SCHEMA_FROM) return errors;
  for (const field of REQUIRED[node.type] ?? []) if (!present(node[field])) errors.push(`${node.type} needs ${field}`);
  if (node.id.startsWith('directive.') && node.source !== 'user') errors.push('a directive is the owner\'s: source "user"');
  return errors;
}
