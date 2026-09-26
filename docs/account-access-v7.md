# Account recovery and email verification

This slice extends the existing company-session and tenant membership model. It does not migrate identities to another provider, configure Microsoft Entra SSO, or send live email during verification.

## Public and signed-in routes

| Route | Method | Request / behavior |
| --- | --- | --- |
| `/api/account/forgot` | POST | `{email}`; constant generic response, schedules recovery work after the response |
| `/api/account/resend` | POST | `{email}`; same generic response for verification |
| `/api/account/reset` | POST | `{token,password}`; consumes a reset link and revokes every session |
| `/api/account/verify` | POST | `{token}`; consumes a verification link |
| `/api/account/status` | GET | Authenticated email, verification requirement/state, delivery setup status |
| `/api/account/password` | POST | Authenticated `{currentPassword,password}`; requires current password and still-active session; revokes every session |

All POST routes require same-origin JSON. Status is available to unverified signed-in accounts. Viewer members may change their own credentials but retain read-only workspace permissions. API failures never include provider errors or token material. Recovery/resend do not disclose account existence or whether a message was sent.

The pages are `/account/forgot`, `/account/reset`, `/account/verify`, and `/account/security`. The latter also exports `AccountSecurity` from `components/account-access.tsx` for Settings. Link tokens use `#token=...`, are immediately removed from browser history, and are submitted only on explicit POST. Page loads never redeem a link. Pages prohibit referrers and search indexing. Refreshing after fragment removal requires reopening the original email link. Verification without a fragment offers a resend form.

## Configuration

| Variable | Required value / behavior |
| --- | --- |
| `APP_URL` | Canonical origin. HTTPS for Azure delivery; no credentials, query, fragment or subpath. Never derived from a recovery request's Host header. |
| `AUTH_REQUIRE_EMAIL_VERIFICATION` | `true` requires verification for new public registrations. Defaults to true in production, false otherwise. An explicit false is available for deliberate local/operator configurations. |
| `AUTH_LIFECYCLE_KEY` | Random 32-byte key encoded as 64 hexadecimal characters. Encrypts queued messages and hashes limiter identifiers. Keep outside source control. |
| `AZURE_COMMUNICATION_EMAIL_ENDPOINT` | HTTPS Azure Communication Services endpoint, independent of Azure AI resources. Fixed Azure Communication hostname allowlist. |
| `AZURE_COMMUNICATION_EMAIL_ACCESS_KEY` | ACS base64 access key. Never an AI inference key. |
| `AZURE_COMMUNICATION_EMAIL_SENDER` | Sender address approved for that Communication Services resource. |
| `AUTH_TRUSTED_IP_HEADER` | Optional ingress-overwritten header carrying the client address. Only configure behind a proxy which removes client-supplied versions. Without it, the limiter uses one conservative shared ingress bucket. |
| `AUTH_DEV_MAIL_OUTBOX` | Optional absolute local directory, active only with `NODE_ENV=development` and loopback `APP_URL`. No email is sent. Never silently enabled. |

New required-verification registrations fail with 503 **before account creation** if delivery is unconfigured. Existing accounts retain access without being falsely marked verified. An operator enabling required verification for existing accounts must make an explicit reviewed migration of their `auth:account.required` state after configuring delivery; this code does not mass-lock existing users. Newly invited members continue the existing owner-controlled invitation flow; invite tokens and lifecycle tokens have separate storage namespaces and purposes.

## Storage and concurrency

No database schema change is required. Private `auth:account`, `auth:token`, `auth:mail`, and `auth:cooldown` kinds are separate from the generic platform record prefix and entity allowlists. Tokens are random 256-bit values; only SHA-256 digests appear in token identifiers. Reset links expire in 30 minutes and verification links in 24 hours. Tokens bind the server-resolved account, organization, email, password fingerprint, purpose and account nonce. New link issuance supersedes earlier links for that account. Reset and verification share this nonce deliberately: only the most recently issued account link remains valid.

Token consumption, nonce rotation, password replacement and session revocation share one transaction with the team membership epoch fence. A removed member cannot be revived. Compare-and-set checks prevent replay/concurrent redemption. Session creation compares the password hash that was actually verified, so a login racing password reset cannot leave a session created from an old credential check. Signed-in invitation session establishment additionally fences its source session. Existing cookies remain HttpOnly, SameSite=Lax, seven days, and Secure on HTTPS.

The durable limiter uses existing service heartbeat rows under `auth:limit`: 200 requests/hour globally, 30/hour per trusted address or shared ingress, and 5/hour per email. Email and address identifiers are HMAC hashes, never raw logs. Global reservation bounds the number of limiter rows introduced. Limiter data older than two hours and token/mail/cooldown rows older than seven days are pruned on subsequent requests. A one-minute account/purpose cooldown and nonce comparison serialize link requests. Rate-limited, missing, removed, verified, and malformed email requests produce the same public response.

## Delivery and operational limits

Queued message payloads use AES-256-GCM. A durable atomic claim changes `queued` to `uncertain` before any delivery attempt. Accepted, rejected, local-outbox and uncertain states are stored without message content after completion. A crash or ambiguous network result is never automatically retried; an explicit user request for a new link is a new operation and invalidates older links. A pre-dispatch decryption/configuration failure becomes `setup-required`. The queue identifier is also the Azure operation identifier. This request-after-response dispatcher is not a background retry worker; queued work left by a process stop needs operator inspection. Provider acceptance is not delivery confirmation.

Azure signing follows the [official HMAC request contract](https://learn.microsoft.com/en-us/azure/communication-services/tutorials/hmac-header-tutorial) and [Email Send REST API](https://learn.microsoft.com/en-us/rest/api/communication/email/email/send?view=rest-communication-email-2023-03-31). Requests disable redirects, have a 12-second timeout, never read/log provider response bodies, and never fall back to a non-Azure sender. Local outbox messages are written inside a unique restricted directory (0700/0600 on POSIX; inheritance removed and current-user access granted before writing on Windows). Operators must retain these files as credentials, exclude them from backups/public hosting, and remove them after local testing. Production refuses this development transport.

Offline verification: 14 lifecycle regressions plus 14 existing team tests pass. Coverage includes replay, expiry, purpose separation, simultaneous redemption, rollback, password/session races, removed and viewer membership, grandfathered accounts, missing/bad encryption configuration, concurrent global and per-email limits, an independent HMAC fixture, and uncertain delivery dispatch once. Real Azure account email, hosted PostgreSQL concurrency, device/browser review and operational mailbox delivery remain unverified in this slice.
