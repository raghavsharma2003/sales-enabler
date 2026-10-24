// Read-only CRM clients for contact import: HubSpot (lists) and Zoho CRM (custom views). They list what a member can pick
// and page through one list into flat records; nothing here writes to a CRM (the only POSTs are HubSpot's search and
// batch-read, which read, and Zoho's token exchange). Pages and shapes: research/2026-10-24/crm-import/README.md.
// Base URLs can be pointed at a local fake (tests); production uses the vendors' documented hosts.

export class CrmError extends Error {
  constructor(message: string, public status?: number) { super(message); this.name = 'CrmError'; }
}

export interface CrmList { id: string; name: string; size: number | null }
export interface CrmRecord { id: string; updatedAt: string | null; fields: Record<string, string> }
export interface CrmClient {
  kind: 'hubspot' | 'zoho_crm';
  lists(): Promise<CrmList[]>;
  /** Every record in a list, oldest membership first, up to `max`. `extra` names more CRM fields to read. */
  records(listId: string, extra: string[], max: number): Promise<{ records: CrmRecord[]; truncated: boolean }>;
}

const urls = { hubspot: 'https://api.hubapi.com', zohoAccounts: '' as string, zohoApi: '' as string };
/** Tests point the clients at a local fake. */
export function setCrmUrls(u: Partial<typeof urls>): void { Object.assign(urls, u); }
export function resetCrmUrls(): void { Object.assign(urls, { hubspot: 'https://api.hubapi.com', zohoAccounts: '', zohoApi: '' }); }
// Browser tests and screenshots run the real server against a local fake CRM. Never in production.
if (process.env.VP_CRM_FAKE_URL && process.env.NODE_ENV !== 'production') {
  const u = process.env.VP_CRM_FAKE_URL;
  setCrmUrls({ hubspot: u, zohoAccounts: u, zohoApi: u });
}

const ZOHO_ACCOUNTS: Record<string, string> = {
  com: 'https://accounts.zoho.com', us: 'https://accounts.zoho.com', in: 'https://accounts.zoho.in', eu: 'https://accounts.zoho.eu',
  au: 'https://accounts.zoho.com.au', 'com.au': 'https://accounts.zoho.com.au', jp: 'https://accounts.zoho.jp', cn: 'https://accounts.zoho.com.cn',
  'com.cn': 'https://accounts.zoho.com.cn', ca: 'https://accounts.zohocloud.ca',
};

/** One request with a timeout, plain errors, and a short wait-and-retry on 429 and 5xx. */
async function call(url: string, init: RequestInit, who: string): Promise<{ status: number; json: any }> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try { res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) }); }
    catch { throw new CrmError(`${who} did not answer; try again in a minute`); }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const wait = Math.min(Number(res.headers.get('retry-after') ?? 0) * 1000 || 500 * 2 ** attempt, 5000);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new CrmError(`${who} refused the stored credentials; reconnect the integration in Settings`, res.status);
    if (res.status === 204) return { status: 204, json: null };
    let json: any = null;
    try { json = await res.json(); } catch { /* empty */ }
    if (res.status >= 300 && res.status !== 207) throw new CrmError(`${who} answered ${res.status}${json?.message ? `: ${String(json.message).slice(0, 160)}` : ''}`, res.status);
    return { status: res.status, json };
  }
}

const str = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v));

// ---- HubSpot -----------------------------------------------------------------------------------

// The contact properties read by default; `extra` adds the workspace's own (consent or DND fields live here when they exist).
const HUBSPOT_PROPS = ['firstname', 'lastname', 'mobilephone', 'phone', 'email', 'hs_language', 'lastmodifieddate'];

export function hubspot(token: string): CrmClient {
  const h = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const base = () => urls.hubspot;
  return {
    kind: 'hubspot',
    async lists() {
      const out: CrmList[] = [];
      let offset = 0;
      for (let page = 0; page < 20; page++) {
        const r = await call(`${base()}/crm/v3/lists/search`, { method: 'POST', headers: h, body: JSON.stringify({ query: '', count: 100, offset, additionalProperties: ['hs_list_size'] }) }, 'HubSpot');
        for (const l of r.json?.lists ?? []) {
          if (l.objectTypeId && l.objectTypeId !== '0-1') continue;          // contact lists only
          const size = Number(l.additionalProperties?.hs_list_size);
          out.push({ id: String(l.listId), name: String(l.name ?? l.listId), size: Number.isFinite(size) ? size : null });
        }
        if (!r.json?.hasMore) break;
        offset = Number(r.json.offset ?? offset + 100);
      }
      return out;
    },
    async records(listId, extra, max) {
      const ids: string[] = [];
      let after: string | undefined, truncated = false;
      for (;;) {
        const q = new URLSearchParams({ limit: '250', ...(after ? { after } : {}) });
        const r = await call(`${base()}/crm/v3/lists/${encodeURIComponent(listId)}/memberships/join-order?${q}`, { method: 'GET', headers: h }, 'HubSpot');
        for (const m of r.json?.results ?? []) ids.push(String(m.recordId));
        if (ids.length >= max) { truncated = ids.length > max || !!r.json?.paging?.next; ids.length = Math.min(ids.length, max); break; }
        after = r.json?.paging?.next?.after;
        if (!after) break;
      }
      const props = [...new Set([...HUBSPOT_PROPS, ...extra])];
      const records: CrmRecord[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const r = await call(`${base()}/crm/v3/objects/contacts/batch/read`, { method: 'POST', headers: h,
          body: JSON.stringify({ inputs: ids.slice(i, i + 100).map(id => ({ id })), properties: props, propertiesWithHistory: [] }) }, 'HubSpot');
        for (const c of r.json?.results ?? []) {
          if (c.archived) continue;
          const p = c.properties ?? {};
          records.push({ id: String(c.id), updatedAt: c.updatedAt ?? p.lastmodifieddate ?? null, fields: Object.fromEntries(props.map(k => [k, str(p[k])])) });
        }
      }
      return { records, truncated };
    },
  };
}

// ---- Zoho CRM ----------------------------------------------------------------------------------

const ZOHO_FIELDS = ['First_Name', 'Last_Name', 'Mobile', 'Phone', 'Email', 'Modified_Time'];

export function zoho(secrets: { client_id: string; client_secret: string; refresh_token: string }, datacenter = 'in'): CrmClient {
  let token: { access: string; api: string } | null = null;
  const auth = async () => {
    if (token) return token;
    const accounts = urls.zohoAccounts || ZOHO_ACCOUNTS[datacenter.replace(/^\./, '').toLowerCase()] || ZOHO_ACCOUNTS.in;
    const q = new URLSearchParams({ refresh_token: secrets.refresh_token, client_id: secrets.client_id, client_secret: secrets.client_secret, grant_type: 'refresh_token' });
    const r = await call(`${accounts}/oauth/v2/token?${q}`, { method: 'POST' }, 'Zoho');
    if (!r.json?.access_token) throw new CrmError(`Zoho did not issue an access token${r.json?.error ? ` (${r.json.error})` : ''}; reconnect the integration in Settings`);
    token = { access: r.json.access_token, api: urls.zohoApi || r.json.api_domain || 'https://www.zohoapis.in' };
    return token;
  };
  const get = async (path: string) => { const t = await auth(); return call(`${t.api}${path}`, { method: 'GET', headers: { authorization: `Zoho-oauthtoken ${t.access}` } }, 'Zoho'); };
  return {
    kind: 'zoho_crm',
    async lists() {
      const r = await get('/crm/v8/settings/custom_views?module=Contacts');
      return (r.json?.custom_views ?? []).map((v: any) => ({ id: String(v.id), name: String(v.display_value ?? v.name ?? v.id), size: null }));
    },
    async records(listId, extra, max) {
      const fields = [...new Set([...ZOHO_FIELDS, ...extra])].slice(0, 50);
      const records: CrmRecord[] = [];
      let pageToken: string | undefined, truncated = false;
      for (;;) {
        const q = new URLSearchParams({ cvid: listId, fields: fields.join(','), per_page: '200', ...(pageToken ? { page_token: pageToken } : {}) });
        const r = await get(`/crm/v8/Contacts?${q}`);
        if (r.status === 204 || !r.json) break;
        for (const c of r.json.data ?? []) {
          if (records.length >= max) { truncated = true; break; }
          records.push({ id: String(c.id), updatedAt: c.Modified_Time ?? null, fields: Object.fromEntries(fields.map(k => [k, str(c[k])])) });
        }
        if (truncated || !r.json.info?.more_records) { truncated ||= false; break; }
        pageToken = r.json.info.next_page_token;
        if (!pageToken) break;
      }
      return { records, truncated };
    },
  };
}

// ---- records to the table intake reads ---------------------------------------------------------

/** Headers intake's mapping already knows, so a pulled list maps like a file. One Phone column: mobile first, else phone
 *  (the other is kept as "Other phone"). The CRM id comes first so imports stay idempotent on it. */
export function recordsToRows(kind: CrmClient['kind'], records: CrmRecord[], extra: string[]): string[][] {
  const std = kind === 'hubspot'
    ? { first: 'firstname', last: 'lastname', mobile: 'mobilephone', phone: 'phone', email: 'email', language: 'hs_language', updated: 'lastmodifieddate' }
    : { first: 'First_Name', last: 'Last_Name', mobile: 'Mobile', phone: 'Phone', email: 'Email', language: '', updated: 'Modified_Time' };
  const idHeader = kind === 'hubspot' ? 'HubSpot id' : 'Zoho id';
  const header = [idHeader, 'First name', 'Last name', 'Phone', 'Other phone', 'Email', ...(std.language ? ['Language'] : []), 'Updated at', ...extra];
  const rows = [header];
  for (const r of records) {
    const f = r.fields;
    const main = f[std.mobile] || f[std.phone] || '';
    const other = f[std.mobile] && f[std.phone] && f[std.phone] !== f[std.mobile] ? f[std.phone] : '';
    rows.push([r.id, f[std.first] ?? '', f[std.last] ?? '', main, other, f[std.email] ?? '', ...(std.language ? [f[std.language] ?? ''] : []), r.updatedAt ?? '', ...extra.map(k => f[k] ?? '')]);
  }
  return rows;
}
