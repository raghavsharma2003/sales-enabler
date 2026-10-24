# CRM contact import: the API pages used (read 2026-10-24)

What intake's HubSpot and Zoho CRM importers (`product/server/modules/intake/crm.ts`) call, and the shapes the test fakes
(`product/tests/intake-crm.test.ts`) imitate. Read-only: no endpoint here writes to the CRM. No real API call was made and
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

## What the importer does not take

- **Consent and DND.** Neither CRM has a standard field for consent to phone calls. HubSpot's `hs_legal_basis` is about data processing, and Zoho's `Email_Opt_Out` is about email, so neither is taken as call consent or opt-out.
  - A workspace that keeps consent or do-not-call in its own CRM field adds that field to the pull and maps it in `source.map`, as with a file.
  - Otherwise, consent and DND stay unknown.
- **Writing back.** Nothing is written to the CRM.
