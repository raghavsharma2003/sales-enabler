> ## Documentation Index
> Fetch the complete documentation index at: https://plivo.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 160-Series Numbers

> Setup guide for BFSI entities to provision 160-series numbers for transactional and service voice communications in India

> [!NOTE]
>
> * **What:** 160-series numbers are TRAI-regulated for BFSI transactional and service voice calls in India.
> * **You must:** Register on Tata DLT and complete Plivo's header and template provisioning.
> * **If you don't:** Using them for promotional calls leads to disconnection and penalties.

***

## Overview

160-series numbers are ten-digit telephone numbers designated by the Indian Department of Telecommunications for transactional and service voice communications by regulated BFSI entities.

***

## Permitted Use Cases

160-series numbers are for transactional or service-related communication only. **Do not use them for marketing or promotional purposes.**

Acceptable use cases:

* Payment reminders and transaction notifications
* Account statements and balance updates
* Service alerts and system notifications related to subscribed services
* Authentication, alerts, customer support, regulatory communication, and service calls

***

## Eligibility

160-series numbers are allocated only to BFSI (Banking, Financial Services, and Insurance) entities that hold a valid licence or registration from a recognized financial regulator. You declare the regulator and licence number on the BFSI Customer Application Form.

| Entity Type | Governing regulator | Examples |
| - | - | - |
| Bank | RBI | Commercial banks, cooperative banks, small finance banks |
| NBFC | RBI | Non-banking financial companies |
| Insurance | IRDAI | Life, general, and health insurance providers |
| Mutual Fund / Asset Manager | SEBI | Asset management companies, mutual fund distributors |
| Payment Aggregator | RBI | Payment service providers and aggregators authorized under the PA/PG framework |
| Pension Fund | PFRDA | Pension fund managers, NPS intermediaries |
| Fintech | RBI / SEBI / IRDAI (as applicable) | Regulated financial technology businesses |
| Other BFSI | Specify regulator on the form | Other regulated financial entities (specify in the BFSI Customer Application Form) |

***

## Roles in 160-Series Provisioning

| Role | Who it is | Responsibilities |
| - | - | - |
| Access Service Provider (VNO) | **Plivo** | Allocates the 160-series number and issues the NOC to the TM. Plivo is **neither** the PE nor the TM |
| Principal Entity (PE) | The BFSI business | Holds the regulatory licence, registers as PE on Tata DLT, owns the content templates, signs the BFSI Customer Application Form |
| Telemarketer (TM) | The entity placing the call | Holds the Tata DLT TM ID, signs the Aggregator Telemarketer Declaration, approves the Voice Header in Partner-Managed setups |

### Self-Managed vs Partner-Managed

There are two possibilities depending on who places the calls:

| Setup | Description | Example |
| - | - | - |
| **Self-Managed** | The PE and TM are the **same legal entity**. The BFSI business that owns the campaign also makes the calls | A bank running its own transactional alerts and OTP calls |
| **Partner-Managed** | The PE and TM are **different entities**. A third party makes calls on behalf of the BFSI business | A contact-center provider placing OTP and reminder calls on behalf of a bank |

Both setups use the same steps below; the difference shows up during registration.

> [!NOTE]
>
> **TM registration location.** Plivo currently accepts 160-series provisioning only when the **TM entity is registered in Mumbai or Karnataka**. Entities registered elsewhere are not supported today.

> [!NOTE]
>
> **DLT operator support.** Plivo currently provisions 140 and 160-series numbers exclusively through Tata Teleservices and is in the process of onboarding additional service providers. Entities registered on other DLT platforms (Airtel, Vi, BSNL) are not supported today.

***

## Prerequisites

| Requirement | Details |
| - | - |
| Plivo account | Active Plivo India account |
| Regulatory licence | Valid licence or registration number from your governing regulator (RBI, SEBI, IRDAI, PFRDA, or equivalent) |
| Tata DLT registration | PE registered on the [Tata DLT portal](https://telemarketer.tatateleservices.com/#/tmpe-common-registration-01). In Partner-Managed, the TM is registered separately; in Self-Managed, the same entity registers as both PE and TM |

The [BFSI Customer Application Form](https://www.plivo.com/downloads/Plivo_BFSI_Customer_Application_Form.docx) and the [Aggregator Telemarketer Declaration](https://www.plivo.com/downloads/Plivo_Aggregator_Telemarketer_Declaration.docx) are collected by Plivo during Step 2 below — no separate Plivo KYC is required.

***

## Provisioning Process

### Step 1: Tata DLT Registration

**Who:** PE (and TM, if different)

Register on the [Tata Teleservices DLT portal](https://telemarketer.tatateleservices.com/#/tmpe-common-registration-01):

| Setup | What to register |
| - | - |
| Self-Managed | Register the same legal entity as both PE and TM |
| Partner-Managed | PE registers as PE; TM registers separately as TM |

Tata emails the approved PE certificate (and TM certificate where applicable) to the registered email IDs.

### Step 2: Submit Forms to Plivo

**Who:** PE and TM (you, or your partner)

1. Download the [BFSI Customer Application Form](https://www.plivo.com/downloads/Plivo_BFSI_Customer_Application_Form.docx) and the [Aggregator Telemarketer Declaration](https://www.plivo.com/downloads/Plivo_Aggregator_Telemarketer_Declaration.docx).
2. Fill in all fields. The BFSI form captures the PE's regulatory category, governing regulator, licence number, DLT registration ID, and chosen setup (Self-Managed or Partner-Managed). The TM declaration captures the TM's PAN, CIN, Tata DLT TM ID, and the PE relationship.
3. The PE signs and seals the BFSI form; the TM signs and seals the TM Declaration. In Self-Managed, the same legal entity signs both forms in its respective PE and TM capacities.
4. Submit both forms to Plivo by **emailing them to your Account Manager or raising a [Plivo Support](https://support.plivo.com) ticket** with the forms attached.

### Step 3: Plivo Allocates the Number and Issues the NOC

**Who:** Plivo

After Plivo validates both forms:

1. Plivo allocates a 160-series number to your account.
2. Plivo issues a No Objection Certificate (NOC) to the TM by replying to the same email or support ticket where the forms were shared. Plivo issues a separate NOC for **each** number procured.

### Step 4: Voice Header Registration

**Who:** PE (always — in Self-Managed, log in with your PE persona on Tata DLT)

The PE logs into the [Tata DLT portal](https://telemarketer.tatateleservices.com/#/tmpe-common-login) and submits the Voice Header registration with these fields:

![Voice Header registration by PE](https://mintcdn.com/plivo/F_qF380XLyDRnOHd/images/160-voice-header-registration.png?fit=max\&auto=format\&n=F_qF380XLyDRnOHd\&q=85\&s=fa0b1d56ab5377266701845b9a8f2040)

| Field | Value |
| - | - |
| Entity ID | Your PE ID |
| Header CLI | The 160-series number allocated by Plivo |
| Business Category | The BFSI category that matches your business on the Tata DLT portal |
| Supporting documents | Upload your business-category certificate from the governing regulator and the Plivo NOC for this number |
| Remarks and Purpose | State the transactional or service purpose of the calls |

During registration, the portal asks whether the PE and TM are the same entity:

| Setup | What to select |
| - | - |
| Self-Managed (PE = TM) | Select **PE and TM are the same** |
| Partner-Managed (PE ≠ TM) | Select **PE and TM are different** and enter the TM's Entity ID |

![Self-Managed selector](https://mintcdn.com/plivo/F_qF380XLyDRnOHd/images/160-self-managed-option.png?fit=max\&auto=format\&n=F_qF380XLyDRnOHd\&q=85\&s=a736cc7023f9d91883d6da1a7874ef32)

![Partner-Managed selector](https://mintcdn.com/plivo/F_qF380XLyDRnOHd/images/160-partner-managed-option.png?fit=max\&auto=format\&n=F_qF380XLyDRnOHd\&q=85\&s=6bf97963eb10ee24f5dfed0fd10de889)

After submission, the portal generates a Unique Registration Number (URN) for the Voice Header. In Partner-Managed, share this URN with the TM so they can locate and approve the request.

![URN generated](https://mintcdn.com/plivo/F_qF380XLyDRnOHd/images/160-urn-generated.png?fit=max\&auto=format\&n=F_qF380XLyDRnOHd\&q=85\&s=0f44c9a927292ab0370a2139c8dc2fa1)

### Step 5: Voice Header Approval by TM (Partner-Managed only)

**Who:** TM — **skip this step in Self-Managed**

In Self-Managed, the Voice Header proceeds directly to Tata review. In Partner-Managed, the TM logs into the [Tata DLT portal](https://telemarketer.tatateleservices.com/#/tmpe-common-login), opens the pending Voice Header using the URN shared by the PE, and approves it.

The TM goes to **Voice Header Registration List For TM** and reviews the pending request.

![Voice Header registration list for TM](https://mintcdn.com/plivo/F_qF380XLyDRnOHd/images/160-voice-header-list-tm.png?fit=max\&auto=format\&n=F_qF380XLyDRnOHd\&q=85\&s=fc020848730bed204ce5e7dc579be027)

The TM then accepts or rejects the request.

![TM accept or reject](https://mintcdn.com/plivo/F_qF380XLyDRnOHd/images/160-tm-accept-reject.png?fit=max\&auto=format\&n=F_qF380XLyDRnOHd\&q=85\&s=465a2b8ee0854af63f13512053b92d33)

Tata's DLT team reviews and approves the Voice Header within 3–5 business days. You receive an email once the header is approved.

### Step 6: Voice Template Registration

**Who:** PE

The PE logs into the [Tata DLT portal](https://telemarketer.tatateleservices.com/#/tmpe-common-login) and goes to **Voice** > **Voice Template Registration by PE**. Register a Voice Content Template for each message type you intend to send (for example, payment reminders, OTP delivery, transaction confirmations).

![Voice template registration](https://mintcdn.com/plivo/F_qF380XLyDRnOHd/images/160-voice-template-registration.png?fit=max\&auto=format\&n=F_qF380XLyDRnOHd\&q=85\&s=c94d60b673ff5076660871420b4585c0)

Each template defines the exact messages transmitted using the 160-series number. Once templates are approved, the number is ready for live operations.

***

## Estimated Timelines

| Step | Duration |
| - | - |
| Tata DLT registration | 2–3 business days |
| Plivo number allocation and NOC issuance | 1–2 business days after form submission |
| Voice Header approval by Tata | 3–5 business days |
| Voice Template approval by Tata | 1–2 business days |
| **Total** | **\~7–14 business days** |

***

## Best Practices

* **Maintain compliance documentation** — Keep all documents (PE Certificate, TM Certificate where applicable, signed forms, NOCs, regulatory certificates) in a secure, accessible location for audits.
* **Monitor DLT portal status** — Check the Tata DLT portal regularly for renewal requirements and compliance notifications.
* **Test before go-live** — Validate Voice Templates and call flows in a test environment before production.
* **Stay updated on regulations** — Monitor TRAI and DoT announcements for changes to 160-series number regulations.

***

## FAQs

### Can I use 160-series numbers for promotional calls?

No. 160-series numbers are strictly for transactional and service communications. Using them for promotional or marketing purposes violates TRAI regulations and can result in number disconnection and penalties.

***

### Do I need to submit a new NOC for every 160-series number?

Yes. Plivo issues a separate NOC for each number procured. Upload the relevant NOC during Voice Header registration on the Tata DLT portal.

***

### What if my entity is registered on a DLT platform other than Tata?

Plivo currently provisions 160-series numbers exclusively through Tata Teleservices. Register as a Principal Entity on the Tata DLT portal.

***

### What happens if my Voice Header registration is rejected?

You receive notification via the DLT portal with the reason for rejection. Common reasons:

* Incomplete or incorrect documentation
* Mismatch between PE or TM details and submitted documents
* Invalid NOC or regulatory certificate

Review the reason, correct the issue, and resubmit.

***

### Do I need to renew my 160-series numbers?

Yes. Maintain active PE registration (and TM registration where applicable) on the Tata DLT portal and keep all compliance documents current. Check with Tata for renewal timelines on PE registration and content templates.

***

## Related

* [India Calling Regulations](https://plivo.com/docs/voice/concepts/india-calling.md) — Regulatory requirements and calling rules
* [India Number KYC](https://plivo.com/docs/numbers/rent-india-numbers.md) — KYC documents and number rental process
* [140-Series Numbers](https://plivo.com/docs/voice/concepts/140-series-provisioning.md) — Setup guide for promotional voice numbers
* [UCC Management](https://plivo.com/docs/voice/concepts/ucc-management.md) — How Plivo handles UCC complaints
* [Plivo Console](https://cx.plivo.com/home) — Manage your account and numbers
* [Plivo Support](https://support.plivo.com) — Get help with provisioning questions
