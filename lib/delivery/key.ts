/**
 * Direct adaptation of Vyakti-GroupAI packages/delivery-runtime/src/policy.ts
 * (origin/claude/vyakti-cloning-platform-aq05n4 451de5a,
 * blob a48b75cc6684afeaecfd04f8345eb57f46953d47).
 * Bind one logical intent to its tenant, provider, destination, run and mailbox.
 */
import { createHash } from 'node:crypto';

type KeyInput = { tenantId: string; intentId: string; provider: string; destinationId: string; runId: string; connectionId: string };
const keyMaterial = (input: KeyInput): string =>
  [input.tenantId, input.intentId, input.provider, input.destinationId, input.runId, input.connectionId]
    .map(part => `${Buffer.byteLength(part, 'utf8')}:${part}`)
    .join('|');

export function stableDeliveryIdempotencyKey(input: KeyInput): string {
  return `vy1_${createHash('sha256').update(keyMaterial(input)).digest('hex').slice(0, 40)}`;
}
