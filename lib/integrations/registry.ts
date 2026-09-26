import type { ConnectorDefinition, IntegrationId } from "./contracts";

/** Honest product configuration: no Gmail, CRM, or telephone provider is executable yet. */
export const plannedIntegrations: readonly ConnectorDefinition[] = [
  { id: "gmail", displayName: "Gmail", availability: "planned", capabilities: ["read", "send", "lookup"], supportedChannels: ["email"], description: "Planned email synchronization and sending adapter." },
  { id: "crm", displayName: "CRM", availability: "planned", capabilities: ["read", "write", "lookup"], supportedChannels: ["crm"], description: "Planned CRM adapter; vendor is deliberately unselected." },
  { id: "telephone", displayName: "Telephone", availability: "planned", capabilities: ["send", "lookup"], supportedChannels: ["phone"], description: "Planned telephone adapter after browser voice validation." },
];

/** There are intentionally no application-configured live adapters in this build. */
export const liveIntegrations: readonly ConnectorDefinition[] = [];

export function integrationDefinition(id: IntegrationId, definitions: readonly ConnectorDefinition[] = plannedIntegrations): ConnectorDefinition | undefined {
  return definitions.find((definition) => definition.id === id);
}

/** Application configuration must select only a connector explicitly declared live. */
export function liveIntegrationDefinition(id: IntegrationId): ConnectorDefinition | undefined {
  return integrationDefinition(id, liveIntegrations);
}
