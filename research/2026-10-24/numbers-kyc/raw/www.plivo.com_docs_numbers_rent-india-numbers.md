> ## Documentation Index
> Fetch the complete documentation index at: https://plivo.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# India Number KYC

> KYC documents, compliance application process, and number rental for India

> [!NOTE]
>
> * **What:** KYC process for renting Indian numbers — India data region accounts only.
> * **You must:** Submit one valid business document: GST Certificate, COI, or Udyam Registration.
> * **If you don't:** The application is rejected.

KYC compliance is required before renting Indian phone numbers. This guide covers the documents, application process, and post-approval steps.

> [!WARNING]
>
> **India Data Region Required:** Indian phone numbers are only available to India data region organizations. If your organization is in the US data region, you cannot rent Indian numbers. Data region cannot be changed after an organization is created — create a new organization with the India data region from the organization switcher in the [Plivo Console](https://cx.plivo.com/home) (no new signup needed).

***

## KYC Documents Required

Submit any **one** of the following documents:

| Document | Issued by | Must include |
| - | - | - |
| **GST Certificate** (Goods and Services Tax registration certificate) | GST Network (GSTN) | An active GSTIN |
| **Certificate of Incorporation (COI)** | Ministry of Corporate Affairs (MCA) | The Corporate Identification Number (CIN) |
| **Udyam Registration Certificate** | Ministry of Micro, Small and Medium Enterprises (MSME) | A valid Udyam Registration Number |

Plivo verifies the document against government records, so upload a current copy downloaded from the issuing portal. Business PAN alone is not accepted.

> [!WARNING]
>
> **Your first compliance application must be sealed and signed.** The document must be signed by an authorized signatory and carry a visible company seal. Plivo uses this first application to fetch your billing address and GST details (if provided). You can update these details later by submitting relevant proofs on the [Organization Settings](https://cx.plivo.com/organization-settings/general) page in the Plivo console.

> [!NOTE]
>
> **Common rejection reasons:**
>
> * The registration is cancelled, suspended, or inactive in government records
> * The document details don't match government records — download the latest copy from the GST, MCA, or Udyam portal and resubmit
> * The document is expired
> * The document isn't one of the three accepted types (for example, business PAN alone)
> * The upload is blurry, cropped, or incomplete
> * The first application isn't sealed and signed

***

## Submit Compliance Application

1. Navigate to [**Phone Numbers > KYC**](https://cx.plivo.com/phone-numbers/compliance)
2. Click **New Application**
3. Select **India** and click **Continue**
4. Upload any one of: GST Certificate, Certificate of Incorporation, or Udyam Registration Certificate (sealed and signed if this is your first application)
5. Select business type (Direct Brand or Reseller)
6. Submit

For 080/022 numbers, review is automated — you receive an acceptance or rejection typically within 5 minutes. 140-series and 160-series numbers have a separate SLA — see [140-series provisioning](https://plivo.com/docs/voice/concepts/140-series-provisioning.md) and [160-series provisioning](https://plivo.com/docs/voice/concepts/160-series-provisioning.md).

To submit by API, including for a customer's subaccount, use the [Compliance API](https://plivo.com/docs/numbers/compliance.md#create). Resellers, see [Using the API with subaccounts](#using-the-api-with-subaccounts).

***

## Business Types

| Type | Definition | Compliance Requirement |
| - | - | - |
| **Direct Brand** | Place calls for your own business | One compliance application |
| **Reseller** | Offer communication services to others | Separate application per customer |

***

## Application Status

Renting an India number and placing calls from an India number both require a compliance application in `accepted` status (shown as **Approved** in the Console). If an API error directed you to this page, find your application under [**Phone Numbers > KYC**](https://cx.plivo.com/phone-numbers/compliance) and follow the next steps for its status:

| Status | Meaning | Next Steps |
| - | - | - |
| Draft | Application started but not submitted | Complete and submit |
| Pending Approval | Submitted and under review | Wait for review (080/022: typically 5 minutes; 140-series and 160-series: separate SLA) |
| Approved | KYC verified | Rent numbers and place calls |
| Rejected | Documents need correction | Check the rejection email, fix the documents, and resubmit |
| Expired | Application is no longer valid | Create and submit a new application, then attach it to your numbers ([update compliance](#update-compliance-on-existing-numbers)) |
| Suspended | Blocked due to unresolved [UCC complaints](https://plivo.com/docs/voice/concepts/ucc-management.md) | Submit required consent proof to resolve |

If your number has **no compliance application attached**, [submit an application](#submit-compliance-application) and attach it to the number ([update compliance](#update-compliance-on-existing-numbers)).

When an application filed for a subaccount is accepted, only that subaccount's pending numbers are activated. Accepting a main-account application activates pending numbers across your account, except numbers linked to a subaccount's application.

***

## Rent Numbers After Approval

| Number Type | Who Can Use It | Permitted Use |
| - | - | - |
| **Landline series** (e.g., 022, 080) | Non-BFSI businesses | Service and transactional calls |
| **140 series** | Any business making promotional calls in India | Promotional voice calls only — additional setup required ([setup guide](https://plivo.com/docs/voice/concepts/140-series-provisioning.md)) |
| **160 series** | BFSI businesses only | Service and transactional calls — additional setup required ([setup guide](https://plivo.com/docs/voice/concepts/160-series-provisioning.md)) |

### Direct Brands

1. Go to **Buy Phone Numbers**
2. Select India
3. Compliance application links automatically

### Resellers

1. Ensure your customer's compliance application is approved in [**Phone Numbers > KYC**](https://cx.plivo.com/phone-numbers/compliance)
2. During rental, select the appropriate compliance application
3. Application must be approved beforehand

#### Using the API with subaccounts

<ol>
  <li>
    Create SubaccountOne per customer
  </li>

  <li>
    Submit ApplicationFor that subaccountAccepted
  </li>

  <li>
    Buy NumbersFor that subaccount
  </li>
</ol>

1. [Create a subaccount](https://plivo.com/docs/account/api/subaccount.md#create-a-subaccount) for each customer.
2. Submit the customer's compliance application with the [Compliance API](https://plivo.com/docs/numbers/compliance.md#create). Set `subaccount` inside the `data` JSON to that subaccount's Auth ID, and use your main account credentials.
3. Once it is accepted, [buy numbers](https://plivo.com/docs/numbers/phone-numbers.md#buy-a-phone-number) with `subaccount` set to the same Auth ID. Pass the application's `compliance_id` from the Create response as `compliance_application_id`.

Each customer's KYC stays with their subaccount: it can back only that subaccount's numbers.

***

## Update Compliance on Existing Numbers

Use this when a number is transferred between customers or the business entity using the number changes.

**Option 1:**

1. Go to **Active Numbers**
2. Select numbers
3. Click **Choose Action > Update Compliance**
4. Select compliance application
5. Click **Save**

**Option 2:**

1. Click on specific number
2. Select compliance from dropdown

> [!NOTE]
>
> An application filed for a subaccount can be attached only to that subaccount's numbers. A number linked to such an application can't move to another subaccount or back to your main account. To give it to a different customer, [unrent it](https://plivo.com/docs/numbers/account-phone-numbers.md#unrent-a-number) and buy it again for that customer's subaccount. Unrenting can't be undone.

***

## Frequently Asked Questions

### Why do calls to my India landline number fail unless I dial 0 or +91 first?

India landline numbers — the 022, 080, and other city series — consist of an STD (area) code plus a subscriber number. Under India's National Numbering Plan, the `0` is the national trunk prefix and `+91` is the country code. Neither is part of the number itself; each one tells the network that an area code follows. Without one of them, the network can't tell that the digits belong to a landline.

| Format | Example | Result |
| - | - | - |
| **E.164** (country code, no `0`) | `+918012345678` | Works from any network, in India or abroad. Use this format in every Plivo API request. |
| **National** (trunk prefix `0`, no `+91`) | `08012345678` | Works from any phone within India. |
| Neither prefix | `8012345678` | Fails. Indian mobile numbers are also 10 digits and start with 6, 7, 8, or 9, so the network reads this as a mobile number, finds no such subscriber, and rejects the call. |
| Both prefixes | `+9108012345678` | Fails. Drop the `0` when you use `+91`. |

Only a landline in the same city can dial the subscriber number on its own, because its exchange supplies the area code. A mobile handset has no local exchange to supply one, so dial the full number — with `+91` or `0` — from every mobile and every application, even from the same city.

***

### Why does my call fail with "from parameter is invalid ... is not associated with your account"?

Calls from India numbers must originate from a number rented on your Plivo account — you can't use an arbitrary caller ID. Rent an India number (see [Rent Numbers After Approval](#rent-numbers-after-approval)) and place calls from that number.

***

### Why does my call fail with "compliance application is not in 'accepted' status"?

The `from` number's compliance application isn't approved yet — it's pending, submitted, rejected, expired, or no application is attached to the number. Find the application under [**Phone Numbers > KYC**](https://cx.plivo.com/phone-numbers/compliance) and follow the next steps for its status in the [Application Status](#application-status) table.

If the error says the application is `'suspended'`, the cause is unresolved UCC complaints — see [UCC Management](https://plivo.com/docs/voice/concepts/ucc-management.md) for how to lift the suspension.

***

### Why does renting a number fail with "compliance\_application\_id is required"?

Plivo found no accepted compliance application it can attach automatically to this purchase. [Submit a compliance application](#submit-compliance-application), wait for approval, and retry — or pass the UUID of an accepted application in the `compliance_application_id` parameter of the [Buy a Phone Number](https://plivo.com/docs/numbers/phone-numbers.md#buy-a-phone-number) request.

Which applications Plivo can attach depends on how you buy:

* **With `subaccount`:** an accepted application filed for that subaccount first, then one of your main account's.
* **Without `subaccount`:** only your main account's applications.

Plivo never attaches an application filed for a different subaccount, so this error can appear even when your other subaccounts have accepted applications.

***

### Why does renting a number fail with "Compliance application must be in 'accepted' status"?

The application you passed in `compliance_application_id` isn't approved yet — the error shows its current status. Follow the next steps for that status in the [Application Status](#application-status) table, then retry once the application is approved.

***

## Related

* [India Calling Regulations](https://plivo.com/docs/voice/concepts/india-calling.md) — Regulatory requirements and calling rules
* [140-Series Numbers](https://plivo.com/docs/voice/concepts/140-series-provisioning.md) — Setup guide for promotional voice numbers (requires additional documents)
* [160-Series Numbers](https://plivo.com/docs/voice/concepts/160-series-provisioning.md) — Setup guide for BFSI numbers (requires additional documents)
* [Regulatory Compliance](https://plivo.com/docs/numbers/compliance.md) — Global compliance requirements
* [Payments](https://plivo.com/docs/faq/billing-and-invoices/payments.md) — Payment methods for India
