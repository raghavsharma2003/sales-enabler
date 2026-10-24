# Notifications: alerts that reach people outside the app

Settings > Notifications (`notification.destination.*`) sends alerts to a Slack channel or by email.

- **Where it is built:** `server/modules/workspace/notifications.ts` and `smtp.ts`, with `db/migrations/1030_workspace_notifications.sql`.
- **Tests:** `tests/notifications.test.ts`.

The alerts in the app (the hand-offs queue and the crisis banner for on-duty members) are unchanged. These go to Slack
and email as well.

## What can be sent

Each destination picks any of these alerts:

| Alert | When | Text (made when sent, from ids and codes only) |
|---|---|---|
| `crisis` | A crisis hand-off on a real call | `Vyakti, <workspace>: A caller may be in distress — open the call: <link to the call>` |
| `hand_off` | Any other hand-off or callback request (not a person taking over a call) | `… A call was handed to your team. Open the hand-offs queue: <link>` |
| `campaign.paused` | A campaign paused itself: a spend cap, the wallet or a guard (not a person) | `… The campaign "<name>" paused itself because its spend cap was reached. Open the campaign: <link>` |
| `wallet.low` | The wallet went low, empty or overdrawn | `… The wallet is running low (₹300 left). New calls wait until money is added; calls in progress finish. Add money: <link>` |

What is never sent:
- **No alert carries what a caller said, their name or their number.** A crisis says only that a caller may be in
  distress, with a link.
- **Test and practice calls alert no one.**

Links use `VP_PUBLIC_URL`. Without it, the text says "in Vyakti" instead of a link.

## Destinations

**Slack.** Connect Slack under Integrations with an incoming-webhook address.
- The address must start with `https://hooks.slack.com/`. Any other address is refused when it is handed over, and
  checked again before every send.
- `VP_SLACK_WEBHOOK_BASE` replaces that base, for tests or a private proxy.

**Email.** Uses the server's SMTP settings: `VP_SMTP_HOST`, `VP_SMTP_PORT` (587 by default; 465 means TLS from the first
byte), `VP_SMTP_USER`, `VP_SMTP_PASS` and `VP_SMTP_FROM`.
- STARTTLS is required unless the mail server is on the same machine.
- With no recipients listed, the email goes to every active owner, operator and compliance member.
- **With no SMTP settings, the page says "Email not set up".** Email alerts are then recorded as "Not sent" with that
  reason, never dropped silently, and the alerts in the app still appear.

## Timing and delivery

**Speed.**
- Each event is written to `webhook_outbox` by a trigger, in the same transaction as the change.
- The outbox trigger sends `NOTIFY vp_outbox`, and the server sends at once.
- A 5-second timer runs as a safety net.
- Measured in the test: about 30 to 50 ms from the hand-off committing to the local Slack-shaped receiver.

**Delivery.**
- An alert goes to each destination once: one row per destination and event.
- A destination added later does not get earlier events.
- A failed send is retried 3 times, waiting 20 s and then 60 s.
- A test alert (`notification.test`) is sent once, marked `[Test]`.
