# Google and Microsoft account connection

The workspace owner can connect Gmail, Google Calendar, Google Drive, Microsoft 365 Mail, Calendar, or Drive from Integrations. The server stores OAuth access and refresh tokens in the encrypted connector vault. A connection is marked `connected` only after the provider accepts the token on a check request. An expired access token is refreshed before a check or sync. If refresh fails, the owner must reconnect.

## Server configuration

Set `CONNECTOR_ENCRYPTION_KEY` to a private 64-character hexadecimal value (32 bytes). Set `APP_URL` to the exact public HTTPS origin, such as `https://workspace.example.com`, with no path. For local development, the default origin is `http://127.0.0.1:3000`; set `APP_URL` explicitly if using another local origin. The callback to register in both provider consoles is:

```text
https://workspace.example.com/api/integrations/oauth/callback
```

The live callback URI is also returned by `GET /api/integrations/oauth/setup` for the signed-in workspace owner. Register that exact URI. Keep client secrets in server environment variables, never browser configuration or repository files.

| Provider | Server variables | Console configuration |
| --- | --- | --- |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Create an OAuth web application, set the authorized redirect URI, configure the consent screen, and enable Gmail, Calendar, and/or Drive APIs used by this deployment. |
| Microsoft | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`; optional `MICROSOFT_TENANT_ID` | Register a web application in Microsoft Entra, add the redirect URI, create a client secret, and grant the delegated Microsoft Graph permissions below. `MICROSOFT_TENANT_ID` defaults to `common`; set it to a tenant ID or verified tenant domain to restrict sign-in. |

Google read scopes are `gmail.readonly`, `calendar.events.readonly`, and `drive.readonly`, requested only for the selected integration. Gmail also requests `gmail.send` when the owner explicitly selects send permission. Gmail and Drive read scopes may require Google's sensitive or restricted scope verification before use outside test users. Google OAuth asks for offline access and consent so a refresh token can be stored.

Microsoft requests one selected read scope (`Mail.Read`, `Calendars.Read`, or `Files.Read`) plus `User.Read` for the `/me` connection check and `offline_access` for refresh. Microsoft Mail also requests `Mail.Send` only when the owner explicitly selects send permission. The app uses delegated permissions for the signed-in Microsoft account; an organization may require administrator consent according to its policy.

Connecting starts with owner-authenticated, same-origin `POST /api/integrations/oauth/start` and `{ "integrationId": "gmail", "allowSend": false }`. It returns an `authorizeUrl` for browser navigation. The callback uses a ten-minute, one-use state bound to the initiating owner and tenant, a sealed PKCE verifier, and the fixed callback URI. The browser returns to the workspace with a generic connection result; token and provider error bodies are never returned in that redirect.

Send scope attestation records only a scope explicitly requested in that flow and reported or guaranteed by the token response. It does not authorize a campaign or customer contact. Outbound delivery still requires the app's operator approval and current channel consent. Manual token entry remains available in the advanced integration settings, but a manual access token will need replacement when it expires.

Provider references: [Google web server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [Microsoft authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), and [Microsoft delegated scopes](https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc).
