> ## Documentation Index
> Fetch the complete documentation index at: https://plivo.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# India Calling Regulations

> Regulatory requirements, number series rules, TRAI TCCCPR definitions, and compliance setup for voice calling within India

> [!NOTE]
>
> * **What:** The regulatory requirements for making and receiving voice calls within India.
> * **When:** Read it before calling in India — only India-registered businesses can use domestic routes, and consent is mandatory.

Regulatory requirements, eligibility rules, and compliance setup for voice calling within India.

***

## Eligibility

Only businesses registered in India can:

* Rent Indian phone numbers
* Make domestic calls within India
* Use India domestic routes

If your business is outside India, you must use international routes. This means calls are placed at international rates and display a US or international Caller ID — not an Indian number.

***

## Requirements

| Requirement | Details |
| - | - |
| **Business registration** | India-registered businesses only |
| **KYC compliance** | Required before renting Indian numbers ([submit KYC](https://plivo.com/docs/numbers/rent-india-numbers.md)) |
| **Caller ID** | Must use Plivo-rented Indian phone number |
| **Media anchoring** | Both call legs must stay within India |

***

## Media Anchoring Rule

Both legs of a call must originate and terminate within India. Violating this causes calls to fail with `violates_media_anchoring` hangup cause.

***

## Compliant Call Architecture

| Call Type | Requirement |
| - | - |
| **Inbound** | India to India |
| **Outbound** | Indian number to India destination |
| **Conference** | All participants must be in India |

***

## Number Series Regulations

TRAI mandates specific number series for specific call types. Using the wrong series is itself a regulatory violation — complaints arising from such calls are treated as UCC regardless of consent.

| Number Series | Permitted Use | Status on Plivo |
| - | - | - |
| **140 series** | Promotional voice calls only | Available ([provisioning guide](https://plivo.com/docs/voice/concepts/140-series-provisioning.md)) |
| **Landline series** (e.g., 022, 080) | Service and transactional calls only. Promotional content is strictly prohibited. | Available |
| **160 series** (BFSI) | Service and transactional calls — BFSI sector only | Available ([provisioning guide](https://plivo.com/docs/voice/concepts/160-series-provisioning.md)) |

> [!WARNING]
>
> **Cold calling is prohibited in India.** You need explicit digital consent before making commercial calls, and must comply with TRAI guidelines. Calls made without valid consent are treated as Unsolicited Commercial Communication (UCC). See [UCC Management](https://plivo.com/docs/voice/concepts/ucc-management.md) for enforcement details.

***

## Definitions

TRAI's Telecom Commercial Communications Customer Preference (Third Amendment) Regulations, 2026 amend some definitions and add new ones, including terms for calls that software and voice AI place. The plain-language summaries below are for explanation only. The [notified regulation text](https://www.trai.gov.in/sites/default/files/2026-09/Regulation_18092026.pdf) is authoritative. The definition of Unsolicited Commercial Communication (UCC) is on the [UCC Management](https://plivo.com/docs/voice/concepts/ucc-management.md) page.

### Call and message types

**Application-to-Person (A2P) call** — A voice call that an application, software system, or automated platform initiates and delivers to a telecom subscriber, without a human dialling it. This includes autodiallers, robocalls, and calls that use pre-recorded or artificial (AI-generated) voice.

**Service call** — A call or message you make to your customer about a product or service they already have: warranty and servicing, product recalls, software upgrade alerts, product safety or security, periodic balance alerts, delivery updates, and OTPs for app login, password reset, or two-factor authentication. Service calls are not promotional and do not need explicit consent.

A call that facilitates an ongoing purchase, or your customer's ongoing use of your product or service, also counts as a service call, but only after you get their explicit consent. That consent is valid for 7 days or until the customer revokes it, whichever is earlier. The customer can renew it for 7 days at a time. A transactional call that carries service information is treated as a service call.

**Transactional call** — A call or message you make in response to a transaction your customer initiated, within 30 minutes of that transaction. Examples: OTPs from banks or non-bank entities such as e-commerce companies, transaction alerts and confirmations, balance alerts after a transaction, and refund information. Transactional calls are not promotional and do not need explicit consent.

**Message** — Has the meaning given in section 2(g) of the Telecommunications Act, 2023.

**Spam** — Unsolicited Commercial Communication (UCC), as defined in regulation 2(bw). See [UCC Management](https://plivo.com/docs/voice/concepts/ucc-management.md).

**Spammer** — A sender or telemarketer that sends UCC.

### Consent

**Consent** — Voluntary permission, explicit or inferred, that a customer gives a sender to receive commercial communication about a specified purpose, product, or service. It covers only the communication channel the customer and the sender agreed on. The customer can revoke it at any time. Consent under these regulations does not exempt you from your obligations under the Digital Personal Data Protection Act, 2023.

**Explicit consent** — Consent that is either verified directly from the recipient in a robust and verifiable way and recorded by a Consent Registrar, or obtained by the sender through any verifiable means outside the Consent Registration Function framework and then registered in the Consent Register, following the procedure TRAI specifies.

**Inferred consent** — Permission that can reasonably be inferred from the customer's conduct, or from the relationship between the recipient and the sender. For commercial messages, consent can also be inferred from the registered content template.

**Relationship** — A prior or existing relationship between a sender and a subscriber, in any of three forms:

1. A business or commercial relationship, with or without an exchange of payment.
2. An inquiry about goods, products, or services that the recipient submitted to the sender within the 7 days before the communication. The inquiry must be made in writing or through digital means, and the sender must keep it in a verifiable form.
3. An application for products or services that the recipient submitted to the sender within the 3 months before the communication.

For an inquiry or an application to count, neither party must have ended the relationship.

### Other terms

**Subscriber** — A person or legal entity who subscribes to any telecommunication service.

**Telecom resources** — Any telecommunication equipment or telecommunication identifier, as defined under the Telecommunications Act, 2023, that is used to send voice calls or messages.

**Regulatory sandbox** — A live testing environment where new products, services, processes, regulatory technology solutions, and business models can be deployed for a limited set of customers, for a specified period, with certain relaxations of the current regulations. Its purpose is to encourage innovation in telecommunication, help develop and refine Codes of Practice, and provide inputs for regulatory changes.

***

## Account Setup for India

If you need both India and international calling:

1. Create two separate Plivo accounts with different email addresses
2. [Sign up for an India data region Plivo account](https://cx.plivo.com/signup)

***

## Related

* [India Number KYC](https://plivo.com/docs/numbers/rent-india-numbers.md) — KYC documents and number rental process
* [140-Series Numbers](https://plivo.com/docs/voice/concepts/140-series-provisioning.md) — Setup guide for promotional voice numbers
* [160-Series Numbers](https://plivo.com/docs/voice/concepts/160-series-provisioning.md) — Setup guide for BFSI transactional and service voice numbers
* [UCC Management](https://plivo.com/docs/voice/concepts/ucc-management.md) — How Plivo handles UCC complaints and what you need to do
* [Carrier Failover](https://plivo.com/docs/voice/concepts/carrier-failover.md) — Automatic carrier failover for uninterrupted outbound calling
* [Payments](https://plivo.com/docs/faq/billing-and-invoices/payments.md) — Payment methods for India
