# Payment webhooks: the provider pages used (read 2026-10-24)

What intake's payment webhooks (`product/server/modules/intake/payments.ts`) verify and read, and the shapes the test
fixtures (`product/tests/intake-payments.test.ts`) imitate.
- Every page below was read on the provider's own documentation site (Markdown versions fetched directly).
- No real payment, account or key was used. The fixtures are signed in the test with generated secrets.

## Razorpay

Sources:
- https://razorpay.com/docs/webhooks/validate-test.md
- https://razorpay.com/docs/webhooks/payments.md
- https://razorpay.com/docs/webhooks/payment-links.md

| What | From the page |
|---|---|
| Signature | `X-Razorpay-Signature`: "HMAC with SHA256 algorithm; with your webhook secret set as the key and the webhook request body as the message". The manual example compares a hex digest. "Do not parse or cast the webhook request body." |
| Secret | The webhook secret set in the dashboard (not the API key). After a change, "use the old secret … while retrying older requests". |
| Duplicates | `x-razorpay-event-id`: "unique per event". |
| Event | `event` in the JSON body (`payment.captured`, `order.paid`, `payment_link.paid`). Amounts are in paise. |
| References | `payment_link.paid` carries `payload.payment_link.entity.reference_id` and `payload.order.entity.receipt`. `notes` may be an object, `[]` or `null` (all three appear in the samples). `payment.captured` carries `payload.payment.entity.notes` and `order_id`. |
| Payer phone | The payment's `contact` can differ from the link's customer contact (the official sample shows two different numbers). The importer therefore never matches a payment to a person by phone. |

## Cashfree (Payment Gateway)

Sources:
- https://www.cashfree.com/docs/api-reference/webhooks/payloads-and-signatures.md
- https://www.cashfree.com/docs/api-reference/webhooks/reliability-and-operations.md

| What | From the page |
|---|---|
| Signature | `x-webhook-signature`. `signedPayload = x-webhook-timestamp + rawBody`, then `expectedSignature = Base64Encode(HMAC-SHA256(signedPayload, clientSecret))`. Compute from "the raw request body string". |
| Replay | "reject requests where the timestamp is older than five minutes". |
| Duplicates | "Use a stable business identifier (such as `cf_payment_id` …)". Version `2025-01-01` adds `x-idempotency-key`. |
| Event | `type: "PAYMENT_SUCCESS"`, with `data.order.order_id`, `data.order.order_tags`, `data.payment.cf_payment_id`, `payment_status: "SUCCESS"`, `payment_amount` (rupees), `payment_time`, and `data.customer_details.customer_id` and `customer_phone`. |

## PayU (India)

Sources:
- https://docs.payu.in/docs/webhook-events-and-sample-payloads.md
- https://docs.payu.in/docs/hashing-request-and-response.md

| What | From the page |
|---|---|
| Format | "The payment successful and failure payloads are in the Form POST URL Encoded format". Fields include `mihpayid`, `status=success`, `key`, `txnid`, `amount`, `addedon`, `productinfo`, `firstname`, `email`, `phone`, `udf1`–`udf10` and `hash`. |
| Reverse hash | `sha512(SALT\|status\|\|\|\|\|\|udf5\|udf4\|udf3\|udf2\|udf1\|email\|firstname\|productinfo\|amount\|txnid\|key)`. With additional charges, `additional_charges\|` comes first. "You must verify the hash and then mark a transaction as a success or failure." |
| Duplicates | `mihpayid`: "Unique transaction ID assigned by PayU for each transaction." |

## Gaps

- **PayU has no timestamp header.** Replay is bounded only by de-duplication on `mihpayid` and by the hash. A replayed old success re-records nothing.
- **Cashfree's timestamp unit** (seconds or milliseconds) is not stated on the page. The importer accepts either; a value above 10^12 is read as milliseconds.
- **The split-payment variant** of PayU's hash (`splitInfo`) is not handled. A payment that uses it fails verification and is refused, never accepted unverified.
- **Order of events.** None of the providers promises an order. The importer keys on the provider's payment id, so out-of-order or repeated deliveries are harmless.
