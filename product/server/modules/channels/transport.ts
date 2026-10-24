// The channel seam (asset.hp-vyakti-latest.omnichannel-four-function-surface-contract). A transport implements only
// four things: verify a webhook, parse it into events, send one message, and render a message as the text a person
// reads. Everything else (who the person is, their consent, the reply door, the meter, the log, the agent) is shared,
// once, in this module, so a second transport (SMS, email) adds a file here and nothing else.

export type ChannelId = 'whatsapp';

/** The credentials a connection holds: config in clear, secrets from the integrations vault. Never logged. */
export interface Credentials {
  phoneNumberId: string;
  wabaId: string | null;
  accessToken: string;
  appSecret: string;
}

export interface WebhookRequest {
  method: 'GET' | 'POST';
  query: URLSearchParams;
  headers: Record<string, string | string[] | undefined>;
  raw: Buffer;
}

export type VerifyResult =
  | { ok: true; challenge?: string }               // a GET handshake answers with the challenge
  | { ok: false; reason: string };

export interface InboundMessage {
  kind: 'message';
  providerId: string;
  phoneNumberId: string;
  from: string;                  // the person's channel id (WhatsApp: digits, country code first)
  profileName: string | null;
  at: Date;
  type: 'text' | 'button' | 'other';
  text: string;                  // the words they sent ('' for media and other types)
}

export interface StatusEvent {
  kind: 'status';
  providerId: string;
  phoneNumberId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  at: Date;
  errorCode: string | null;
  errorTitle: string | null;
  billable: boolean | null;
  pricingCategory: string | null;
}

export interface TemplateEvent {
  kind: 'template';
  wabaId: string;
  providerTemplateId: string;
  name: string;
  language: string | null;
  status: 'approved' | 'rejected' | 'pending' | 'paused' | 'disabled';
  reason: string | null;
  at: Date;
}

export type ChannelEvent = InboundMessage | StatusEvent | TemplateEvent;

export type Outbound =
  | { kind: 'text'; to: string; text: string }
  | { kind: 'template'; to: string; name: string; language: string; body: string; params: string[] };

export interface SendResult { providerId: string }

/** A send the provider refused for certain (nothing reached the person). */
export class SendRefused extends Error {
  constructor(message: string, public code: string | null) { super(message); this.name = 'SendRefused'; }
}
/** A send whose outcome is unknown (a timeout after the request left): it may have reached the person. */
export class SendUnknown extends Error {
  constructor(message: string) { super(message); this.name = 'SendUnknown'; }
}

export interface Transport {
  channel: ChannelId;
  verify(req: WebhookRequest, secrets: { appSecret: string; verifyTokenHash: string }): VerifyResult;
  parse(raw: Buffer): ChannelEvent[];
  send(creds: Credentials, out: Outbound): Promise<SendResult>;
  render(out: Outbound): string;
}
