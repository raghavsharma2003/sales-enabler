const lower = value => String(value || '').toLowerCase();

/** Azure action patterns can place `*` in any segment, not only at the end. */
export function matchesAzureActionPattern(pattern, action) {
  const normalized = lower(pattern), target = lower(action);
  const expression = normalized.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${expression}$`).test(target);
}

/** Effective permissions are a union of grants; notActions subtract only from their own grant. */
export function permitsAzureAction(grants, action, data = false) {
  const allow = data ? 'dataActions' : 'actions', deny = data ? 'notDataActions' : 'notActions';
  return grants.some(grant =>
    !(grant[deny] || []).some(item => matchesAzureActionPattern(item, action)) &&
    (grant[allow] || []).some(item => matchesAzureActionPattern(item, action))
  );
}
