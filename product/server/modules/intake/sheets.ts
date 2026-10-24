// Google Sheets as a live contact source, read only. Two ways in:
//  - a service account the workspace shares the sheet with (workspace's google_workspace integration, service_account_json):
//    a JWT signed with its key buys a spreadsheets.readonly token, then Sheets v4 lists the tabs and reads one tab's values;
//  - a published CSV link ("Publish to the web", CSV), which needs no credentials and is fetched from docs.google.com only.
// Pages and shapes: research/2026-10-24/google-sheets/README.md. No call here writes to a sheet.
import { createSign } from 'node:crypto';
import { CrmError } from './crm.ts';

const urls = { token: '', sheets: 'https://sheets.googleapis.com', docs: 'https://docs.google.com' };
/** Tests point the client at a local fake. */
export function setSheetsUrls(u: Partial<typeof urls>): void { Object.assign(urls, u); }
export function resetSheetsUrls(): void { Object.assign(urls, { token: '', sheets: 'https://sheets.googleapis.com', docs: 'https://docs.google.com' }); }
if (process.env.VP_SHEETS_FAKE_URL && process.env.NODE_ENV !== 'production') {
  const u = process.env.VP_SHEETS_FAKE_URL; setSheetsUrls({ token: `${u}/token`, sheets: u, docs: u });
}

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const MAX_BYTES = 20 * 1024 * 1024;
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export interface ServiceAccount { client_email: string; private_key: string; private_key_id?: string; token_uri?: string }

/** The service account key JSON as the workspace stored it, or a plain refusal. */
export function serviceAccount(json: string): ServiceAccount {
  let sa: Partial<ServiceAccount>;
  try { sa = JSON.parse(json); } catch { throw new CrmError('the stored Google service account is not a JSON key file; reconnect it in Settings'); }
  if (!sa.client_email || !sa.private_key) throw new CrmError('the stored Google service account has no client_email or private_key; reconnect it with the JSON key file');
  return sa as ServiceAccount;
}

/** The signed JWT assertion (RS256), as Google's server-to-server OAuth page describes it. */
export function assertion(sa: ServiceAccount, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', ...(sa.private_key_id ? { kid: sa.private_key_id } : {}) }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 }));
  const sig = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(sa.private_key);
  return `${head}.${claims}.${b64url(sig)}`;
}

/** A spreadsheet id from a sheet's address or the id itself. */
export function spreadsheetId(s: string): string {
  const m = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(s) ?? /^([A-Za-z0-9_-]{20,})$/.exec(s.trim());
  if (!m || m[1] === 'e') throw new CrmError('give the sheet\'s address (docs.google.com/spreadsheets/d/…) or its id');
  return m[1];
}

async function get(url: string, init: RequestInit = {}): Promise<Response> {
  try { return await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(20_000) }); }
  catch { throw new CrmError('Google did not answer; try again in a minute'); }
}

async function readCapped(res: Response): Promise<string> {
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_BYTES) throw new CrmError('the sheet holds more than one import reads (20 MB); split it');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new CrmError('the sheet holds more than one import reads (20 MB); split it');
  return buf.toString('utf8');
}

export interface SheetTab { id: string; name: string; size: number | null }

export function sheetsClient(sa: ServiceAccount) {
  let token: string | null = null;
  const auth = async () => {
    if (token) return token;
    const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: assertion(sa) });
    const res = await get(urls.token || 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    const j = await res.json().catch(() => null) as { access_token?: string; error?: string } | null;
    if (!res.ok || !j?.access_token) throw new CrmError(`Google refused the service account${j?.error ? ` (${j.error})` : ''}; reconnect it in Settings`);
    return (token = j.access_token);
  };
  const call = async (path: string) => {
    const res = await get(`${urls.sheets}${path}`, { headers: { authorization: `Bearer ${await auth()}` } });
    if (res.status === 403) throw new CrmError(`the sheet is not shared with ${sa.client_email}; share it with that address as a Viewer, then try again`);
    if (res.status === 404) throw new CrmError('no sheet at that address; check the link');
    if (!res.ok) throw new CrmError(`Google Sheets answered ${res.status}`);
    return res;
  };
  return {
    /** The tabs of a spreadsheet. */
    async tabs(id: string): Promise<{ title: string; tabs: SheetTab[] }> {
      const j = await (await call(`/v4/spreadsheets/${encodeURIComponent(id)}?fields=${encodeURIComponent('properties.title,sheets.properties(sheetId,title,sheetType,gridProperties.rowCount)')}`)).json() as any;
      return { title: String(j.properties?.title ?? 'Sheet'), tabs: (j.sheets ?? []).filter((s: any) => (s.properties?.sheetType ?? 'GRID') === 'GRID')
        .map((s: any) => ({ id: String(s.properties.sheetId), name: String(s.properties.title), size: s.properties.gridProperties?.rowCount ? Math.max(0, s.properties.gridProperties.rowCount - 1) : null })) };
    },
    /** One tab's cells as shown in the sheet (formatted values), row by row. */
    async rows(id: string, tab: string): Promise<string[][]> {
      const range = `'${tab.replace(/'/g, "''")}'`;
      const res = await call(`/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`);
      const j = JSON.parse(await readCapped(res)) as { values?: unknown[][] };
      return (j.values ?? []).map(r => r.map(v => (v === null || v === undefined ? '' : String(v))));
    },
  };
}

/** A published CSV link: docs.google.com only, a CSV output, and redirects followed only within Google's own hosts. */
export function csvLinkAllowed(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (urls.docs !== 'https://docs.google.com') return u.origin === new URL(urls.docs).origin;     // a test fake
  return u.protocol === 'https:' && u.hostname === 'docs.google.com' && !u.username && !u.password && /^\/spreadsheets\/d\//.test(u.pathname)
    && (u.searchParams.get('output') === 'csv' || u.searchParams.get('format') === 'csv');
}

export async function fetchCsvLink(raw: string): Promise<string> {
  if (!csvLinkAllowed(raw)) throw new CrmError('give the CSV link from File > Share > Publish to the web (docs.google.com/spreadsheets/…, output=csv)');
  let url = raw;
  for (let hop = 0; hop < 4; hop++) {
    const res = await get(url);
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = new URL(res.headers.get('location')!, url);
      const fake = urls.docs !== 'https://docs.google.com' && next.origin === new URL(urls.docs).origin;
      if (!fake && !(next.protocol === 'https:' && (next.hostname === 'docs.google.com' || next.hostname.endsWith('.googleusercontent.com'))))
        throw new CrmError('the published link redirected somewhere other than Google; nothing was read');
      url = next.toString();
      continue;
    }
    if (res.status === 404 || res.status === 410) throw new CrmError('that sheet is not published any more; publish it again (File > Share > Publish to the web)');
    if (!res.ok) throw new CrmError(`Google answered ${res.status} for the published link`);
    if (/text\/html/i.test(res.headers.get('content-type') ?? '')) throw new CrmError('that link opens a page, not a CSV; choose CSV in Publish to the web');
    return readCapped(res);
  }
  throw new CrmError('the published link redirected too many times');
}
