import type { SendResult } from './contracts';

export type WhatsAppDispatch = (input: { token: string; phoneNumberId: string; phone: string; text: string }) => Promise<SendResult>;

// The Graph endpoint is fixed to Meta and the configured numeric phone-number ID.
// No URL from a webhook, recipient, or operator input is fetched.
export const sendWhatsAppText: WhatsAppDispatch = async ({ token, phoneNumberId, phone, text }) => {
  const version = /^v\d{1,2}\.\d{1,2}$/.test(process.env.WHATSAPP_GRAPH_VERSION || '') ? process.env.WHATSAPP_GRAPH_VERSION : 'v23.0';
  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: phone, type: 'text', text: { preview_url: false, body: text } }),
      signal: AbortSignal.timeout(12_000), cache: 'no-store',
    });
  } catch { return { state: 'uncertain', reason: 'The provider request ended without a response. Do not resend automatically.' }; }
  if (!response.ok) return response.status >= 500 || response.status === 429
    ? { state: 'uncertain', reason: `Meta returned HTTP ${response.status}; delivery is uncertain.` }
    : { state: 'rejected', reason: `Meta rejected the request (HTTP ${response.status}).` };
  try {
    const payload = await response.json() as { messages?: { id?: unknown }[] };
    const providerId = payload.messages?.[0]?.id;
    return typeof providerId === 'string' && /^wamid\.[A-Za-z0-9._~+/=-]{1,240}$/.test(providerId)
      ? { state: 'accepted', providerId }
      : { state: 'uncertain', reason: 'Meta returned success without a usable message ID.' };
  } catch { return { state: 'uncertain', reason: 'Meta returned an unreadable success response.' }; }
};
