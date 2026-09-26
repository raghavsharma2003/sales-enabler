import { HttpError } from '../server/http';

export type EmailProvider = 'gmail' | 'microsoft_mail';
export type ProviderResult =
  | { state: 'accepted'; providerReference?: string }
  | { state: 'rejected'; reason: string }
  | { state: 'uncertain'; reason: string };
export type EmailDispatch = (input: { provider: EmailProvider; token: string; to: string; subject: string; body: string }) => Promise<ProviderResult>;

/** Addresses appear in MIME headers. Refuse all controls, display names and header delimiters. */
export function validRecipient(address: string): boolean {
  return address.length <= 254 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(address) &&
    !address.includes('..') && !/[\r\n\0]/.test(address);
}
export function gmailRawMessage(to: string, subject: string, body: string): string {
  if (!validRecipient(to)) throw new HttpError(409, 'Recipient email address is invalid.');
  if (!subject || subject.length > 240 || /[\r\n\0]/.test(subject)) throw new HttpError(409, 'Email subject contains an invalid header character.');
  if (body.length > 5000 || /\0/.test(body)) throw new HttpError(409, 'Email message is invalid.');
  const words: string[] = [];
  let chunk = '';
  for (const character of subject) {
    if (chunk && Buffer.byteLength(chunk + character, 'utf8') > 42) { words.push(`=?UTF-8?B?${Buffer.from(chunk, 'utf8').toString('base64')}?=`); chunk = ''; }
    chunk += character;
  }
  if (chunk) words.push(`=?UTF-8?B?${Buffer.from(chunk, 'utf8').toString('base64')}?=`);
  const encodedSubject = words.join('\r\n ');
  const encodedBody = Buffer.from(body.replace(/\r\n?|\n/g, '\r\n'), 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') || '';
  const mime = `To: ${to}\r\nSubject: ${encodedSubject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${encodedBody}\r\n`;
  return Buffer.from(mime, 'utf8').toString('base64url');
}

/** A provider acknowledgement is never represented as recipient delivery. */
export const sendEmailViaProvider: EmailDispatch = async ({ provider, token, to, subject, body }) => {
  if (!token || /[\r\n]/.test(token)) return { state: 'rejected', reason: 'Mailbox token is invalid.' };
  if (!validRecipient(to) || !subject || /[\r\n\0]/.test(subject)) return { state: 'rejected', reason: 'Email address or subject is invalid.' };
  const url = provider === 'gmail' ? 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send' : 'https://graph.microsoft.com/v1.0/me/sendMail';
  const payload = provider === 'gmail'
    ? { raw: gmailRawMessage(to, subject, body) }
    : { message: { subject, body: { contentType: 'Text', content: body }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: true };
  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
  } catch { return { state: 'uncertain', reason: 'Provider request timed out or connection failed after dispatch.' }; }
  if (provider === 'gmail' && response.ok) {
    try {
      const value = await response.json() as { id?: unknown };
      if (typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 300) return { state: 'accepted', providerReference: value.id };
    } catch { /* acceptance may have happened despite a malformed response */ }
    return { state: 'uncertain', reason: 'Gmail returned success without a usable message identifier.' };
  }
  if (provider === 'microsoft_mail' && response.status === 202) return { state: 'accepted' };
  if (response.status >= 500 || [408, 409, 429].includes(response.status) || response.ok) return { state: 'uncertain', reason: `Provider response ${response.status} did not establish the result.` };
  if (response.status === 401 || response.status === 403) return { state: 'rejected', reason: 'Mailbox token lacks permission or has expired.' };
  return { state: 'rejected', reason: `Provider rejected the request (HTTP ${response.status}).` };
};
