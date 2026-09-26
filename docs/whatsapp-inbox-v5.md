# WhatsApp Cloud inbox (v5)

The native adapter receives Meta's `messages` webhook into a tenant-scoped private inbox and lets a signed-in operator send a text reply during the 24-hour customer service window. It does not import WhatsApp content into company knowledge, grant marketing consent, send templates, start campaigns, call an LLM, or act on a message automatically.

## Owner setup

1. In **Integrations → WhatsApp Cloud**, enter a Meta access token with the required WhatsApp messaging permission, the numeric phone number ID, a strong webhook verification token, and the Meta app secret. The vault encrypts the token and both webhook secrets. An older account-check-only connection needs the two new webhook secrets added before inbox use.
2. Check the connection. In **WhatsApp inbox**, copy the callback URL, which is scoped to that workspace's connection ID. Configure that HTTPS URL and the same verification token for the WhatsApp Business Account webhook in Meta, then subscribe to the `messages` field for the intended WABA. Meta's challenge GET works after credentials are saved; signed POST delivery requires a checked connection.
3. Send a test inbound WhatsApp message from a test customer number and confirm that it appears in the inbox. No real account or message was used for repository tests.

The Graph API version defaults to `v23.0` and may be set with a validated `WHATSAPP_GRAPH_VERSION` value such as `v23.0`. The code sends only to Meta's fixed Graph host and the configured numeric phone number ID.

## Operator behavior

Messages are saved with Meta message ID, sender WhatsApp ID, bounded text, provider time, and arrival time. Unsupported media is shown by type without fetching its URL. Webhook signature verification uses the raw request bytes and the Meta app secret. Events are capped at 1 MiB, scoped by connection and phone number ID, and deduplicated by provider ID. Thread identity includes the business phone number ID, so reconfiguring the connection for another number cannot reuse an old reply window. Status events are persisted and reconcile `accepted`, `delivered`, `read`, and `failed` even if the status arrives before the send response is saved. Signed duplicate events do not create duplicate messages.

An operator can link a thread only to a reviewed customer whose saved international phone matches the sender exactly. A message does not create a customer or imply channel consent. An explicit Send click is required for every reply; a linked customer's opt-out or WhatsApp denial blocks the send. The server fences the operator's persisted membership, the latest inbound timestamp, open handoff, exact connection authority, and the exact customer records used for permission validation before egress. A per-thread atomic claim prevents simultaneous requests from sending two replies through the same conversation lane. A final atomic reservation compares all captured authority immediately before the provider callback and records that dispatch was authorized. The 24-hour limit is conservative and may exclude edge-of-window messages subject to Meta processing delay. Outside the window, the UI explains that a reviewed template is needed; no template route is available.

One request ID creates one durable outbound intent. A repeated request returns its saved state and cannot call Meta twice. A timeout, 429, 5xx, malformed success response, or worker interruption is uncertain and has no automatic resend. The thread blocks another reply while an uncertain send remains; the operator must check the Meta conversation before deciding what to do. This implementation does not offer an administrative uncertain-state resolution flow yet. Meta's message ID ties later delivery and read events to the intent. If a status event is saved but intent reconciliation is interrupted, Meta's duplicate delivery completes reconciliation. No claim of real external delivery is made by local tests.

Local SQLite is verified; PostgreSQL has the shared entity storage path but is not exercised here. The in-process webhook rate cap is supplementary, not a distributed production rate limiter. Production operation still needs a public HTTPS deployment, Meta application/WABA subscription, credentials supplied by the owner, retention policy, and live signed webhook/send verification. Do not paste secrets or customer messages into project context.

## Sources

- [Meta's WhatsApp webhook setup and challenge flow](https://whatsappbusiness.com/blog/how-to-use-webhooks-from-whatsapp-business-api/)
- [Meta's Cloud API send-text request and `wamid` response](https://www.postman.com/meta/whatsapp-business-platform/request/8gvd47s/send-text-message)
- [Meta's webhook payload and status fields](https://www.postman.com/meta/whatsapp-business-platform/folder/tduohwq/webhook-payload-reference)
- [Meta's customer support window and template distinction](https://www.postman.com/meta/whatsapp-business-platform/folder/fuaee8l/statuses-object)
- [Meta's note that status notifications can arrive out of order](https://www.postman.com/meta/whatsapp-business-platform/request/rgtfq23/message-status-update-notifications)
