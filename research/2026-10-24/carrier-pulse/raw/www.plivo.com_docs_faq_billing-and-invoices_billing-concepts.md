> ## Documentation Index
> Fetch the complete documentation index at: https://plivo.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Billing Concepts

> How billing works for voice calls, SMS, MMS, and phone numbers on Plivo

Frequently asked questions about how Plivo charges for voice calls, messaging, and phone numbers.

***

## How does voice call billing work?

Plivo bills voice calls based on per-minute rates with billing increments that depend on the product:

| Product | Billing Increment | How It Works |
| - | - | - |
| Voice API | 60-second (60/60) | Calls are rounded up to the next full minute. A 10-second call is billed as 1 minute. |
| Zentrunk (SIP Trunking) | Varies by country | Per-second (1/1) for US routes, 60-second (60/60) for India routes. Other destinations vary — check your rate sheet for details. |

**Key details:**

* Billing starts when the call is answered, not when it starts ringing.
* Both inbound and outbound call legs are billed separately.
* Rates vary by destination country and number type. See [Voice Pricing](https://www.plivo.com/voice/pricing/) for current rates.

***

## How does SMS and MMS billing work?

SMS and MMS are billed **per message segment**.

**SMS segments:**

* A single SMS segment can contain up to **160 characters** using GSM-7 encoding (standard Latin characters).
* If your message uses **Unicode** characters (such as non-Latin scripts or special symbols), the segment limit drops to **70 characters**.
* Messages longer than one segment are split into multiple segments, each billed separately. For multi-part messages, segment limits are 153 characters (GSM-7) or 67 characters (Unicode) due to concatenation headers.

**MMS:**

* MMS messages are billed per message, regardless of media size.
* MMS is available only for US and Canadian destinations.

See [SMS Pricing](https://www.plivo.com/sms/pricing/) for current per-segment rates.

***

## What are phone number charges?

Plivo charges a **monthly rental fee** for each phone number on your account.

* Rental is charged on a calendar-month basis starting from the date of purchase.
* Rates vary by country and number type (local, toll-free, mobile, national).
* Some countries may have one-time setup charges in addition to the monthly rental.
* Numbers removed mid-month are billed for the full month.

See [Phone Number Pricing](https://www.plivo.com/virtual-phone-numbers/pricing/) for rates by country.

***

## What is CPS and how do I increase it?

**CPS (Calls Per Second)** is the maximum number of concurrent outbound call requests Plivo processes per second for your account.

| Account Type | Default CPS |
| - | - |
| Standard | 1–2 CPS by plan and data region — see [Account and feature limits](https://plivo.com/docs/voice/concepts/account-limits.md) |
| Enterprise | Custom (higher limits available) |

Outbound CPS is a single account-wide pool shared by Voice API and SIP Trunking. It is not allocated per product. An account with 2 outbound CPS can initiate two outbound calls per second in total, whether those calls go out over Voice API, over SIP Trunking, or a mix of both.

If you need higher CPS for large-scale calling campaigns or high-volume applications, ask **Buddy**, Plivo's in-console chat agent, from the [Plivo console](https://cx.plivo.com/home) to move to an Enterprise plan with increased CPS limits.

> [!NOTE]
>
> CPS limits apply to outbound call initiation only. They limit how fast you can *start* calls, not how many can be active at once. Concurrency is a separate limit — see [Account and feature limits](https://plivo.com/docs/voice/concepts/account-limits.md).

***

## What do billing increments like 1/1 and 6/6 mean?

These are standard telecom billing increment notations in the format **initial/subsequent**:

| Increment | Meaning |
| - | - |
| **1/1** | Per-second billing — both the first and every subsequent second are billed individually |
| **6/6** | Billed in 6-second blocks — the first 6 seconds are billed as a block, then every additional 6 seconds |
| **60/60** | Per-minute billing — the first 60 seconds are billed as a block, then every additional 60 seconds |
| **30/30** | Billed in 30-second pulses — the first 30 seconds are billed as a block, then every additional 30 seconds |
| **30/6** | First 30 seconds billed as a block, then every additional 6 seconds |

**Example with 60/60 billing:** A call lasting 61 seconds is billed as 120 seconds (2 minutes).

In the US data region, Plivo Voice API uses **60/60** (per-minute) billing, and Zentrunk billing increments vary by destination — for example, **1/1** (per-second) for US routes. Check your Zentrunk rate sheet for destination-specific increments.

In the India data region, Voice API and SIP Trunking calls are billed at a standard **30/30** (30-second pulse).

***

## Related Resources

* [Payments](https://plivo.com/docs/faq/billing-and-invoices/payments.md)
* [Invoices](https://plivo.com/docs/faq/billing-and-invoices/invoices.md)
* [Taxes](https://plivo.com/docs/faq/billing-and-invoices/taxes.md)
* [Voice Pricing](https://www.plivo.com/voice/pricing/)
* [SMS Pricing](https://www.plivo.com/sms/pricing/)
* [Phone Number Pricing](https://www.plivo.com/virtual-phone-numbers/pricing/)
