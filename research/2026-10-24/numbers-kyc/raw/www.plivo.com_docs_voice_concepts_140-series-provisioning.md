> ## Documentation Index
> Fetch the complete documentation index at: https://plivo.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 140-Series Numbers

> Setup guide for businesses to provision 140-series numbers for promotional voice communications in India

> [!NOTE]
>
> * **What:** 140-series numbers are TRAI-regulated for promotional voice calls in India only.
> * **You must:** Register on Tata DLT and complete Plivo's header and template provisioning.
> * **If you don't:** You can't place promotional calls. Explicit consent is also required first.

***

## Overview

140-series numbers are ten-digit telephone numbers designated by the Indian Department of Telecommunications for promotional voice communications. These numbers are subject to strict regulatory oversight by TRAI and are exclusively for promotional calls made with explicit digital consent.

***

## Permitted Use Cases

140-series numbers are for promotional voice communication only. **Do not use them for transactional or service calls.**

Acceptable use cases:

* Product offers and marketing campaigns
* Cross-sell and upsell calls to existing customers with consent
* Survey and feedback calls tied to a promotional intent

***

## Roles in 140-Series Provisioning

| Role | Who it is | Responsibilities |
| - | - | - |
| Access Service Provider (VNO) | **Plivo** | Allocates the 140-series number and issues the NOC to the TM. Plivo is **neither** the PE nor the TM |
| Principal Entity (PE) | The business sending the promotional message | Holds digital consent, registers as PE on Tata DLT, owns the content templates |
| Telemarketer (TM) | The entity placing the call | Holds the Tata DLT TM ID, signs the Aggregator Telemarketer Declaration, registers the Voice Header |

### Self-Managed vs Partner-Managed

There are two possibilities depending on who places the calls:

| Setup | Description | Example |
| - | - | - |
| **Self-Managed** | The PE and TM are the **same legal entity**. The business that owns the campaign also makes the calls | A bank running its own promotional calls about its products |
| **Partner-Managed** | The PE and TM are **different entities**. A third party makes calls on behalf of the business | A tech provider placing promotional calls on behalf of a bank |

Both setups use the same steps below; the difference shows up during registration.

> [!NOTE]
>
> **TM registration location.** Plivo currently accepts 140-series provisioning only when the **TM entity is registered in Mumbai or Karnataka**. Entities registered elsewhere are not supported today.

> [!NOTE]
>
> **DLT operator support.** Plivo currently provisions 140 and 160-series numbers exclusively through Tata Teleservices and is in the process of onboarding additional service providers. Entities registered on other DLT platforms (Airtel, Vi, BSNL) are not supported today.

***

## Prerequisites

| Requirement | Details |
| - | - |
| Plivo account | Active Plivo India account |
| Tata DLT registration | PE and TM both registered on the [Tata DLT portal](https://telemarketer.tatateleservices.com/#/tmpe-common-registration-01) |
| GST certificate | Active GST registration — used as the supporting document during Voice Header approval |

The [Aggregator Telemarketer Declaration](https://www.plivo.com/downloads/Plivo_Aggregator_Telemarketer_Declaration.docx) is collected by Plivo during Step 2 below — no separate Plivo KYC is required.

***

## Provisioning Process

### Step 1: Tata DLT Registration

**Who:** PE and TM (you)

Register on the [Tata Teleservices DLT portal](https://telemarketer.tatateleservices.com/#/tmpe-common-registration-01):

| Setup | What to register |
| - | - |
| Self-Managed | Register the same legal entity as both PE and TM |
| Partner-Managed | PE registers as PE; TM registers separately as TM |

Tata emails the approved TM and PE certificates to the registered email IDs.

### Step 2: Submit the Aggregator Telemarketer Declaration to Plivo

**Who:** TM (you, or your partner)

1. Download the [Aggregator Telemarketer Declaration](https://www.plivo.com/downloads/Plivo_Aggregator_Telemarketer_Declaration.docx).
2. Fill in all fields — full name, PAN, CIN, address of the TM, Tata DLT Telemarketer ID, and DLT operator (Tata Teleservices). In the Self-Managed setup, use the single legal entity's details.
3. Have the TM's authorized representative sign the document and apply the company seal.
4. Submit it to Plivo by **emailing it to your Account Manager or raising a [Plivo Support](https://support.plivo.com) ticket** with the form attached.

### Step 3: Plivo Allocates the Number and Issues the NOC

**Who:** Plivo

After Plivo validates the declaration:

1. Plivo allocates a 140-series number (Header CLI) to your account.
2. Plivo issues a No Objection Certificate (NOC) to the TM by replying to the same email or support ticket where the declaration was shared. Plivo issues a separate NOC for **each** number procured.

### Step 4: Voice Header Registration

**Who:** TM (always — in Self-Managed, log in with your TM persona on Tata DLT)

The TM logs into the [Tata DLT portal](https://telemarketer.tatateleservices.com/#/tmpe-common-login) and submits the Voice Header registration with these fields:

![Voice Header Registration by TM](https://mintcdn.com/plivo/F_qF380XLyDRnOHd/images/140-voice-header-registration-tm.png?fit=max\&auto=format\&n=F_qF380XLyDRnOHd\&q=85\&s=f52b226ba0c9f486518dcc806dbc029d)

| Field | Value |
| - | - |
| Entity ID | The PE's Entity ID (your own PE ID in Self-Managed) |
| Header CLI | The 140-series number allocated by Plivo (for example, `1401234567`) |
| TM Remarks | `Approval needed for Promotional Calls` |
| Supporting document | Upload the Plivo NOC for this number |

### Step 5: Voice Header Approval

**Who:** PE (always — in Self-Managed, log in with your PE persona on Tata DLT)

The PE logs into the [Tata DLT portal](https://telemarketer.tatateleservices.com/#/tmpe-common-login) and goes to **Voice** > **Voice Header Registration List For PE**.

![Voice Header Registration List for PE](https://mintcdn.com/plivo/F_qF380XLyDRnOHd/images/140-voice-header-registration-pe.png?fit=max\&auto=format\&n=F_qF380XLyDRnOHd\&q=85\&s=65f35acf6e65ae68c64da804346cc2f5)

Fill in the fields and approve:

| Field | Value |
| - | - |
| Business Category | The category that matches your business on the Tata DLT portal |
| Supporting documents | Upload your **GST certificate** on Tata DLT — either your existing GST registration PDF or a fresh export from the [GST taxpayer search](https://services.gst.gov.in/services/searchtp). The document must clearly show your nature/type of business |
| Remarks and Purpose | State the promotional purpose of the calls |

![GST supporting document](https://mintcdn.com/plivo/F_qF380XLyDRnOHd/images/140-gst-supporting-document.png?fit=max\&auto=format\&n=F_qF380XLyDRnOHd\&q=85\&s=1957421a0972910893de0fccf47946ee)

Tata's DLT team reviews and approves the Voice Header within 1–2 business days. You receive an email with the subject **Voice Header Registration Approved by Operator**.

### Step 6: Voice Template Registration

**Who:** PE

The PE logs into the [Tata DLT portal](https://telemarketer.tatateleservices.com/#/tmpe-common-login) and goes to **Voice** > **Voice Template Registration by PE**.

![Voice Template Registration](https://mintcdn.com/plivo/F_qF380XLyDRnOHd/images/140-voice-template-registration.png?fit=max\&auto=format\&n=F_qF380XLyDRnOHd\&q=85\&s=60a4917173e9a029ba9452861855fcbc)

Fill in all mandatory fields:

| Field | Value |
| - | - |
| Communication Type | `Promotional` |
| Header CLI | Select the approved 140-series number |
| Template Name | Short company abbreviation followed by `_promotional_<index>` (for example, `SLT_promotional_1` for a business named *Starlight*) |
| Business Category | Match the category selected during Voice Header registration |
| Template Content | `To promote product related calls from <FULL COMPANY NAME>` |
| Description of Template | Purpose of the call and a brief summary of what is spoken |
| Customer Sample Voice Template | Actual transcript of what is spoken in the call, with placeholder variables |

Submit the template. Tata approves it within 1 business day. Once approved, the 140-series number is ready for live promotional calls.

***

## Estimated Timelines

| Step | Duration |
| - | - |
| Tata DLT registration (PE + TM) | 2–3 business days |
| Plivo number allocation and NOC issuance | 1–2 business days after declaration submission |
| Voice Header approval by Tata | 1–2 business days |
| Voice Template approval by Tata | 1 business day |
| **Total** | **\~5–10 business days** |

***

## Best Practices

* **Capture explicit digital consent** — Promotional calls without valid consent are treated as Unsolicited Commercial Communication (UCC). Store consent records with timestamps for audit.
* **Maintain compliance documentation** — Keep all documents (TM Certificate, PE Certificate, Aggregator Telemarketer Declaration, NOCs, GST PDF) in a secure, accessible location for audits.
* **Monitor DLT portal status** — Regularly check the Tata DLT portal for updates, renewal requirements, or compliance notifications.
* **Test before go-live** — Validate Voice Templates and call flows in a test environment before deploying to production.
* **Stay updated on regulations** — Monitor TRAI and DoT announcements for changes to 140-series number regulations.

***

## FAQs

### Can I use 140-series numbers for transactional or service calls?

No. 140-series numbers are strictly for promotional communications only. Transactional and service calls require a different number series — see [India Calling Regulations](https://plivo.com/docs/voice/concepts/india-calling.md) for the full breakdown.

***

### Do I need to submit a new NOC for every 140-series number?

Yes. Plivo issues a separate NOC for each number procured. Upload the relevant NOC during Voice Header registration on the Tata DLT portal.

***

### What if my entity is registered on a DLT platform other than Tata?

Plivo has partnered exclusively with Tata for 140-series provisioning. Entities registered on other DLT platforms (such as Airtel, Vi, or BSNL) are not supported. Register as a Telemarketer and Principal Entity on the Tata DLT portal.

***

### What happens if my Voice Header registration is rejected?

You receive notification via the DLT portal with the reason for rejection. Common reasons include:

* Incomplete or incorrect documentation
* Mismatch between PE or TM details and submitted documents
* Invalid NOC or GST certificate

Review the rejection reason, correct the issue, and resubmit the registration.

***

### Do I need to renew my 140-series numbers?

Yes. Maintain active TM and PE registration on the Tata DLT portal and ensure all compliance documents remain current. Check with Tata regarding renewal timelines for TM, PE, and Voice Template registrations.

***

## Related

* [India Calling Regulations](https://plivo.com/docs/voice/concepts/india-calling.md) — Regulatory requirements and calling rules
* [India Number KYC](https://plivo.com/docs/numbers/rent-india-numbers.md) — KYC documents and number rental process
* [160-Series Numbers](https://plivo.com/docs/voice/concepts/160-series-provisioning.md) — Setup guide for BFSI transactional and service voice numbers
* [UCC Management](https://plivo.com/docs/voice/concepts/ucc-management.md) — How Plivo handles UCC complaints
* [Plivo Console](https://cx.plivo.com/home) — Manage your account and numbers
* [Plivo Support](https://support.plivo.com) — Get help with provisioning questions
