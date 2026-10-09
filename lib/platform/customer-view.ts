import type { PlatformRecord, WorkspaceEntity } from './contracts';

/** Match the intake directory: active profile fields override base fields only when present. */
export function effectiveCustomer(contact: WorkspaceEntity, records: PlatformRecord[]) {
  const profile = records.filter(record => record.kind === 'customer_profile' && record.status === 'active' && record.data.contactId === contact.id)
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).at(-1);
  return {
    id: contact.id, profile,
    name: String(profile?.data.name ?? contact.name ?? ''),
    email: String(profile?.data.email ?? contact.email ?? ''),
    phone: String(profile?.data.phone ?? contact.phone ?? ''),
    stage: String(profile?.data.stage ?? contact.stage ?? 'New'),
    notes: String(profile?.data.notes ?? contact.notes ?? ''),
    // Ordinary profile updates and consent decisions cannot clear base-source restrictions.
    doNotContact: contact.doNotContact === true || contact.optOut === true,
    tableSources: (Array.isArray(contact.reviewedTableSources) ? contact.reviewedTableSources : []).flatMap(item => {
      if (!item || typeof item !== 'object' || typeof item.sourceArtifactId !== 'string' || !Number.isSafeInteger(item.rowNumber)) return [];
      return [{ sourceId: item.sourceArtifactId as string, rowNumber: item.rowNumber as number }];
    }),
    sourceEvidence: (Array.isArray(contact.sourceEvidence) ? contact.sourceEvidence : []).flatMap(item => {
      if (!item || typeof item !== 'object' || typeof item.column !== 'string' || typeof item.value !== 'string') return [];
      return [{ column: item.column as string, value: item.value as string }];
    }),
  };
}
