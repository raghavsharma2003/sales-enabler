# Plivo: India number KYC, A2P and BYO, API notes for `number.kyc.submit`, `a2p.declare`, `byo.connect`

Read: 2026-10-23. Every claim cites a source key `(Sn)`. The keys resolve to URLs in section 8, which also gives the read date and each page's `dateModified` metadata.
How the pages were read: raw `.md` pages from plivo.com/docs (Mintlify exports the same text as the HTML), plus the full corpus at `https://www.plivo.com/docs/llms-full.txt` (S0) for cross-checks. No logins and no authenticated API calls were made.
Lines marked **UNVERIFIED** are inferences, or places where the docs are silent or contradict each other.

---

## 1. Bottom line

1. **Plivo does rent Indian numbers for outbound voice, with heavy restrictions.** Only an **India-registered business** can rent them. The business needs an **India data region** organisation, which is Mumbai-anchored, INR-only, takes Indian cards only, and can call **India destinations only**. No SMS is available. The org needs an **`accepted` KYC application** before it can rent a number or place a call (S3, S4, S5, S14, S15).
2. **Number series is the main product constraint.** Landline series (022, 080, other cities) may carry **service and transactional calls only, never promotional**. **140-series** numbers are for promotional calls. **160-series** numbers are for BFSI firms only. **Cold calling is prohibited.** Calls on the wrong series count as UCC (spam) whatever the consent. Repeated UCC complaints lead to TRAI blacklisting across *all* Indian operators for a year (S4, S5, S9, S10).
3. **`number.kyc.submit` maps cleanly to a real API.** The Compliance API, which currently covers India only, has these calls (S1):
   - `GET …/PhoneNumber/Compliance/Requirements`
   - a multipart `POST …/PhoneNumber/Compliance/` that auto-submits
   - get, list, `PATCH` (allowed only after a rejection), delete, and bulk-link
   - a signed HTTPS status callback

   When buying, pass `compliance_application_id` on `POST …/PhoneNumber/{number}/`. Without it, Plivo auto-selects an application (S2).
4. **`a2p.declare` has no Plivo API for India.** Getting 140 or 160 numbers takes several steps outside any API:
   - registration on the Tata DLT portal (PE and TM)
   - a signed declaration emailed or ticketed to Plivo
   - a NOC from Plivo
   - a Voice Header and Template registered on Tata DLT

   The whole process takes about 5–14 business days. It works only with the Tata DLT operator, and only for a TM entity registered in Mumbai or Karnataka (S9, S10). The only India A2P-adjacent API is the **UCC complaint API** (S11). Plivo's brand-registration APIs are US-only: 10DLC brand and profile for messaging, and Caller Reputation for voice (S22, S23).
5. **`byo.connect` cannot provide an Indian caller ID that you bring yourself.** Verified Caller ID is not supported in India (S6). Porting covers the US and Canada only (S17). A trunk call whose caller ID is not a Plivo number fails with `4190 unknown_caller_id` (S12, S19). What Plivo does support:
   - Zentrunk, its SIP trunking service, between Plivo-rented Indian numbers and *your* SIP stack, but **only if your stack terminates SIP and media in India**. If it does not, calls fail with hangup 4590 or 2070. Vapi is not supported (S7, S12, S13).
   - Inbound-only routing of external numbers through an Incoming Carrier or direct SIP. Whether that works in India is not documented (S18, S20).

---

## 2. India requirements

### 2.1 Eligibility and account
| Requirement | Detail | Source |
|---|---|---|
| Business must be India-registered | Only India-registered businesses can rent Indian numbers, make domestic calls in India, or use India domestic routes. A non-India business must use international routes and shows a US or international caller ID. | S4 |
| India data region org | Indian numbers are available only to India data region organisations. The data region cannot be changed after the org is created. You can create a new India org from the organisation switcher without signing up again. | S3, S7 |
| India region scope | India data region: "Indian phone numbers only, calling within India". "calling is restricted to India". SMS, MMS and RCS are not available, on any plan. | S14, S15 |
| Payment | INR only, Indian credit or debit cards only, GSTIN must be provided, 18% GST, no auto-recharge on INR accounts | S16 |
| Caller ID | Must be a Plivo-rented Indian number. Verified Caller ID is not supported in India. | S4, S6 |
| Media anchoring | Both call legs must originate and terminate in India. Conference participants must all be in India. For SIP trunking, "your orchestration platform must terminate SIP and media on infrastructure in India". | S4, S7 |
| Default capacity (Professional plan) | 2 outbound CPS and 50 concurrent calls, shared by Voice API and SIP trunking. Billed on a 30-second pulse. Enterprise plans start at ₹1,00,000 per month. | S8, S15 |
| CNAM | Not yet available in India | S6 |
| Carrier failover | Not automatic in India. You need a High Availability backup number from a different carrier. It is billed as a second rental, and you enable it in the Console. | S21 |

**UNVERIFIED (account set-up):** the docs contradict each other on how to get an India account.
- The India Calling page says to create two separate Plivo accounts with different email addresses (S4).
- The KYC and Calling-in-India pages say to create a new organisation under the same login (S3, S7).

### 2.2 KYC documents (landline series, 080/022)
| Item | What the docs say | Source |
|---|---|---|
| Accepted documents (KYC guide) | **Any one** of these, each checked against government records: a GST Certificate showing an active GSTIN; a Certificate of Incorporation (COI) from the MCA showing the CIN; or a Udyam Registration Certificate showing a valid Udyam number. Business PAN alone is not accepted. | S3 |
| First application | "must be sealed and signed": signed by an authorised signatory, with a visible company seal. Plivo uses it to fetch your billing address and GST details. | S3 |
| Required set (Compliance API guide, IN/local/business) | Two items: **(1) a Registration Certificate** (COI or Udyam), file plus the data field `business_name`; **(2) a GST Registration Certificate** (Form GST REG-06), file only. The business name must match across both documents and `end_user.name`. Uploading the same file for both slots is rejected. Documents must be valid, unexpired and legible. | S1 |
| Pricing page | Lists "Certificate of Incorporation, GST" for Domestic Numbers | S24 |
| Business type (Console) | Direct Brand, which needs one application, or Reseller, which needs a separate application **per customer** | S3 |
| Review time | For 080/022 numbers, review is automated and usually returns a decision "within 5 minutes". 140 and 160 series have their own SLA. | S3 |
| Common rejection reasons | Registration cancelled, suspended or inactive. Details don't match government records. Document expired. Document not one of the three accepted types. Upload blurry, cropped or incomplete. First application not sealed and signed. | S3 |

**UNVERIFIED (document set):** three sources disagree:
- the KYC guide (S3) asks for any one document;
- the Compliance API guide (S1) asks for two, a Registration Certificate and a GST Certificate;
- the pricing page (S24) names both COI and GST.

The implementation must not hard-code either version. Render whatever `GET …/Compliance/Requirements` returns at run time.

**UNVERIFIED (individuals):** S1 enumerates `user_type=individual`. India eligibility is "India-registered businesses only" (S4), so plan as business-only.

### 2.3 Number series (TRAI rules as Plivo applies them)
| Series | Permitted use | How to get it | Source |
|---|---|---|---|
| Landline (022, 080, etc.) | Non-BFSI service and transactional calls. Promotional content is strictly prohibited. | KYC, then Buy Number (API) | S3, S4 |
| 140 | Promotional voice calls only, with explicit digital consent | Off-API process (see below), about 5–10 business days | S9 |
| 160 | Service and transactional calls for BFSI entities only (regulated by RBI, SEBI, IRDAI or PFRDA) | Off-API process, about 7–14 business days | S10 |
| Mobile / toll-free | Not documented for India. Plivo mobile numbers are offered "in select countries only (UK, Australia)". The India pricing page lists only "Domestic Numbers / Local". | (none) | S6, S24 |

**140 and 160 provisioning steps** (S9, S10):
1. The PE and TM register on the Tata DLT portal.
2. The TM sends Plivo the *Aggregator Telemarketer Declaration*, with PAN, CIN, address, Tata DLT TM ID, signature and seal. For 160, the PE also sends the *BFSI Customer Application Form*. Both go by email to the Account Manager or as a support ticket.
3. Plivo allocates the number and issues one NOC per number.
4. The TM (for 140) or the PE (for 160) registers the Voice Header on Tata DLT, uploading the NOC.
5. The PE approves the header, uploading the GST certificate for 140 or the regulator certificate for 160. Tata takes 1–2 days for 140 and 3–5 days for 160.
6. The PE registers a Voice Template. For 140 the content is fixed as `To promote product related calls from <FULL COMPANY NAME>`.

Constraints on 140 and 160:
- Tata Teleservices is the only DLT operator supported (Airtel, Vi and BSNL are not).
- The TM must be registered in **Mumbai or Karnataka**.
- Calls on 140 and 160 numbers use a separate per-series concurrency pool (S8).
- S9 and S10 say "no separate Plivo KYC is required" for these series.

**UNVERIFIED (140/160 and the Compliance API):** it is unclear whether a 140 or 160 number also needs an `accepted` Compliance API application linked to it. S9 and S10 say no separate KYC is needed. S3 says renting and calling from *any* India number needs an `accepted` application. S11 shows complaints against a `+91160…` number, and UCC enforcement is keyed to a "compliance ID" (S5).

### 2.4 Consent and UCC (applies to everyone)
| Rule | Source |
|---|---|
| Cold calling is prohibited. Commercial calls need explicit digital consent. | S4 |
| TRAI TCCCPR (Third Amendment) Regulations, 2026 define an "A2P call" to include autodiallers, robocalls and AI-generated voice. They also redefine service calls (consent lasts 7 days and is renewable) and transactional calls (within 30 minutes of a customer-initiated transaction). | S4 |
| When a UCC complaint arrives, you have 5 business days to upload opt-in proof. The proof must show the business logo, an opt-in date within the last 6 months, and the complainant's number. The complainant must be removed from your calling list immediately. | S5 |
| Escalation: no proof within 5 days blocks the compliance ID for 15 days. Complaints from 5 or more unique recipients in 10 days suspend it. A second such breach brings **TRAI blacklisting for 1 year with all providers**. A number with no compliance ID counts complaints against the whole billing entity. | S5 |

**UNVERIFIED (legal):** Plivo's docs do not say whether AI or automated *service* calls from **landline-series** numbers need any DLT header or template registration under the 2026 Third Amendment. Plivo describes DLT steps only for 140 and 160. Confirm with Plivo and Indian counsel before launch. This is a legal reading, not something the docs state.

---

## 3. API objects and endpoints

Base URL: `https://api.plivo.com/v1/Account/{auth_id}/`. Auth is HTTP Basic with the Auth ID and Auth Token. Every response carries an `api_id` (S1, S0).

**UNVERIFIED (API host):** no separate India-region API host is documented. Every India example uses `api.plivo.com` (S1, S2, S11).

### 3.0 Superseded: legacy EndUser / ComplianceDocument / ComplianceApplication
Search results still index older pages under `plivo.com/docs/privatebeta/numbers/api/regulatory-compliance/...`, labelled "Latest Legacy". Fetching them on 2026-10-23 returned **HTTP 404**. The current full docs corpus contains no `EndUser/` or `ComplianceDocument/` endpoints (S0). The current docs replace them with the single-call Compliance API: "Instead of creating end users, documents, and compliance applications separately, you can do it all in one API call" (S1). **Do not build against the legacy objects.**

### 3.1 Requirements (discovery)
Source: S1, `https://www.plivo.com/docs/numbers/compliance.md`

| | |
|---|---|
| Method / path | `GET /PhoneNumber/Compliance/Requirements?country_iso=IN&number_type=local&user_type=business` |
| Query (all required) | `country_iso` (string, ISO-2); `number_type` ∈ `local`, `mobile`, `tollfree`; `user_type` ∈ `individual`, `business` |
| Response | `requirement_id` (uuid), `country_iso`, `number_type`, `user_type`, `document_types[]` |
| `document_types[]` | `document_type_id` (uuid, used on create), `name`, `description`, `proof_required` (bool: true means a file is required), `required_fields[]` |
| `required_fields[]` | `field_name` (key into `documents[].data_fields`), `friendly_name`, `help_text`, `field_type` ∈ `string`, `date`, `enum`; `required` (bool), `format` (for example `yyyy-mm-dd`), `enums` (comma-separated string), `min_length`, `max_length` |
| Rate limit | 100 requests per minute |
| Scope | "currently supports India only" |

**UNVERIFIED (requirement versions):** linking requires "Application must use the latest requirement version" (S1), but no version field is documented. Treat a change in `requirement_id` or in `document_types` as a new version. That rule is an inference.

### 3.2 Compliance application (the KYC object)
Source: S1

**Create.** This is `number.kyc.submit`.

| | |
|---|---|
| Method / path | `POST /PhoneNumber/Compliance/` |
| Content type | `multipart/form-data` |
| Body | A form field `data` holding a JSON string, plus file parts `documents[0].file`, `documents[1].file`, … |
| Files | Required when `proof_required=true`. PDF, JPEG or PNG, checked by content type. At most 5 MB per file, and filenames up to 99 characters. |
| `data.country_iso` | string, **required** |
| `data.number_type` | `local`, `mobile` or `tollfree`, **required** |
| `data.alias` | string, **required**, unique per end user, max 99 characters |
| `data.end_user` | object, **required**. `type` (individual or business, **required**), `name` (**required**). Optional: `last_name`, `email`, `address_line1`, `address_line2`, `city`, `state`, `postal_code`, `country`, `registration_number` (for example a CIN). Address fields are flat. |
| `data.documents[]` | **required**. Each entry has `document_type_id` (**required**, uuid from Requirements) and `data_fields` (object keyed by `required_fields[].field_name`). |
| `data.callback_url` | HTTPS only, optional. Status-change webhook signed with V3. |
| `data.callback_method` | `GET` or `POST`, default `POST`. Requires `callback_url`. |
| `data.subaccount` | Auth ID of a subaccount, optional. Call with main-account credentials. |
| Response `201` | `{api_id, compliance_id, message: "Compliance application created and submitted for review."}` |
| Rate limit | 60 compliance operations per minute |

**Get.** `GET /PhoneNumber/Compliance/{compliance_id}`
- `?expand=end_user,documents,linked_numbers` adds nested objects.
- `?subaccount=` scopes the lookup. An empty value means main account only. A subaccount ID that doesn't match returns 404.
- The response wraps everything in `compliance{}`.

**List.** `GET /PhoneNumber/Compliance/`
- Filters: `limit` (max 100, default 20), `offset`, `status`, `country_iso`, `number_type`, `user_type`, `alias`, `expand`, `subaccount`.
- Returns `meta{limit, offset, total_count, next, previous}` and `compliances[]`.

**Update.** `PATCH /PhoneNumber/Compliance/{compliance_id}`, multipart like Create.
- Allowed **only when `status=rejected`**. Any other status returns `compliance_not_editable`.
- `end_user.type` and `subaccount` cannot be changed.
- **The document set is fully replaced**, so every file must be uploaded again.
- The application is resubmitted automatically. The response is `200`, `{message, compliance{… status:"submitted"}}`.

**Delete.** `DELETE /PhoneNumber/Compliance/{compliance_id}` is a soft delete.
- An `expired` application cannot be deleted.
- Deleting an `accepted` application **unlinks its numbers**.
- The response is `200` with `{api_id, compliance_id, message}`.

**Bulk link.** `POST /PhoneNumber/Compliance/Link/`, JSON body.
- Body: `numbers[]` of `{number (E.164), compliance_application_id}`.
- Conditions: the application is `accepted`; the number's country and type match; the application uses the latest requirement version; a subaccount's application links only to that subaccount's numbers.
- The response is `200` with `{total_count, updated_count, report[]{number, status: success|failed, remarks}}`.

**Compliance object fields** (S1)

| Field | Detail |
|---|---|
| Core | `compliance_id`, `alias`, `status`, `country_iso`, `number_type`, `user_type` |
| `subaccount` | Omitted for main-account applications and for deleted subaccounts |
| Callback | `callback_url`, `callback_method` (present only if configured) |
| `rejection_reason` | Only when `status` is `rejected` |
| Timestamps | `created_at`, `updated_at` (ISO 8601) |
| `end_user{}` | `end_user_id`, `type`, `name`, `last_name`, `email`, `address_line1`, `address_line2`, `city`, `state`, `postal_code`, `country`, `registration_number` |
| `documents[]` | `document_id`, `document_type_id`, `document_name`, `file_name`, `meta_information{}`, `download_url` (presigned, expires after 1 hour), `created_at` |
| `linked_numbers[]` | `number`, `number_type` |

**Statuses and transitions** (S1, with Console labels from S3)

| API status | Console label | Meaning | Allowed actions |
|---|---|---|---|
| `draft` | Draft | Saved but not submitted | Get, List, Delete |
| `submitted` | Pending Approval | Under review | Get, List, Delete |
| `accepted` | Approved | Numbers can be linked, rented and used for calls | Get, List, Delete, Bulk Link |
| `rejected` | Rejected | See `rejection_reason` | Get, List, Delete, Update (resubmits automatically) |
| `suspended` | Suspended | Blocked by unresolved UCC complaints (S3, S5) | Get, List, Delete |
| `expired` | Expired | No longer valid. Create a new application and re-link the numbers. | Get, List |

Transitions:
- `POST` moves the application to `submitted`, then to `accepted` or `rejected`.
- `rejected` goes back to `submitted` via `PATCH`.
- `accepted` can become `suspended` after UCC complaints (S5).
- `accepted` can become `expired`. The trigger for expiry is not documented.

**Callback** (S1):
- It fires on status change, for example from `submitted` to `accepted` or `rejected`.
- It uses your `callback_method` and requires HTTPS.
- It carries a Plivo **V3 signature** header.
- It does **not** include `subaccount`. To route per customer, set a separate `callback_url` on each customer's application.

Remaining gaps, all **UNVERIFIED**:
- **Callback payload:** the docs do not list the callback's fields. The handler should treat the callback as a signal only and re-fetch with `GET …/Compliance/{id}`.
- **Drafts:** no API call creates a draft, because Create always submits. `draft` probably comes only from Console-started applications. That is an inference.
- **Business type:** the API `data` JSON has no field for the Console's Direct Brand / Reseller choice (S3). For a reseller, the documented API pattern is one subaccount per customer (S3). How Plivo records the business type for API-filed applications is not documented.
- **Expiry:** what moves an `accepted` application to `expired` is not documented. It may be document expiry, but that is a guess.

### 3.3 Subaccount (for the reseller model)
Source: S25, S3

| | |
|---|---|
| Create | `POST /Subaccount/`, fields `name` (string, **required**) and `enabled` (bool, default `false`) |
| Use | Create one subaccount per customer. File that customer's application with `data.subaccount=<SA auth id>` using main-account credentials, then buy numbers with `subaccount` set to the same ID (S3). |
| Lock-in | An application filed for a subaccount backs only that subaccount's numbers. A linked number cannot move to another subaccount or back to the main account. The only way out is to unrent the number and buy it again, which cannot be undone (S3, S19). |

### 3.4 UCC complaints (closest thing to an India A2P API)
Source: S11, `https://www.plivo.com/docs/numbers/ucc.md`. Available to India data region accounts only.

| Call | Method / path | Notes |
|---|---|---|
| Retrieve | `GET /Ucc/{reference_id}/` | `reference_id` has the form `PUCC-YYYY-NNNNNNNNN`. Returns 404 if not found or if it belongs to another account. |
| List | `GET /Ucc/` | Filters: `status`, `from_number`, `created_at` (plus `__gt`, `__gte`, `__lt`, `__lte`), `limit` (1–20), `offset`. Returns `meta` and `objects[]`. |
| Submit proof | `POST /Ucc/{reference_id}/` | Multipart with a `file` part (**required**): PDF, PNG or JPEG, at most 10 MB. Allowed while the complaint is `pending` or `rejected`. Returns `201` with `{message, reference_id, status:"in_review", opt_in_proof}`. Only file type and size are checked at upload; content is reviewed later. |

- **Complaint object:** `reference_id`, `status`, `from_number`, `to_number`, `initiation_date`, `complaint_category`, `call_uuid`, `opt_in_proof`, `rejection_reason`, `created_at`, `updated_at`.
- **Statuses:** `pending`, then `in_review`, then `accepted` or `rejected`. A `rejected` complaint can be resubmitted.
- **Callbacks:**
  - Delivery: form-encoded POST, V3-signed, one HTTPS URL per account, **configured in the Console only**.
  - `Status` is one of `created`, `proof_submitted`, `rejected` or `accepted`.
  - Parameters: `Endpoint=ucc`, `UCCReferenceID`, `FromNumber`, `ToNumber`, `InitiationDate`, `ComplaintCategory`, `CallUUID`, `RejectionReason` (sent on `rejected` only), `ResourceCreationTime`, `ResourceUpdatedTime`.
  - Retries: 3, at 60, 120 and 240 seconds. Delivery is at-least-once and unordered, so deduplicate on `UCCReferenceID+Status+ResourceUpdatedTime`. Plivo recommends a daily sweep with List.

### 3.5 Zentrunk (SIP trunk) objects, used by `byo.connect`
Sources: S12, S26

| Object | Endpoints | Key fields |
|---|---|---|
| Trunk | `GET`/`POST /Zentrunk/Trunk/`; `GET`/`POST`/`DELETE /Zentrunk/Trunk/{trunk_id}/` | `trunk_direction` (`inbound` or `outbound`, **required**), `name`, `trunk_status` (`enabled` by default), `secure` (SRTP/TLS, default false), `ipacl_uuid` and `credential_uuid` (outbound), `primary_uri_uuid` (**required** for inbound), `fallback_uri_uuid`. Responses include `trunk_id` and `trunk_domain` (`<id>.zt.plivo.com`). Only **inbound** trunks can be attached to numbers. |
| Origination URI | `POST /Zentrunk/URI/` | `uri` (FQDN or IP, **required**), `name`, `authentication_needed` (default false), `username` and `password` (required if auth is on). Returns `uri_uuid`. |
| IP ACL | `POST /Zentrunk/IPAccessControlList/` | `ip_addresses` (array, **required**), `name` |
| Credential | `POST /Zentrunk/Credential/` | `username` (5–20 alphanumeric characters, **required**), `password` (5–20 characters, at least one of `~!@#$%^&*()_+`, **required**), `name` |
| Attach number to trunk | `POST /Number/{number}/` with `app_id=<inbound trunk_id>` | S19 |

**UNVERIFIED (outbound trunk auth):** the Trunks page contradicts itself. Its table marks both `ipacl_uuid` and `credential_uuid` as "Required for outbound trunks", but its prose says "either" and its example uses only `ipacl_uuid` (S12). Assume either one is enough, and test it.

---

## 4. Linking a number to compliance

| Step | Call | Detail | Source |
|---|---|---|---|
| Search | `GET /PhoneNumber/?country_iso=IN&type=local&city=…&services=voice` | Returns `restriction` and `restriction_text`, which describe verification requirements | S2 |
| **Buy** | `POST /PhoneNumber/{number}/` | `compliance_application_id` (uuid of an **accepted** application whose country and type match the number), `subaccount`, `app_id` | S2 |
| Auto-select | (omit `compliance_application_id`) | Plivo picks the most recent matching accepted application. With `subaccount`, it tries that subaccount's applications first, then the main account's. Without it, main account only. It never picks another subaccount's application. | S2, S3 |
| Credentials | (none) | Buy with **main-account credentials**. A subaccount's credentials get `404` even though Search works. | S2 |
| Pending numbers | (none) | "If the number requires verification documents, the number status will be `pending` until documents are approved". Accepting an application activates pending numbers: a subaccount's application activates only that subaccount's numbers. | S2, S3 |
| Re-link (pending number) | `POST /Number/{number}/` with `compliance_application_id` | Works **only while the number is pending activation**. Moving a pending number to a subaccount requires a matching application in the same request. | S19 |
| Re-link (active number) | `POST /PhoneNumber/Compliance/Link/` | Use bulk link for numbers that are already active | S1, S19 |
| Calling | `POST /Call/` from an India number | The number must be rented on your account and its application must be `accepted`. Anything else returns `400` (see section 6). | S27 |

**UNVERIFIED (pending purchases):** S2 says a purchase is refused (`400`) without an accepted application, but it also describes numbers sitting `pending` until documents are approved. The docs do not say how an India number ends up pending at purchase time.

---

## 5. BYO / SIP trunk for India

| Question | Answer from the docs | Source |
|---|---|---|
| Bring your own Indian number as outbound caller ID? | **No.** "Verified Caller ID is not supported. All outbound calls from India must use a Plivo-rented Indian number as the caller ID". Zentrunk: "Plivo numbers are required as caller ID for all outbound calls", otherwise `4190 unknown_caller_id`. | S6, S13, S12b |
| Port an Indian number into Plivo? | **No.** Porting is "available for **US and Canada only**". | S17 |
| Plivo as the SIP trunk to your own India-hosted voice stack? | **Yes.** Use an inbound trunk with an origination URI attached to a rented Indian number, plus an outbound trunk authenticated by IP ACL or credentials. Requirements: India data region; KYC-verified number; your platform terminating SIP and media in India; inbound trunk URI pointed at that India endpoint; a test call with no 4590 hangups. India signalling IPs are `15.207.90.192/31`, `204.89.151.128/27` and `204.89.151.160/27`; ports 5060/5061 for signalling and 10000–30000 for media. | S7, S12, S26, S13b |
| Third-party platforms | LiveKit works with region pinning. ElevenLabs needs an India deployment at `sip.rtc.in.residency.elevenlabs.io`. **Vapi does not work**: it has no SIP termination in India. | S7 |
| Inbound-only routing of a number held at another carrier | Two generic options: DID forwarding to a Plivo number, or direct SIP to `sip:{app_id}@app.plivo.com` secured by IP ACL or digest auth. Alternatively, register an Incoming Carrier (`POST /IncomingCarrier/` with `name` and `ip_set`, both **required**), then add its numbers with `POST /Number/` (`numbers`, `carrier` and `region` **required**; `number_type` and `app_id` optional). | S18, S20 |
| India HA failover on trunk calls | Covers "ZenTrunk domestic India trunk calls". The retried call shows the fallback caller ID. | S21 |
| India trunk rates | Marketing page: Domestic Numbers ₹0.38 per minute inbound and outbound, 30-second pulse; number rental ₹200 per month | S28, S24 |

Gaps for India, all **UNVERIFIED**:
- **Inbound routing:** S18 and S20 never mention India. It is not documented whether an India data region account may register Incoming Carriers or accept direct SIP from a non-Plivo Indian carrier. Media anchoring (S4) would apply to any such call. Indian carriers' DoT licence terms may also forbid forwarding to a VNO. Confirm with Plivo.
- **Domestic CLI:** "Countries with guaranteed domestic CLI" in S13 does not include India. Plivo's India docs still state that the caller ID is the Plivo-rented Indian number (S4).
- **Whitelist lists:** the Technical Specifications IP table (S13) does not list India, but the Quickstart (S26) does. Use the S26 list and confirm it.
- **HA via API:** High Availability is set up in the Console only. No API parameter for it is documented (S21).

---

## 6. Errors and failure reasons

### 6.1 Compliance API (`/PhoneNumber/Compliance/…`), from S1
Errors come back as `{api_id, error}`. HTTP codes: `200` for get, list, update, delete and link; `201` for create; `400` for a validation or state error; then `401`, `403`, `404` and `500`.

| Scenario | Message |
|---|---|
| Missing field | `country_iso is required. Use a two-letter ISO country code (e.g., IN, DE, US).` |
| Not found | `Compliance application 'xxx' not found.` |
| Update when not rejected | `Compliance application must be in 'rejected' status. Current status: 'submitted'.` The update rule is documented as error code `compliance_not_editable`. |
| Deleting an expired application | `Expired compliance applications cannot be deleted.` |
| Bad `expand` | `Invalid expand value. Allowed values: end_user, documents, linked_numbers.` |
| Link: number not on account | `Number not found on your account. Only rented numbers can be linked.` |
| Link: application not accepted | `Compliance application must be in 'accepted' status. Current status: 'submitted'.` |
| Unknown subaccount (404) or own main-account ID on create (400) | `There is no subaccount with auth_id SA…` or `…MA…` |
| Changing `subaccount` on update | `subaccount cannot be changed on a compliance application.` |
| Link: application filed for another subaccount (in `remarks`) | `Compliance application xxx was filed for another sub-account. …` |
| Server or subaccount check failures | `Something went wrong while … Please try again later. If the issue persists, contact support@plivo.com.` |

### 6.2 Buying and updating numbers (S2, S19); all return `400`
| Condition | Message |
|---|---|
| No usable accepted application | `compliance_application_id is required to rent this number. Refer to https://www.plivo.com/docs/numbers/rent-india-numbers for details.` |
| Application not accepted | `Compliance application must be in 'accepted' status. Current status: 'submitted'.` |
| Application filed for another subaccount | `Compliance application xxx was filed for another sub-account. Use one filed for this number's sub-account, or one of the account's own.` |
| Moving a number linked to a subaccount's application | `Number 912212345678 is linked to compliance application xxx, which was filed for its sub-account. …` |
| Linked application could not be checked | `Could not verify the compliance application linked to number 912212345678. Please try again.` |
| Buying with subaccount credentials | `404 not found` |

### 6.3 Placing India calls (Make a Call API, S27, S3, S5, S8)
| Condition | Result |
|---|---|
| `from` number not rented on your account | `400` with `from parameter is invalid. +91… is not associated with your account. Use a phone number rented on your account.` |
| Application not `accepted`, or none attached | `400` with `from number +91… cannot place calls as its compliance application is not in 'accepted' status. …` |
| Application suspended (UCC) | `400` with `from number +91… cannot place calls as its compliance application is 'suspended'. …` |
| 140 or 160 series concurrency limit reached | `403` with `Series Concurrency Limit Breached for 91160` (or `91140`). A call dropped at dial time gets hangup `5030`. |
| Account concurrency limit | `403` from Make a Call; hangup `5030` |

### 6.4 Hangup codes relevant to India
| Code | Name | Meaning | Source |
|---|---|---|---|
| 2070 (Voice API) | `Violates Media Anchoring` | India PSTN regulation violation: the server must be in India. Don't mix PSTN and WebRTC in conferences. | S29 |
| 4590 (Zentrunk) | `domestic_anchored_terms_not_met` | India media anchoring violation | S12b, S7 |
| 4190 (Zentrunk) | `unknown_caller_id` | Caller ID is not a Plivo number | S12b |
| 4200 (Zentrunk) | `dno_caller_id` | Caller ID is on the Do Not Originate list (inbound-only number) | S12b |
| 5180 / 5190 | `cps_limit_reached` / `concurrent_call_limit_exceeded` | SIP trunking rejects the call immediately and does not queue it | S8, S13 |
| 4560 / 4650 | `barred_country` / geo permissions | Country blocked in geo permissions | S12b |

### 6.5 Other failure reasons
- **KYC rejections:** registration inactive; details don't match government records; document expired; wrong document type (for example PAN alone); upload blurry or cropped; first application not sealed and signed (S3). The Compliance API also rejects a business name mismatch across documents, or the same file uploaded for both slots (S1).
- **UCC API:** `400` covers a bad file, or uploading against an `in_review` or `accepted` complaint; then `401`, `404` and `429`. Example message: `Proof cannot be submitted while the complaint is in accepted state.` (S11).
- **Trunks API:** `400` for invalid parameters, `401` for failed authentication, `422` when a required field is missing, such as `ipacl_uuid` on an outbound trunk (S12).
- **140/160 Voice Header rejections (Tata DLT):** incomplete documents; PE/TM mismatch; invalid NOC, GST or regulator certificate (S9, S10).

---

## 7. UNVERIFIED list

1. **Document set for IN/local/business:** the docs disagree between one document (S3), two (S1) and COI plus GST (S24). Drive the form from the live Requirements response.
2. **Document type IDs:** the `document_type_id` values in S1 look like examples. Fetch the real ones at run time; never hard-code them.
3. **Requirement versioning:** "latest requirement version" is a linking condition (S1), but no version field is documented.
4. **Compliance callback payload:** the fields are not documented (S1). Treat the callback as a signal and re-fetch.
5. **Drafts:** no API path creates a `draft`, because Create auto-submits (S1).
6. **Direct Brand / Reseller via API:** no `data` field exists for the Console's business-type choice (S3, S1).
7. **Expiry trigger:** what causes `expired` is not documented.
8. **India mobile and toll-free numbers:** not documented as available (S6, S24), even though the API enum allows `mobile` and `tollfree` (S1).
9. **140/160 and the Compliance API:** unclear whether 140 or 160 numbers need an `accepted` application. "No separate Plivo KYC" (S9, S10) conflicts with "any India number needs accepted" (S3) and with UCC keyed to a compliance ID (S5).
10. **DLT for landline-series AI calls:** whether TRAI's 2026 Third Amendment requires DLT header or template registration for AI or automated service calls on landline-series numbers. Plivo is silent (S4). This needs legal confirmation.
11. **Pending numbers at purchase:** how an India purchase ends up `pending` when an accepted application is required (S2, S3).
12. **India API host:** assumed to be `api.plivo.com`, since no regional host is documented.
13. **India account set-up:** separate account with a new email (S4) versus a new organisation under the same login (S3, S7).
14. **Inbound BYO routing in India:** whether Incoming Carriers or direct SIP from non-Plivo Indian carriers is allowed for India data region accounts (S18, S20 are silent).
15. **Outbound trunk auth:** whether IP ACL *or* credentials is enough (S12 contradicts itself).
16. **India whitelist IPs:** listed in S26 but missing from S13.
17. **HA numbers:** Console only; no API parameter documented (S21).
18. **UCC callback URL:** set in the Console only; no API to configure it (S11).
19. **support.plivo.com articles not read:** `support.plivo.com` now redirects to `help.plivo.com`, a JavaScript-only Pylon app whose text could not be extracted. `old-support.plivo.com` articles, for example "Requirements for Sending SMS and Calls to India" (`/hc/en-us/articles/45875255505305`), returned **403** behind a Cloudflare challenge. Nothing in these notes depends on support articles.
20. **Rates:** taken from marketing pages (S24, S28), not from any API or contract. Search-engine snippets quoted a different trunk rate (₹0.60 per minute) than the live page (₹0.38 per minute). The live page is used here.
21. **India review time:** "typically within 5 minutes" for 080/022 (S3) is the only figure in the current docs. No SLA is given for manual review or escalation.

---

## 8. Sources (all read 2026-10-23)

`dateModified` comes from each page's HTML JSON-LD. It may reflect a site rebuild rather than an edit to the content. "n/a" means the page had no such field.

| Key | URL | `dateModified` |
|---|---|---|
| S0 | https://www.plivo.com/docs/llms-full.txt (full docs corpus) and https://www.plivo.com/docs/llms.txt | n/a |
| S1 | https://www.plivo.com/docs/numbers/compliance.md (Compliance API). `/docs/numbers/regulatory-compliance.md` returns 307 to this page. | 2026-10-21 |
| S2 | https://www.plivo.com/docs/numbers/phone-numbers.md (search and buy) | 2026-10-21 |
| S3 | https://www.plivo.com/docs/numbers/rent-india-numbers.md (India Number KYC) | 2026-10-21 |
| S4 | https://www.plivo.com/docs/voice/concepts/india-calling.md (India Calling Regulations) | 2026-09-23 |
| S5 | https://www.plivo.com/docs/voice/concepts/ucc-management.md | 2026-09-15 |
| S6 | https://www.plivo.com/docs/numbers.md (Numbers overview: availability, CNAM, Verified Caller ID) | 2026-09-15 |
| S7 | https://www.plivo.com/docs/voice-agents/sip-trunking/deploy/calling-in-india.md | 2026-07-17 |
| S8 | https://www.plivo.com/docs/voice/concepts/account-limits.md | 2026-09-29 |
| S9 | https://www.plivo.com/docs/voice/concepts/140-series-provisioning.md | 2026-09-15 |
| S10 | https://www.plivo.com/docs/voice/concepts/160-series-provisioning.md | 2026-09-15 |
| S11 | https://www.plivo.com/docs/numbers/ucc.md (UCC API) | 2026-09-15 |
| S12 | https://www.plivo.com/docs/sip-trunking/api/trunks.md | 2026-07-15 |
| S12b | https://www.plivo.com/docs/sip-trunking/troubleshooting/zentrunk-hangup-codes.md, plus https://www.plivo.com/docs/voice-agents/sip-trunking/troubleshooting/hangup-codes.md (2026-07-28) | 2026-09-29 |
| S13 | https://www.plivo.com/docs/sip-trunking/concepts/technical-specifications.md | 2026-09-29 |
| S13b | https://www.plivo.com/docs/voice-agents/sip-trunking/integration-guides/other-platforms.md | not captured |
| S14 | https://plivo.com/docs/faq/account/account-management (section "What is Data Region?", read from S0) | not captured |
| S15 | https://www.plivo.com/docs/faq/account/plans.md | 2026-09-10 |
| S16 | https://www.plivo.com/docs/faq/billing-and-invoices/payments.md | 2026-09-10 |
| S17 | https://www.plivo.com/docs/numbers/number-porting.md | 2026-09-15 |
| S18 | https://www.plivo.com/docs/numbers/incoming-carriers.md (Incoming Carriers API) | n/a |
| S19 | https://www.plivo.com/docs/numbers/account-phone-numbers.md | 2026-10-21 |
| S20 | https://www.plivo.com/docs/voice/use-cases/connect-external-numbers.md | 2026-04-27 |
| S21 | https://www.plivo.com/docs/voice/concepts/carrier-failover.md | 2026-09-15 |
| S22 | https://plivo.com/docs/messaging/api/10dlc/brand and https://plivo.com/docs/messaging/api/10dlc/profile (US 10DLC; `POST /10dlc/Brand/`, `/Profile/`; read from S0) | not captured |
| S23 | https://plivo.com/docs/voice/concepts/caller-reputation (US-only beta; read from S0) | not captured |
| S24 | https://www.plivo.com/virtual-phone-numbers/pricing/in/ (marketing pricing page) | n/a |
| S25 | https://www.plivo.com/docs/account/api/subaccount.md | not captured |
| S26 | https://www.plivo.com/docs/sip-trunking.md (Zentrunk quickstart, India IPs); Zentrunk URI, IP ACL and Credential API pages read from S0 (`/docs/sip-trunking/api/origination-uris`, `/ip-access-control-lists`, `/credentials`) | 2026-09-29 |
| S27 | https://plivo.com/docs/voice/api/calls (section "India Compliance Errors", read from S0) | 2026-09-10 |
| S28 | https://www.plivo.com/sip-trunking/coverage/in/ (marketing coverage page) | n/a |
| S29 | https://www.plivo.com/docs/voice/troubleshooting/hangup-causes.md | 2026-09-29 |
| (x) | https://plivo.com/docs/cli/apis/numbers.md (CLI: `plivo numbers compliance create/get/list/update/delete/link/requirements`; confirms "In India a number can only be rented (and used for calls) once a compliance application is `accepted`") | 2026-09-03 |
| (dead) | https://plivo.com/docs/privatebeta/numbers/api/regulatory-compliance/create-compliance-application and sibling pages: **404** on 2026-10-23 | n/a |
| (blocked) | https://old-support.plivo.com/hc/en-us/articles/45875255505305-Requirements-for-Sending-SMS-and-Calls-to-India: **403** (Cloudflare). https://support.plivo.com/ redirects to help.plivo.com, which is JavaScript-only. | n/a |
