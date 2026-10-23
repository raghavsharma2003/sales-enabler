// The speakable AI disclosure (disclosure.json): what the runtime's RD1 first-breath fallback says when her first sentence
// does not already say she is an AI. agent.opening.disclosureClause is guidance for the brief compiler and is never
// spoken. The Python runtime reads the same file (product/voice/vpvoice/safety.py disclosure_line).
import data from './disclosure.json' with { type: 'json' };

interface Disclosure { fallback: string; lines: Record<string, { brand: string; nobrand: string }> }
export const DISCLOSURE = data as unknown as Disclosure & { version: string };

export function disclosureLine(brand = '', language?: string | null): string {
  const l = DISCLOSURE.lines[language ?? ''] ?? DISCLOSURE.lines[DISCLOSURE.fallback];
  const b = brand.trim();
  return b ? l.brand.replace('{brand}', b) : l.nobrand;
}
