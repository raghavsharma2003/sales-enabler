// Read-only CRM clients for contact import: HubSpot (lists), Zoho CRM (custom views) and Salesforce (Contact and Lead list
// views). They list what a member can pick and page through one list into flat records; nothing here writes to a CRM (the
// only POSTs are HubSpot's search and batch-read, which read, and the Zoho and Salesforce token exchanges).
// Pages and shapes: research/2026-10-24/crm-import/README.md.
// Base URLs can be pointed at a local fake (tests); production uses the vendors' documented hosts.

export class CrmError extends Error {
  constructor(message: string, public status?: number, public code?: string) { super(message); this.name = 'CrmError'; }
}
/** A pull stopped before passing an API budget. Nothing was imported; it can run again when calls free up. */
export class CrmBudgetError extends CrmError {
  constructor(message: string) { super(message, 429, 'BUDGET'); this.name = 'CrmBudgetError'; }
}

export type CrmKind = 'hubspot' | 'zoho_crm' | 'salesforce';
export interface CrmList { id: string; name: string; size: number | null }
export interface CrmRecord { id: string; updatedAt: string | null; fields: Record<string, string> }
export interface CrmClient {
  kind: CrmKind;
  lists(): Promise<CrmList[]>;
  /** Every record in a list, oldest membership first, up to `max`. `extra` names more CRM fields to read. `unreadable` lists
   *  fields the connected user may not read (field-level security): they are left out, never filled in as empty. */
  records(listId: string, extra: string[], max: number): Promise<{ records: CrmRecord[]; truncated: boolean; unreadable?: string[] }>;
}

/** Counts a pull's API calls. take() runs before every request (retries included) and throws CrmBudgetError instead of
 *  passing the budget; org() hears the org's own usage as the CRM reports it; left() says how many calls may still be made. */
export interface CrmMeter { take(): void; org(used: number, limit: number): void; left(): number }

const urls = { hubspot: 'https://api.hubapi.com', zohoAccounts: '' as string, zohoApi: '' as string, salesforceLogin: '' as string, salesforceApi: '' as string };
/** Tests point the clients at a local fake. */
export function setCrmUrls(u: Partial<typeof urls>): void { Object.assign(urls, u); }
export function resetCrmUrls(): void { Object.assign(urls, { hubspot: 'https://api.hubapi.com', zohoAccounts: '', zohoApi: '', salesforceLogin: '', salesforceApi: '' }); }
// Browser tests and screenshots run the real server against a local fake CRM. Never in production.
if (process.env.VP_CRM_FAKE_URL && process.env.NODE_ENV !== 'production') {
  const u = process.env.VP_CRM_FAKE_URL;
  setCrmUrls({ hubspot: u, zohoAccounts: u, zohoApi: u, salesforceLogin: u, salesforceApi: u });
}

const ZOHO_ACCOUNTS: Record<string, string> = {
  com: 'https://accounts.zoho.com', us: 'https://accounts.zoho.com', in: 'https://accounts.zoho.in', eu: 'https://accounts.zoho.eu',
  au: 'https://accounts.zoho.com.au', 'com.au': 'https://accounts.zoho.com.au', jp: 'https://accounts.zoho.jp', cn: 'https://accounts.zoho.com.cn',
  'com.cn': 'https://accounts.zoho.com.cn', ca: 'https://accounts.zohocloud.ca',
};

/** One request with a timeout, plain errors, and a short wait-and-retry on 429 and 5xx. A meter counts every attempt and
 *  hears Salesforce's Sforce-Limit-Info (api-usage=used/limit) from each answer. Salesforce errors are an array of
 *  { message, errorCode }; its daily cap (REQUEST_LIMIT_EXCEEDED, a 403) is a budget stop, not a credentials problem. */
async function call(url: string, init: RequestInit, who: string, meter?: CrmMeter): Promise<{ status: number; json: any }> {
  for (let attempt = 0; ; attempt++) {
    meter?.take();
    let res: Response;
    try { res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) }); }
    catch { throw new CrmError(`${who} did not answer; try again in a minute`); }
    const usage = /api-usage=(\d+)\/(\d+)/.exec(res.headers.get('sforce-limit-info') ?? '');
    if (usage && meter) meter.org(Number(usage[1]), Number(usage[2]));
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const wait = Math.min(Number(res.headers.get('retry-after') ?? 0) * 1000 || 500 * 2 ** attempt, 5000);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (res.status === 204) return { status: 204, json: null };
    let json: any = null;
    try { json = await res.json(); } catch { /* empty */ }
    const err = Array.isArray(json) ? json[0] : json;
    if (err?.errorCode === 'REQUEST_LIMIT_EXCEEDED') throw new CrmBudgetError(`${who} says this org has used all of its API calls for the last 24 hours; nothing was imported, and the pull can run again when calls free up`);
    if (res.status === 401 || res.status === 403) throw new CrmError(`${who} refused the stored credentials; reconnect the integration in Settings`, res.status);
    if (res.status >= 300 && res.status !== 207) throw new CrmError(`${who} answered ${res.status}${err?.message ? `: ${String(err.message).slice(0, 160)}` : ''}`, res.status, err?.errorCode);
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

// ---- Salesforce --------------------------------------------------------------------------------

const SF_VERSION = 'v62.0';
const SF_OBJECTS = { Contact: 'Contacts', Lead: 'Leads' } as const;
type SfObject = keyof typeof SF_OBJECTS;
// The standard fields read by default. DoNotCall is Salesforce's own do-not-call flag, on Contact and Lead alike.
const SF_FIELDS = ['FirstName', 'LastName', 'MobilePhone', 'Phone', 'Email', 'DoNotCall', 'LastModifiedDate'];
const SF_PAGE = 2000;                                   // Salesforce's default query batch

/** Credentials go only to Salesforce's own hosts over https (the instance address is workspace config). */
export function salesforceHostAllowed(raw: string): boolean {
  try { const u = new URL(raw); return u.protocol === 'https:' && !u.username && !u.password && /(^|\.)(salesforce\.com|force\.com)$/i.test(u.hostname); }
  catch { return false; }
}

/** A list view's SOQL, split at FROM: the object, and the filter and order to keep (any LIMIT is dropped; `max` applies). */
export function splitListViewQuery(query: string, sobject: string): { tail: string; countTail: string } {
  const m = /\sFROM\s+([A-Za-z0-9_]+)\b([\s\S]*)$/i.exec(query);
  if (!m || m[1].toLowerCase() !== sobject.toLowerCase()) throw new CrmError(`Salesforce described this list view with a query Vyakti cannot read (${query.slice(0, 80)})`);
  const tail = m[2].replace(/\s+LIMIT\s+\d+\s*$/i, '').trim();
  return { tail, countTail: tail.replace(/\s+ORDER\s+BY[\s\S]*$/i, '').replace(/^ORDER\s+BY[\s\S]*$/i, '').trim() };
}

export function salesforce(secrets: { client_id: string; client_secret: string; refresh_token: string }, instanceUrl: string | undefined, meter: CrmMeter): CrmClient {
  let token: { access: string; api: string } | null = null;
  const auth = async () => {
    if (token) return token;
    // My Domain addresses take the refresh themselves; without one, the production login host.
    const login = urls.salesforceLogin || (instanceUrl ? instanceUrl.replace(/\/+$/, '') : 'https://login.salesforce.com');
    if (!urls.salesforceLogin && !salesforceHostAllowed(login)) throw new CrmError('the Salesforce instance address must be an https address on salesforce.com or force.com; fix it in Settings > Integrations');
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: secrets.refresh_token, client_id: secrets.client_id, client_secret: secrets.client_secret });
    // The token exchange is OAuth, not a REST API call, so it is not metered.
    const r = await call(`${login}/services/oauth2/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body }, 'Salesforce');
    const api = urls.salesforceApi || r.json?.instance_url;
    if (!r.json?.access_token || !api) throw new CrmError(`Salesforce did not issue an access token${r.json?.error ? ` (${r.json.error})` : ''}; reconnect the integration in Settings`);
    if (!urls.salesforceApi && !salesforceHostAllowed(api)) throw new CrmError('Salesforce answered with an instance address that is not on salesforce.com or force.com; nothing was read');
    token = { access: r.json.access_token, api: String(api).replace(/\/+$/, '') };
    return token;
  };
  // `path` is from /services/data/... (Salesforce's own nextRecordsUrl is already in that form).
  const get = async (path: string) => { const t = await auth(); return call(`${t.api}${path}`, { method: 'GET', headers: { authorization: `Bearer ${t.access}` } }, 'Salesforce', meter); };
  const base = `/services/data/${SF_VERSION}`;
  const soql = (q: string) => get(`${base}/query?${new URLSearchParams({ q })}`);
  return {
    kind: 'salesforce',
    async lists() {
      const out: CrmList[] = [];
      for (const [obj, plural] of Object.entries(SF_OBJECTS)) {
        let next: string | null = `${base}/sobjects/${obj}/listviews`;
        for (let page = 0; next && page < 10; page++) {
          const r = await get(next);
          for (const v of r.json?.listviews ?? []) if (v.soqlCompatible !== false) out.push({ id: `${obj}:${v.id}`, name: `${plural}: ${v.label ?? v.developerName ?? v.id}`, size: null });
          next = r.json?.done === false && r.json?.nextRecordsUrl ? String(r.json.nextRecordsUrl) : null;
        }
      }
      return out;
    },
    async records(listId, extra, max) {
      const m = /^(Contact|Lead):([A-Za-z0-9]{15,18})$/.exec(listId);
      if (!m) throw new CrmError('that is not a Salesforce list view id (Contact:… or Lead:…)');
      const obj = m[1] as SfObject, view = m[2];
      // Field-level security: describe lists only the fields this user may read. Anything else is unreadable, not empty.
      const readable = new Set<string>(((await get(`${base}/sobjects/${obj}/describe`)).json?.fields ?? []).map((f: { name: string }) => f.name));
      const wanted = [...new Set([...SF_FIELDS, ...extra])];
      const unreadable = wanted.filter(f => !readable.has(f));
      if (!readable.has('MobilePhone') && !readable.has('Phone'))
        throw new CrmError(`the Salesforce user Vyakti connects as cannot read the phone fields (MobilePhone, Phone) on ${obj}; give it read access in field-level security, then try again`);
      const lv = (await get(`${base}/sobjects/${obj}/listviews/${view}/describe`)).json;
      if (!lv?.query) throw new CrmError('Salesforce did not describe that list view; it may have been deleted');
      const { tail, countTail } = splitListViewQuery(String(lv.query), obj);
      // Count first, so a pull the budget cannot finish stops before it reads a page.
      const total = Math.min(Number((await soql(`SELECT COUNT() FROM ${obj}${countTail ? ` ${countTail}` : ''}`)).json?.totalSize ?? 0), max);
      // Before every page: are there calls enough to finish? Salesforce may send fewer than 2,000 records a page (it shrinks
      // batches of wide records), so the estimate is redone from the pages actually received.
      const enough = (got: number, perPage: number) => {
        const need = Math.max(1, Math.ceil((total - got) / Math.max(1, perPage))), left = Math.max(0, meter.left());
        if (left < need) throw new CrmBudgetError(`this list view needs about ${need} more Salesforce API call${need === 1 ? '' : 's'} and ${left} ${left === 1 ? 'is' : 'are'} left in the budget for the last 24 hours; nothing was imported`);
      };
      let select = wanted.filter(f => readable.has(f));
      const records: CrmRecord[] = [];
      let truncated = false;
      for (let retry = 0; ; retry++) {
        try {
          let next: string | null = null, pages = 0;
          enough(0, SF_PAGE);
          let r = await soql(`SELECT Id, ${select.join(', ')} FROM ${obj}${tail ? ` ${tail}` : ''}`);
          for (;;) {
            pages++;
            for (const c of r.json?.records ?? []) {
              if (records.length >= max) { truncated = true; break; }
              records.push({ id: String(c.Id), updatedAt: c.LastModifiedDate ?? null, fields: Object.fromEntries(select.map(k => [k, str(c[k])])) });
            }
            next = !truncated && r.json?.done === false && r.json?.nextRecordsUrl ? String(r.json.nextRecordsUrl) : null;
            if (!next) break;
            enough(records.length, records.length / pages);
            r = await get(next);
          }
          break;
        } catch (e) {
          // A field hidden after the describe (or a custom field named wrong) fails the whole query: drop it and say so.
          const bad = e instanceof CrmError && e.code === 'INVALID_FIELD' ? /No such column '([A-Za-z0-9_]+)'/.exec(e.message)?.[1] : undefined;
          if (!bad || retry >= 5 || !select.includes(bad) || records.length) throw e;
          select = select.filter(f => f !== bad); unreadable.push(bad);
          if (!select.includes('MobilePhone') && !select.includes('Phone')) throw new CrmError(`the Salesforce user Vyakti connects as cannot read the phone fields on ${obj}; give it read access in field-level security, then try again`);
        }
      }
      return { records, truncated, unreadable };
    },
  };
}

// ---- records to the table intake reads ---------------------------------------------------------

/** Headers intake's mapping already knows, so a pulled list maps like a file. One Phone column: mobile first, else phone
 *  (the other is kept as "Other phone"). The CRM id comes first so imports stay idempotent on it. A field the CRM user may
 *  not read gets no column at all: an empty column would read as "no consent" or "may call", which nobody said. */
export function recordsToRows(kind: CrmKind, records: CrmRecord[], extra: string[], unreadable: string[] = []): string[][] {
  const std = kind === 'hubspot'
    ? { first: 'firstname', last: 'lastname', mobile: 'mobilephone', phone: 'phone', email: 'email', language: 'hs_language', dnc: '', updated: 'lastmodifieddate' }
    : kind === 'salesforce'
      ? { first: 'FirstName', last: 'LastName', mobile: 'MobilePhone', phone: 'Phone', email: 'Email', language: '', dnc: 'DoNotCall', updated: 'LastModifiedDate' }
      : { first: 'First_Name', last: 'Last_Name', mobile: 'Mobile', phone: 'Phone', email: 'Email', language: '', dnc: '', updated: 'Modified_Time' };
  const hidden = new Set(unreadable);
  const has = (k: string) => !!k && !hidden.has(k);
  // Columns past the phone ones: each only when the CRM has the field and the user may read it.
  const optional: [string, string][] = [['Email', std.email], ['Language', std.language], ['Do not call', std.dnc]].filter(([, k]) => has(k)) as [string, string][];
  const more = extra.filter(has);
  const idHeader = kind === 'hubspot' ? 'HubSpot id' : kind === 'salesforce' ? 'Salesforce id' : 'Zoho id';
  // Salesforce custom fields end in __c; the header drops it so Call_Consent__c is read like a file's "Call consent".
  const heading = (k: string) => kind === 'salesforce' ? k.replace(/__c$/i, '') : k;
  const rows = [[idHeader, 'First name', 'Last name', 'Phone', 'Other phone', ...optional.map(([h]) => h), 'Updated at', ...more.map(heading)]];
  for (const r of records) {
    const f = r.fields;
    const main = f[std.mobile] || f[std.phone] || '';
    const other = f[std.mobile] && f[std.phone] && f[std.phone] !== f[std.mobile] ? f[std.phone] : '';
    rows.push([r.id, f[std.first] ?? '', f[std.last] ?? '', main, other, ...optional.map(([, k]) => f[k] ?? ''), r.updatedAt ?? '', ...more.map(k => f[k] ?? '')]);
  }
  return rows;
}
