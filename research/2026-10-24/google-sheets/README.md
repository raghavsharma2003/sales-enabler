# Google Sheets as a contact source: the pages used (read 2026-10-24)

What intake's Sheets client (`product/server/modules/intake/sheets.ts`) calls, and the shapes its test fake
(`product/tests/intake-sheets.test.ts`) imitates.
- Read only: nothing writes to a sheet.
- No Google account or real key was used. The test generates its own RSA key, and the fake verifies the JWT signature
  with the matching public key.
- The owner's Google credentials are never involved. A workspace connects its own service account (workspace's
  `google_workspace` integration, `service_account_json`).

| Call | Page | Used for |
|---|---|---|
| JWT bearer token: `POST https://oauth2.googleapis.com/token`, `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=<JWT>` | https://developers.google.com/identity/protocols/oauth2/service-account (HTTP/REST) | Header: `"alg": "RS256"`, `"typ": "JWT"`, optional `kid`. Claims: `iss` (the service account's email), `scope`, `aud` ("always `https://oauth2.googleapis.com/token`"), `iat`, and `exp` ("a maximum of 1 hour after the issued time"). Response: `access_token`, `expires_in` 3600, `token_type` Bearer. Scope `https://www.googleapis.com/auth/spreadsheets.readonly`. |
| `GET https://sheets.googleapis.com/v4/spreadsheets/{id}?fields=…` | https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/get and …/spreadsheets/sheets (SheetProperties) | The tabs: `sheetId`, `title`, `sheetType`, `gridProperties.rowCount`. Only GRID tabs are offered. |
| `GET …/v4/spreadsheets/{id}/values/{range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE` | https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get and …/spreadsheets.values (ValueRange) | One tab's cells as shown. `values` is an array of rows; "empty trailing rows and columns will not be included", so rows can be ragged. |
| Published CSV link `https://docs.google.com/spreadsheets/d/e/<id>/pub?gid=…&single=true&output=csv` | Third-party examples only (no Google help page found; see the gaps below) | A sheet with no credentials. Only `docs.google.com` and a CSV output are accepted. Redirects are followed only to `docs.google.com` or `*.googleusercontent.com`, at most 4 hops, 20 MB. |

## Gaps

- **The published-link format** is documented here only by third-party pages. That is why the importer accepts it only
  from docs.google.com, requires `output=csv` (or `export?format=csv`), and refuses an HTML answer.
- **The redirect host for published CSVs** (`*.googleusercontent.com`) is from general knowledge, not a page read here.
- **A 403 from Sheets** is taken to mean "not shared with the service account". The error names the address to share
  with.
- **No stable row id.** A sheet row has none, so a sheet dedupes on the phone number exactly as a file does. A changed
  number is a new person, not a flagged change as with a CRM.
