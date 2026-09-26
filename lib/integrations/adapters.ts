import { HttpError } from '../server/http';
import type { ConnectorCredentials } from './vault';

export type ExternalItem = { id: string; title: string; updatedAt?: string; data: Record<string, unknown> };
type Json = Record<string, unknown>;
const LIMIT = 15;
const DETAIL_LIMIT = 5;
const MAX_TEXT = 100_000;
const object = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
const items = (value: unknown): Json[] => Array.isArray(value) ? value.map(object).slice(0, LIMIT) : [];
const str = (value: unknown) => typeof value === 'string' ? value.slice(0, 2000) : '';
const longText = (value: unknown) => typeof value === 'string' ? value.slice(0, MAX_TEXT) : '';
const compact = (value: Json, keys: string[]): Json => Object.fromEntries(keys.map(key => [key, value[key]]).filter(([, field]) => field !== undefined));

/** A single fixed-origin read with no redirects and a bounded response. */
async function providerBytes(url: string, headers: HeadersInit, init: RequestInit = {}): Promise<Buffer> {
  const allowed = ['api.telegram.org', 'gmail.googleapis.com', 'www.googleapis.com', 'chat.googleapis.com', 'graph.microsoft.com', 'api.hubapi.com', 'api.pipedrive.com', 'api.dropboxapi.com', 'content.dropboxapi.com', 'slack.com', 'api.notion.com', 'api.intercom.io', 'graph.facebook.com'];
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.hash ||
    (!allowed.includes(parsed.hostname) && !/^[a-z0-9-]+\.zendesk\.com$/.test(parsed.hostname) && !/^[a-z0-9-]+\.my\.salesforce\.com$/.test(parsed.hostname)))
    throw new HttpError(400, 'Provider endpoint is not allowed.');
  let response: Response;
  try { response = await fetch(parsed, { ...init, method: init.method || 'GET', headers, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000) }); }
  catch { throw new HttpError(502, 'Provider request failed or timed out.'); }
  if (!response.ok) throw new HttpError(502, `Provider returned HTTP ${response.status}. Check the token and scopes.`);
  const reader = response.body?.getReader();
  if (!reader) throw new HttpError(502, 'Provider returned no response.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.byteLength;
      if (size > 1024 * 1024) { await reader.cancel(); throw new HttpError(502, 'Provider response exceeded the size limit.'); }
      chunks.push(next.value);
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, 'Provider response could not be read.');
  }
  return Buffer.concat(chunks);
}
export async function providerJson(url: string, headers: HeadersInit, init: RequestInit = {}): Promise<Json> {
  const bytes = await providerBytes(url, headers, init);
  try { return object(JSON.parse(bytes.toString('utf8'))); }
  catch { throw new HttpError(502, 'Provider returned invalid JSON.'); }
}
async function providerText(url: string, headers: HeadersInit, init: RequestInit = {}): Promise<string> {
  return (await providerBytes(url, headers, init)).toString('utf8').slice(0, MAX_TEXT);
}
function bearer(credentials: ConnectorCredentials): HeadersInit { return { Authorization: `Bearer ${credentials.token}`, Accept: 'application/json' }; }
function notionHeaders(credentials: ConnectorCredentials): HeadersInit { return { ...bearer(credentials), 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }; }
function zendeskHeaders(credentials: ConnectorCredentials): HeadersInit {
  return { Authorization: `Basic ${Buffer.from(`${credentials.email}/token:${credentials.token}`).toString('base64')}`, Accept: 'application/json' };
}
function pipedriveHeaders(credentials: ConnectorCredentials): HeadersInit { return { 'x-api-token': credentials.token, Accept: 'application/json' }; }
function dropboxHeaders(credentials: ConnectorCredentials): HeadersInit { return { Authorization: `Bearer ${credentials.token}`, 'Content-Type': 'application/json' }; }
function dropboxList(credentials: ConnectorCredentials, limit: number): Promise<Json> {
  return providerJson('https://api.dropboxapi.com/2/files/list_folder', dropboxHeaders(credentials), { method: 'POST', body: JSON.stringify({ path: credentials.folderPath, recursive: false, limit, include_non_downloadable_files: false }) });
}
const salesforceQuery = (credentials: ConnectorCredentials, soql: string): Promise<Json> =>
  providerJson(`https://${credentials.instanceHost}/services/data/v67.0/query?q=${encodeURIComponent(soql)}`, bearer(credentials));
function entry(id: unknown, title: unknown, data: Json, updatedAt?: unknown): ExternalItem | undefined {
  const key = str(id).slice(0, 200); if (!key) return;
  return { id: key, title: str(title).slice(0, 180) || key, data, ...(typeof updatedAt === 'string' ? { updatedAt: updatedAt.slice(0, 80) } : {}) };
}
function defined(values: Array<ExternalItem | undefined>): ExternalItem[] { return values.filter((value): value is ExternalItem => Boolean(value)); }
function plainHtml(value: string): string {
  return value.replace(/<(script|style|noscript|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\/?(?:p|div|br|li|h[1-6]|section|article|tr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEXT);
}
function gmailContent(message: Json): { subject: string; content: string; from: string; to: string; contentType: string } {
  const payload = object(message.payload);
  const headers = items(payload.headers);
  const header = (name: string) => str(headers.find(h => str(h.name).toLowerCase() === name)?.value);
  const found: { plain: string[]; html: string[] } = { plain: [], html: [] };
  let examined = 0;
  const walk = (part: Json, depth: number): void => {
    if (depth > 5 || examined++ > 30) return;
    const type = str(part.mimeType).toLowerCase(), body = object(part.body);
    if (!str(part.filename) && typeof body.data === 'string' && (type === 'text/plain' || type === 'text/html')) {
      const decoded = Buffer.from(body.data, 'base64url').toString('utf8').slice(0, MAX_TEXT);
      found[type === 'text/plain' ? 'plain' : 'html'].push(decoded);
    }
    for (const child of items(part.parts)) walk(child, depth + 1);
  };
  walk(payload, 0);
  const content = found.plain.length ? found.plain.join('\n\n') : plainHtml(found.html.join('\n\n'));
  return { subject: header('subject'), from: header('from'), to: header('to'), content: content.slice(0, MAX_TEXT), contentType: found.plain.length ? 'text/plain' : found.html.length ? 'text/html' : 'unavailable' };
}
function notionBlockText(block: Json): string {
  const type = str(block.type), detail = object(block[type]);
  const rich = items(detail.rich_text).map(part => str(part.plain_text || object(part.text).content)).join('');
  return (rich || str(detail.title) || str(detail.caption)).slice(0, 5000);
}
function graphBody(value: unknown, preview: unknown): string {
  const body = object(value), content = longText(body.content);
  return (str(body.contentType).toLowerCase() === 'html' ? plainHtml(content) : content || str(preview)).slice(0, MAX_TEXT);
}
async function notionContent(pageId: string, credentials: ConnectorCredentials): Promise<{ content: string; nestedOmitted: boolean }> {
  const header = notionHeaders(credentials);
  const first = await providerJson(`https://api.notion.com/v1/blocks/${encodeURIComponent(pageId)}/children?page_size=15`, header);
  const lines: string[] = []; let nested = 0, omitted = first.has_more === true;
  for (const block of items(first.results)) {
    const line = notionBlockText(block); if (line) lines.push(line);
    if (block.has_children === true) {
      if (nested++ >= 3 || typeof block.id !== 'string') { omitted = true; continue; }
      const child = await providerJson(`https://api.notion.com/v1/blocks/${encodeURIComponent(block.id)}/children?page_size=15`, header);
      for (const item of items(child.results)) { const text = notionBlockText(item); if (text) lines.push(text); if (item.has_children === true) omitted = true; }
      if (child.has_more === true) omitted = true;
    }
  }
  return { content: lines.join('\n').slice(0, MAX_TEXT), nestedOmitted: omitted };
}

export async function checkTelegramIdentity(credentials: ConnectorCredentials): Promise<{ botId: string; botUsername: string }> {
  if (!/^\d{6,20}:[A-Za-z0-9_-]{20,100}$/.test(credentials.token)) throw new HttpError(400, 'A valid Telegram bot token is required.');
  const data = await providerJson(`https://api.telegram.org/bot${credentials.token}/getMe`, { Accept: 'application/json' });
  const result = object(data.result);
  if (data.ok !== true || result.is_bot !== true || !Number.isSafeInteger(result.id) || Number(result.id) <= 0 || typeof result.username !== 'string' || !/^[A-Za-z0-9_]{5,64}$/.test(result.username)) throw new HttpError(502, 'Telegram did not verify a valid bot identity.');
  return { botId: String(result.id), botUsername: result.username };
}

export async function checkProvider(id: string, credentials: ConnectorCredentials): Promise<void> {
  if (id === 'telegram') { await checkTelegramIdentity(credentials); return; }
  if (id === 'generic_webhook') return;
  let data: Json;
  switch (id) {
    case 'gmail': data = await providerJson('https://gmail.googleapis.com/gmail/v1/users/me/profile', bearer(credentials)); break;
    case 'google_calendar': data = await providerJson('https://www.googleapis.com/calendar/v3/users/me/calendarList/primary', bearer(credentials)); break;
    case 'google_drive': data = await providerJson('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)', bearer(credentials)); break;
    case 'microsoft_mail': case 'microsoft_calendar': case 'microsoft_drive': data = await providerJson('https://graph.microsoft.com/v1.0/me?$select=id,displayName', bearer(credentials)); break;
    case 'hubspot': data = await providerJson('https://api.hubapi.com/crm/objects/2026-03/contacts?limit=1&properties=email', bearer(credentials)); break;
    case 'slack': data = await providerJson('https://slack.com/api/auth.test', bearer(credentials)); break;
    case 'notion': data = await providerJson('https://api.notion.com/v1/users/me', notionHeaders(credentials)); break;
    case 'zendesk': data = await providerJson(`https://${credentials.subdomain}.zendesk.com/api/v2/users/me.json`, zendeskHeaders(credentials)); break;
    case 'intercom': data = await providerJson('https://api.intercom.io/me', { ...bearer(credentials), 'Intercom-Version': '2.16' }); break;
    case 'whatsapp_cloud': data = await providerJson(`https://graph.facebook.com/v23.0/${credentials.phoneNumberId}?fields=id,display_phone_number,verified_name`, bearer(credentials)); break;
    case 'salesforce': data = await salesforceQuery(credentials, 'SELECT Id,Name FROM Account LIMIT 1'); break;
    case 'pipedrive': data = await providerJson('https://api.pipedrive.com/v1/users/me', pipedriveHeaders(credentials)); break;
    case 'teams': data = await providerJson(`https://graph.microsoft.com/v1.0/teams/${encodeURIComponent(credentials.teamId || '')}/channels/${encodeURIComponent(credentials.channelId || '')}/messages?$top=1`, bearer(credentials)); break;
    case 'google_chat': data = await providerJson(`https://chat.googleapis.com/v1/${credentials.spaceId}/messages?pageSize=1`, bearer(credentials)); break;
    case 'dropbox': data = await dropboxList(credentials, 1); break;
    default: throw new HttpError(400, 'Integration has no check adapter.');
  }
  if (id === 'slack' && data.ok !== true) throw new HttpError(502, 'Slack rejected the token.');
  if (id === 'hubspot' && !Array.isArray(data.results)) throw new HttpError(502, 'HubSpot did not return contacts.');
  if (id === 'salesforce' && !Array.isArray(data.records)) throw new HttpError(502, 'Salesforce did not return account records.');
  if (id === 'pipedrive' && data.success !== true) throw new HttpError(502, 'Pipedrive rejected the token.');
  if (id === 'dropbox' && !Array.isArray(data.entries)) throw new HttpError(502, 'Dropbox did not return folder entries.');
}

export async function pullProvider(id: string, credentials: ConnectorCredentials): Promise<ExternalItem[]> {
  let data: Json;
  switch (id) {
    case 'gmail':
      data = await providerJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${LIMIT}`, bearer(credentials));
      return defined(await Promise.all(items(data.messages).map(async (m, index) => {
        const id = str(m.id);
        if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) return;
        if (index >= DETAIL_LIMIT) return entry(id, `Gmail message ${id}`, { id, threadId: m.threadId, contentStatus: 'not_fetched_page_limit' });
        let detail: Json;
        try { detail = await providerJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`, bearer(credentials)); }
        catch (error) {
          if (error instanceof HttpError && error.message.includes('size limit')) return entry(id, `Gmail message ${id}`, { id, threadId: m.threadId, contentStatus: 'too_large' });
          throw error;
        }
        const body = gmailContent(detail);
        return entry(id, body.subject || `Gmail message ${id}`, { id, threadId: m.threadId, from: body.from, to: body.to, subject: body.subject, content: body.content, contentType: body.contentType, contentStatus: body.content ? 'fetched' : 'unavailable' }, detail.internalDate);
      })));
    case 'google_calendar':
      data = await providerJson(`https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=${LIMIT}&singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(new Date().toISOString())}`, bearer(credentials));
      return defined(items(data.items).map(m => entry(m.id, m.summary, compact(m, ['id', 'summary', 'description', 'start', 'end', 'status', 'updated']), m.updated)));
    case 'google_drive':
      data = await providerJson(`https://www.googleapis.com/drive/v3/files?pageSize=${LIMIT}&q=trashed%3Dfalse&fields=files(id,name,mimeType,description,modifiedTime,webViewLink,size,capabilities(canDownload))`, bearer(credentials));
      return defined(await Promise.all(items(data.files).map(async (m, index) => {
        const id = str(m.id), mime = str(m.mimeType), base = compact(m, ['id', 'name', 'mimeType', 'description', 'modifiedTime', 'webViewLink']);
        if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) return;
        if (index >= DETAIL_LIMIT) return entry(id, m.name, { ...base, contentStatus: 'not_fetched_page_limit' }, m.modifiedTime);
        if (object(m.capabilities).canDownload === false) return entry(id, m.name, { ...base, contentStatus: 'download_disabled' }, m.modifiedTime);
        if (mime !== 'application/vnd.google-apps.document' && !['text/plain', 'text/markdown', 'text/html', 'text/csv', 'application/json'].includes(mime))
          return entry(id, m.name, { ...base, contentStatus: 'unsupported_format' }, m.modifiedTime);
        if (Number(m.size || 0) > 1_048_576) return entry(id, m.name, { ...base, contentStatus: 'too_large' }, m.modifiedTime);
        const url = mime === 'application/vnd.google-apps.document'
          ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=text%2Fplain`
          : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`;
        let content: string;
        try { content = await providerText(url, bearer(credentials)); }
        catch (error) {
          if (error instanceof HttpError && error.message.includes('size limit')) return entry(id, m.name, { ...base, contentStatus: 'too_large' }, m.modifiedTime);
          throw error;
        }
        return entry(id, m.name, { ...base, content: mime === 'text/html' ? plainHtml(content) : content, contentStatus: 'fetched' }, m.modifiedTime);
      })));
    case 'microsoft_mail':
      data = await providerJson(`https://graph.microsoft.com/v1.0/me/messages?$top=${LIMIT}&$select=id,subject,receivedDateTime,from,body,bodyPreview`, { ...bearer(credentials), Prefer: 'outlook.body-content-type="text"' });
      return defined(items(data.value).map(m => entry(m.id, m.subject, { ...compact(m, ['id', 'subject', 'receivedDateTime', 'from']), content: graphBody(m.body, m.bodyPreview) }, m.receivedDateTime)));
    case 'microsoft_calendar':
      data = await providerJson(`https://graph.microsoft.com/v1.0/me/events?$top=${LIMIT}&$select=id,subject,start,end,lastModifiedDateTime,body,bodyPreview`, { ...bearer(credentials), Prefer: 'outlook.body-content-type="text"' });
      return defined(items(data.value).map(m => entry(m.id, m.subject, { ...compact(m, ['id', 'subject', 'start', 'end', 'lastModifiedDateTime']), content: graphBody(m.body, m.bodyPreview) }, m.lastModifiedDateTime)));
    case 'microsoft_drive':
      data = await providerJson(`https://graph.microsoft.com/v1.0/me/drive/root/children?$top=${LIMIT}&$select=id,name,description,lastModifiedDateTime,webUrl,file,folder`, bearer(credentials));
      return defined(items(data.value).map(m => entry(m.id, m.name, compact(m, ['id', 'name', 'description', 'lastModifiedDateTime', 'webUrl', 'file', 'folder']), m.lastModifiedDateTime)));
    case 'hubspot':
      data = await providerJson(`https://api.hubapi.com/crm/objects/2026-03/contacts?limit=${LIMIT}&properties=firstname,lastname,email,phone,company`, bearer(credentials));
      return defined(items(data.results).map(m => entry(m.id, `${str(object(m.properties).firstname)} ${str(object(m.properties).lastname)}`.trim(), compact(m, ['id', 'properties', 'updatedAt']), m.updatedAt)));
    case 'slack':
      data = await providerJson(`https://slack.com/api/conversations.history?channel=${encodeURIComponent(credentials.channelId || '')}&limit=${LIMIT}`, bearer(credentials));
      if (data.ok !== true) throw new HttpError(502, 'Slack could not read this channel. Check membership and scopes.');
      return defined(items(data.messages).map(m => entry(m.ts, `Slack ${str(m.ts)}`, compact(m, ['ts', 'text', 'user', 'thread_ts']), m.ts)));
    case 'notion':
      data = await providerJson('https://api.notion.com/v1/search', notionHeaders(credentials), { method: 'POST', body: JSON.stringify({ page_size: LIMIT }) });
      return defined(await Promise.all(items(data.results).map(async (m, index) => {
        const id = str(m.id); if (!/^[0-9a-fA-F-]{32,36}$/.test(id)) return;
        const base = compact(m, ['id', 'url', 'object', 'last_edited_time', 'properties']);
        if (m.object !== 'page' || index >= DETAIL_LIMIT) return entry(id, str(m.url) || `Notion ${id}`, { ...base, contentStatus: m.object === 'page' ? 'not_fetched_page_limit' : 'unsupported_object' }, m.last_edited_time);
        const body = await notionContent(id, credentials);
        return entry(id, str(m.url) || `Notion ${id}`, { ...base, content: body.content, nestedOmitted: body.nestedOmitted, contentStatus: body.content ? 'fetched' : 'empty' }, m.last_edited_time);
      })));
    case 'zendesk':
      data = await providerJson(`https://${credentials.subdomain}.zendesk.com/api/v2/tickets.json?per_page=${LIMIT}&sort=-updated_at`, zendeskHeaders(credentials));
      return defined(items(data.tickets).map(m => entry(String(m.id || ''), m.subject, { ...compact(m, ['id', 'subject', 'status', 'updated_at']), content: longText(m.description) }, m.updated_at)));
    case 'intercom':
      data = await providerJson(`https://api.intercom.io/conversations?per_page=${LIMIT}`, { ...bearer(credentials), 'Intercom-Version': '2.16' });
      return defined(await Promise.all(items(data.conversations).map(async (m, index) => {
        const id = str(m.id); if (!/^\d{1,30}$/.test(id)) return;
        const base = compact(m, ['id', 'title', 'state', 'created_at', 'updated_at']);
        if (index >= DETAIL_LIMIT) return entry(id, m.title, { ...base, contentStatus: 'not_fetched_page_limit' }, m.updated_at);
        let detail: Json;
        try { detail = await providerJson(`https://api.intercom.io/conversations/${encodeURIComponent(id)}?display_as=plaintext`, { ...bearer(credentials), 'Intercom-Version': '2.16' }); }
        catch (error) {
          if (error instanceof HttpError && error.message.includes('size limit')) return entry(id, m.title, { ...base, contentStatus: 'too_large' }, m.updated_at);
          throw error;
        }
        const source = object(detail.source), parts = items(object(detail.conversation_parts).conversation_parts).slice(0, 15);
        const content = [longText(source.body), ...parts.map(part => longText(part.body))].filter(Boolean).join('\n\n').slice(0, MAX_TEXT);
        return entry(id, detail.title || m.title, { ...base, content, contentStatus: content ? 'fetched' : 'empty', partsOmitted: Number(object(detail.conversation_parts).total_count || 0) > parts.length }, detail.updated_at || m.updated_at);
      })));
    case 'salesforce': {
      const [accounts, contacts] = await Promise.all([
        salesforceQuery(credentials, 'SELECT Id,Name,Description,LastModifiedDate FROM Account ORDER BY LastModifiedDate DESC LIMIT 8'),
        salesforceQuery(credentials, 'SELECT Id,Name,Email,Title,Description,LastModifiedDate FROM Contact ORDER BY LastModifiedDate DESC LIMIT 7'),
      ]);
      return defined([
        ...items(accounts.records).slice(0, 8).map(m => entry(`Account:${str(m.Id)}`, m.Name, { objectType: 'Account', ...compact(m, ['Id', 'Name', 'Description', 'LastModifiedDate']) }, m.LastModifiedDate)),
        ...items(contacts.records).slice(0, 7).map(m => entry(`Contact:${str(m.Id)}`, m.Name, { objectType: 'Contact', ...compact(m, ['Id', 'Name', 'Email', 'Title', 'Description', 'LastModifiedDate']) }, m.LastModifiedDate)),
      ]);
    }
    case 'pipedrive':
      data = await providerJson(`https://api.pipedrive.com/api/v2/persons?limit=${LIMIT}`, pipedriveHeaders(credentials));
      if (data.success !== true) throw new HttpError(502, 'Pipedrive could not read persons.');
      return defined(items(data.data).map(m => entry(String(m.id || ''), m.name, compact(m, ['id', 'name', 'emails', 'phones', 'org_id', 'owner_id', 'update_time']), m.update_time)));
    case 'teams':
      data = await providerJson(`https://graph.microsoft.com/v1.0/teams/${encodeURIComponent(credentials.teamId || '')}/channels/${encodeURIComponent(credentials.channelId || '')}/messages?$top=${LIMIT}`, bearer(credentials));
      return defined(items(data.value).map(m => entry(m.id, `Teams ${str(m.id)}`, {
        id: m.id, teamId: credentials.teamId, channelId: credentials.channelId, from: m.from,
        content: plainHtml(longText(object(m.body).content)), contentStatus: 'fetched_root_message_only',
      }, m.lastModifiedDateTime || m.createdDateTime)));
    case 'google_chat':
      data = await providerJson(`https://chat.googleapis.com/v1/${credentials.spaceId}/messages?pageSize=${LIMIT}&orderBy=DESC`, bearer(credentials));
      return defined(items(data.messages).map(m => entry(m.name, `Google Chat ${str(m.name)}`, {
        name: m.name, spaceId: credentials.spaceId, sender: m.sender, content: longText(m.text || m.formattedText),
      }, m.lastUpdateTime || m.createTime)));
    case 'dropbox':
      data = await dropboxList(credentials, LIMIT);
      return defined(await Promise.all(items(data.entries).map(async (m, index) => {
        const folder = (credentials.folderPath || '').toLowerCase();
        const path = str(m.path_lower);
        if (m['.tag'] !== 'file' || !path.toLowerCase().startsWith(`${folder}/`)) return;
        const name = str(m.name), base = compact(m, ['id', 'name', 'path_display', 'server_modified', 'size', 'rev']);
        if (!path || path.length > 300) return;
        if (index >= DETAIL_LIMIT) return entry(m.id || path, name, { ...base, contentStatus: 'not_fetched_page_limit' }, m.server_modified);
        if (!/\.(txt|md|markdown|csv|json|html)$/i.test(name)) return entry(m.id || path, name, { ...base, contentStatus: 'unsupported_format' }, m.server_modified);
        if (Number(m.size || 0) > 1_048_576) return entry(m.id || path, name, { ...base, contentStatus: 'too_large' }, m.server_modified);
        let content: string;
        try {
          content = await providerText('https://content.dropboxapi.com/2/files/download', { Authorization: `Bearer ${credentials.token}`, 'Dropbox-API-Arg': JSON.stringify({ path }) }, { method: 'POST' });
        } catch (error) {
          if (error instanceof HttpError && error.message.includes('size limit')) return entry(m.id || path, name, { ...base, contentStatus: 'too_large' }, m.server_modified);
          throw error;
        }
        return entry(m.id || path, name, { ...base, content: /\.html$/i.test(name) ? plainHtml(content) : content, contentStatus: 'fetched' }, m.server_modified);
      })));
    default: throw new HttpError(400, 'This integration does not support pull sync.');
  }
}
