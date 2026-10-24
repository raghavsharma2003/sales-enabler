# CRM contact import: the API pages used (read 2026-10-24)

What intake's HubSpot, Zoho CRM and Salesforce importers (`product/server/modules/intake/crm.ts`) call, and the shapes the
test fakes (`product/tests/intake-crm.test.ts`, `product/tests/intake-salesforce.test.ts`) imitate. Read-only: no endpoint here writes to the CRM. No real API call was made and
no key was used; every test talks to a local fake server.

## HubSpot (CRM v3; private-app or OAuth token, `Authorization: Bearer <token>`)

| Call | Page | Used for |
|---|---|---|
| `POST /crm/v3/lists/search` | https://developers.hubspot.com/docs/api-reference/crm-lists-v3/lists/post-crm-v3-lists-search and the legacy reference https://developers.hubspot.com/docs/api-reference/legacy/crm/lists/search-lists | Lists the member can pick. Body `{ query, count, offset, processingTypes?, additionalProperties: ['hs_list_size'] }`. Response `{ lists: [{ listId, name, objectTypeId, processingType, additionalProperties: { hs_list_size } }], hasMore, offset, total }`. Contact lists have `objectTypeId` `0-1`. |
| `GET /crm/v3/lists/{listId}/memberships/join-order?limit=&after=` | https://developers.hubspot.com/docs/api-reference/crm-lists-v3/memberships/get-crm-v3-lists-listId-memberships | Record ids in a list. `limit` default 100, max 250. Response `{ results: [{ recordId, membershipTimestamp }], paging?: { next?: { after, link } }, total }`. |
| `POST /crm/v3/objects/contacts/batch/read` | https://developers.hubspot.com/docs/api-reference/crm-contacts-v3/batch/post-crm-v3-objects-contacts-batch-read ; limit from https://developers.hubspot.com/docs/api-reference/crm-objects-v3/guide | Contact properties for up to **100 ids per request**. Body `{ inputs: [{ id }], properties: [...], propertiesWithHistory: [] }`. Response `{ status, results: [{ id, properties, createdAt, updatedAt, archived }], startedAt, completedAt }`; 207 adds `errors`, `numErrors`. |

Gaps in the pages:
- The v3 search page does not show its response. The shape above is from the legacy reference and a search summary: `lists`, `hasMore`, `offset`, `total`, with `hs_list_size` under `additionalProperties`.
- A newer dated path `/crm/lists/2026-03/search` exists. The importer uses `/crm/v3/`.

## Zoho CRM (v8; `Authorization: Zoho-oauthtoken <access_token>`)

| Call | Page | Used for |
|---|---|---|
| `POST {accounts}/oauth/v2/token?refresh_token=&client_id=&client_secret=&grant_type=refresh_token` | https://www.zoho.com/crm/developer/docs/api/v8/refresh.html | An access token from the stored refresh token. Response `{ access_token, api_domain, token_type, expires_in }` (3600 s). Accounts domain by datacenter: com, com.au, eu, in, com.cn, jp, zohocloud.ca. |
| `GET {api_domain}/crm/v8/settings/custom_views?module=Contacts` | v2 reference https://www.zoho.com/developer/docs/vertical-solutions/api/v2/custom-view-meta.html (the v8 page returned 404 on 2026-10-24); v8 path confirmed by third-party references | Views the member can pick. Response `{ custom_views: [{ id, display_value, name, system_name }], info }`. |
| `GET {api_domain}/crm/v8/Contacts?cvid=&fields=&per_page=200&page_token=` | https://www.zoho.com/crm/developer/docs/api/v8/get-records.html | Records in a view. `fields` is mandatory (at most 50 API names); `per_page` max 200. `page` reaches only 2,000 records, so further pages use `page_token` from `info.next_page_token`. Response `{ data: [{ id, First_Name, Last_Name, Phone, Mobile, Modified_Time, ... }], info: { per_page, count, page, more_records, next_page_token } }`. |

Gaps in the pages:
- A 204 for an empty view is not on the records page. The importer treats 204 or an empty `data` as no records.
- The official v8 custom-views page was not found. The fake follows the v2 shape.

## Salesforce (REST API v62.0; `Authorization: Bearer <access_token>`)

Sources, read 2026-10-24.
- The official pages on developer.salesforce.com refuse automated access: they return 403 to both WebFetch and curl.
  The API reference PDF on resources.docs.salesforce.com did not verify over TLS through the session proxy. TLS
  verification was not turned off.
- The shapes below therefore come from two places. The official page text was quoted in search results. The source of
  jsforce 3.6.3 (npm), a widely used client, was downloaded and read, not run. Treat them as **secondary**.
- No real Salesforce org was called.

| Call | Source | Used for |
|---|---|---|
| `POST {login or My Domain}/services/oauth2/token`, form body `grant_type=refresh_token&refresh_token&client_id&client_secret` | jsforce `oauth2.js` (`refreshToken`, `_postParams` posts form-encoded to `${loginUrl}/services/oauth2/token`) | An access token and `instance_url`. The default login host is `https://login.salesforce.com`. The importer refuses any host that is not https on `salesforce.com` / `force.com` before sending credentials. |
| `GET /services/data/vXX.X/sobjects/{Contact,Lead}/listviews` | jsforce `sobject.js` `listviews()`; official page "List Views" (search result) | The views a member can pick. Response `{ listviews: [{ id, label, developerName, soqlCompatible, url }], done, nextRecordsUrl, size }`. Views with `soqlCompatible: false` (Recently Viewed) are not offered. |
| `GET .../sobjects/{obj}/listviews/{id}/describe` | jsforce `ListView.describe()`; official "List View Describe" ("the ID, the columns, and the SOQL query", v32.0+). `DescribeSoqlListView` documents `query`, `whereCondition`, `scope`, `sobjectType`, `orderBy`. | The view's SOQL (`query`). The importer keeps its `FROM … WHERE … ORDER BY` tail and replaces the column list with its own. |
| `GET .../sobjects/{obj}/describe` | jsforce `describe()` | The fields this user may read (see the field-level security gap below). |
| `GET .../query?q=SOQL`, then `GET {nextRecordsUrl}` while `done` is false | jsforce `query.js` (`nextRecordsUrl` locator) | Records. `SELECT COUNT() …` gives `totalSize` first, so the budget is checked before any page is read. |
| `Sforce-Limit-Info: api-usage=used/limit` on every REST answer except `/` | Official "Limit Info Header" (search result: "The first number is the number of API calls used, and the second number is the API limit for the organization"); jsforce `connection.js` parses `/api-usage=(\d+)\/(\d+)/` | The org's own usage. The importer stops at 90% of the limit. |

Gaps:
- **Field-level security.** No source confirms that `describe` omits fields the running user cannot read. Third-party
  reports agree that SOQL naming such a field fails with `INVALID_FIELD` "No such column". The importer handles both:
  - a field missing from describe is unreadable;
  - an `INVALID_FIELD` on a selected field drops that field once and names it.

  Neither case is ever imported as an empty value.
- **`REQUEST_LIMIT_EXCEEDED`.** That this is the daily-cap error (403) is from general knowledge and third-party pages,
  not an official page read here. It is handled as a budget stop, not as bad credentials.
- **Whether failed requests and the token exchange count toward the daily limit.** Not confirmed. The importer counts
  every REST attempt, retries included. It does not count the token exchange.
- **Page size.** Salesforce may return fewer than 2,000 records a page. The importer re-estimates the calls it needs
  after every page.
- **`DoNotCall`.** That it is a standard boolean on Contact and Lead is from general knowledge, not a page read here.
  A view on an org without it simply has no "Do not call" column.

## What the importer does not take

- **Consent and DND.** No CRM here has a standard field for consent to phone calls. HubSpot's `hs_legal_basis` is about data processing, and Zoho's `Email_Opt_Out` is about email, so neither is taken as call consent or opt-out.
  - Salesforce's standard `DoNotCall` is the one do-not-call field a CRM keeps for phone calls. It is read by default and matched as an opt-out (a suppression, never cleared). The registry's DND status (NCPR) is still never taken from a CRM.
  - A workspace that keeps consent or do-not-call in its own CRM field adds that field to the pull and maps it in `source.map`, as with a file. A Salesforce custom field's `__c` is dropped from the column heading, so `Call_Consent__c` reads like "Call consent".
  - Otherwise, consent and DND stay unknown.
- **Writing back.** Nothing is written to the CRM.
