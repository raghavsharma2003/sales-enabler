/**
 * A deliberately narrow guard for an explicit refusal of future contact.
 * It does not match reports about missing contact or invitations such as
 * "don't hesitate to call". Broader language still requires human review.
 */
export function isExplicitFollowUpDecline(quote: string): boolean {
  const value = quote.trim();
  return /\b(?:i\s+)?(?:do\s+not|don't)\s+(?:need|want|require)\s+(?:a|any)\s+(?:follow[- ]?up(?:\s+call)?|call)\b/i.test(value)
    || /^(?:please\s*,?\s*)?no\s+(?:follow[- ]?up(?:\s+call)?|call)(?:\s*,?\s*please)?[.!]?$/i.test(value);
}
