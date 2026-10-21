# Review: who gets called (2026-10-21)

**Scope:** the dial gate G1-G12 and the worker, windows, the retry ladder and the review stop; intake (consent,
suppression, tombstones, erasure, merge, DND, imports, the CRM webhook); `memory/minor.ts`; `server/identity.ts`.

**Method:**
- A throwaway Postgres 16 (`vp_review_gate`), migrated with `scripts/migrate.mjs`.
- Each finding has a test in `who-gets-called.test.ts`. The test asserts the safe behaviour, fails on today's code
  (commit bd7d8dd), and is marked `todo` with the finding id.
- A control test, a consented promotional contact with a fresh DND answer that the gate allows, passes. So each
  refusal the tests expect is the only thing missing.
- Run it with `node --import tsx --test tests/review/who-gets-called.test.ts`, with `DATABASE_URL` set.
- **Verified:** 9 of 9 findings reproduce. Each was run once on this database, through the real gate (`runGate` in a
  transaction, as `claimNext` runs it) or the real tool bodies.
- **Not verified:** anything that needs a live carrier, the runtime, or the calls module's own webhook.

**Note:** `scripts/test.mjs` runs only `tests/*.test.ts`, not `tests/review/`. CI therefore does not run this file.
That is harmless while the tests are `todo`, but the file has to be listed or moved before they are expected to pass.

**Status (2026-10-21):** WGC-01 to WGC-08 are fixed in the campaigns gate. Their tests run as normal tests in
`tests/campaigns-review.test.ts`. WGC-09 (intake and memory) is still open here.

## Counts

| Severity | Count | Findings |
|---|---|---|
| Blocker | 2 | WGC-01, WGC-03 |
| Major | 5 | WGC-02, WGC-04, WGC-05, WGC-06, WGC-09 |
| Minor | 2 | WGC-07, WGC-08 |

## Findings

### WGC-01 (blocker): an NCPR "unknown" answer passes G5 as "not registered"

- **Where:** `server/modules/campaigns/gate.ts:206-207`.
- **How it fails:**
  1. The production DND provider is `DisabledDndProvider`, and it answers `unknown`.
  2. `contact.dnd_refresh` stores `ncpr_status='unknown'` with `checked_at=now()`.
  3. G5 refuses only when the status or `checked_at` is missing, then blocks only the statuses in `DND_REGISTERED`.
     `unknown` is not in that list, so the call is allowed.
  4. One DND refresh therefore makes every consented promotional row dialable, DND-registered numbers included. That
     contradicts `dnd.ts` ("unknown … fail-closed for promotional").
- **Test:** `WGC-01 G5 dials a promotional number whose NCPR status is "unknown" once a lookup has stamped checked_at`.
- **Fix:** allow only an explicit `not_registered` (an allow-list). Every other value, including `unknown`, is refused
  with `no_basis`.

### WGC-02 (major): a stale NCPR answer is accepted forever

- **Where:** `gate.ts:205-207`. Compare `intake/contacts.ts:19`, `DND_FRESH_S = 7 days`.
- **How it fails:**
  1. G5 needs only a non-null `checked_at`.
  2. A `not_registered` answer from 60 days ago passes.
  3. Intake's own `dialFacts` treats anything older than 7 days as unknown, so the gate and the contact page disagree.
- **Test:** `WGC-02 G5 accepts a "not registered" NCPR answer of any age for a promotional call`.
- **Fix:** in G5, if `now - checked_at > DND_FRESH_S`, refuse with `no_basis` ("DND lookup stale"). Share the constant
  with intake.

### WGC-03 (blocker): a later purpose-specific withdrawal is overridden by an older general grant

- **Where:** `gate.ts:188-201`.
- **How it fails:**
  1. G5 reads the latest record per purpose, and treats only a withdrawal of `all`, `voice` or `any` as global.
  2. Take a person with `all` granted in September who withdraws `promotional` in October (`consent.record`,
     `basis: withdrawal`).
  3. The `all` grant still counts as `fit` for promotional calls, so the call is allowed.
  4. The same pattern lets an older `all` grant beat a newer `service` withdrawal for service calls.
- **Test:** `WGC-03 a later purpose-specific withdrawal ("promotional", granted=false) is overridden by an older "all" grant`.
- **Fix:** for the call's category, collect the purposes that cover it (the category's own purpose plus `all`, `voice`
  and `any`). If the newest record across that set is a withdrawal, refuse. A grant counts only if no withdrawal for a
  covering purpose is newer than it.

### WGC-04 (major): the window is read only in the imported `contact.timezone`, so a +91 number can be rung at 02:30 IST

- **Where:**
  - `gate.ts:135` and `gate.ts:210-217`;
  - `windows.ts` `eligibility`;
  - `intake/store.ts` mirrors any `timezone` column onto `contact.timezone`.
- **How it fails:**
  1. Quiet hours (22:00-07:00, called "absolute") and the promotional band are evaluated only in the contact's zone.
  2. A CSV or CRM row with `timezone = America/New_York` on an Indian mobile is enough.
  3. At Tue 02:30 IST (Mon 17:00 in New York) the gate allows a service call. With the same data, a promotional call
     is allowed from about 19:30 to 06:30 IST.
- **Test:** `WGC-04 a +91 number is dialled at 02:30 IST because the window is read only in the contact's imported time zone`.
- **Fix:**
  - For every +91 destination, also intersect with the IST quiet hours and the IST promotional band. The TRAI rule is
    IST.
  - Honour a foreign zone only to narrow further, never to move the window outside IST.
  - Optionally refuse to mirror a non-Indian zone onto a +91 contact without an explicit field.

### WGC-05 (major): an unparseable consent expiry never expires

- **Where:** `gate.ts:192-196`.
- **How it fails:**
  1. `new Date('31/12/2025')` is `Invalid Date`.
  2. `NaN <= now` is false, so the record is never expired.
  3. `consent.record` takes free-form evidence, and DD/MM/YYYY is the natural Indian way to write a date. A consent
     that ran out in 2025 still allows a promotional call in October 2026. The check fails open.
- **Test:** `WGC-05 a consent expiry written the Indian way (DD/MM/YYYY) never expires`.
- **Fix:**
  - Treat an `expiresAt` that is present but unparseable as expired, with `consent_expired` and the detail
    "unreadable expiry".
  - Validate and normalise `expiresAt` to ISO in `consent.record`, the import and the webhook.

### WGC-06 (major): re-importing an old "consent = yes" file undoes a newer withdrawal

- **Where:**
  - `gate.ts:188` orders by `created_at`;
  - `intake/store.ts:175` appends the consent with `evidence.statedAt`.
- **How it fails:**
  1. The person withdraws `all` through `consent.record`, and the gate then refuses with `no_basis`.
  2. The business re-uploads last year's list: consent yes, `consent_at 2025-06-01`.
  3. The new grant row is newer by insert time, so G5 allows the call again.
  4. The grant was given long before the withdrawal. Only a suppression survives a re-import; a consent withdrawal
     does not.
- **Test:** `WGC-06 a newer withdrawal is undone by re-importing an older file that says consent=yes`.
- **Fix:**
  - Order consent by its effective time, `coalesce(evidence.statedAt, created_at)`.
  - In addition, never let a grant with an effective time before the latest withdrawal re-open the person.
  - In the import, report such rows as `consent_older_than_withdrawal`.

### WGC-07 (minor): the gate never reads `contact.erased_at`; the husk's `erased:<uuid>` can parse as a real number

- **Where:** `gate.ts:153-158` (G2 normalises `contact.e164`); `intake/contacts.ts:392`.
- **How it fails:**
  1. Erasure sets `e164 = 'erased:' || id` and leaves queued attempts and consent rows in place.
  2. With `suppress:false`, no suppression references the contact.
  3. G2 strips the non-digits of the husk. A UUID whose decimal digits form a dialable run normalises to a stranger's
     +91 number (in the test, `…-9000000099ab` gives +919000000099).
  4. G3 hashes that stranger's number, so the tombstone does not match. G5 finds the kept consent, and the call is
     allowed. Rare (roughly 1 in 5,000 UUIDs) and it needs `suppress:false`, but the gate has no erased check at all.
- **Test:** `WGC-07 an erased person (suppress:false) is still dialled: the gate never reads contact.erased_at and dials
  the husk's "number"`.
- **Fix:**
  - G2 (or G3) refuses `erased` whenever `contact.erased_at IS NOT NULL` or `e164` does not start with `+`.
  - The erasure cancels the person's `created` attempts.

### WGC-08 (minor): the concurrency cap overshoots while a dial of unknown outcome is in fact live

- **Where:** `gate.ts:113` (`LIVE_ATTEMPT`); `worker.ts:225` and `worker.ts:254` set `status='unknown'`.
- **How it fails:**
  1. When the runtime's start call times out, dispatch marks the attempt `unknown` ("the request may have left"), and
     its conversation stays `live`.
  2. G12 counts only `dialing`, `ringing` and `connected`.
  3. With `concurrency = 1`, a second call is allowed while the first may be ringing.
- **Test:** `WGC-08 G12 does not count a dial whose start was never confirmed (status unknown) while its call is live`.
- **Fix:** include `unknown` in `LIVE_ATTEMPT` while its conversation is `live`. The conversation predicate already
  frees the line once it ends.

### WGC-09 (major): "Year of Birth", "Birth Year" and "Age Group" columns read as no age data, so memory runs for children

- **Where:** `intake/mapping.ts:58-60` (`AGE_KEY_SYNONYMS`); `memory/minor.ts:8-9`.
- **How it fails:**
  1. `attrKey('Year of Birth')` gives `year_of_birth`, which is not canonicalised and does not match `DOB`.
  2. `minorStatus` therefore returns `unknown`, and both `memory.brief` and extraction proceed. They stop only on
     `minor` or `unclear`.
  3. A 14-year-old with `Year of Birth = 2012`, or with `Age Group = 13-17`, is remembered.
- **Test:** `WGC-09 the children's-data gate reads "Year of Birth" / "Age Group" columns as no age data at all`.
- **Fix:**
  - Add the pairs `year,of,birth`, `birth,year`, `yob` and `age,group`/`age,band` (and Hindi equivalents) to
    `AGE_KEY_SYNONYMS`.
  - Let `minorStatus` read a bare year (as `ageFrom` already does) and ranges.
  - Have minor.ts import the synonym list from intake, so there is one list.
  - Consider treating any unrecognised key containing `birth`, `dob` or `age` as `unclear`.

## Discarded (could not reproduce, or safe by construction)

- **Double dial:** `claimNext` takes the row `FOR UPDATE SKIP LOCKED`, stamps `created→dialing` under the
  `status='created'` guard, and G2 serialises per number with an advisory lock. Already covered by `campaigns.test.ts`.
- **Review-stop overshoot:** the count runs under a per-campaign advisory lock in the claim transaction. The other
  claimer waits and then sees the committed dial.
- **A held reservation leaking on refusal:** G9 holds, and any later refusal releases it inside the gate. A rollback
  also removes the hold.
- **An opt-out said mid-call not sticking:**
  - `call_opt_out` is flushed in the same hook request.
  - Until then, G7's 120-minute gap blocks the same number on every path, because the live call's attempt has
    `dialed_at`.
  - There is no realistic trigger for the `failed` flush path; when the contact has been erased, a tombstone covers it.
- **Merge:** consent, suppression and attempts move to the kept record by foreign key; internal DND carries over; a
  re-import of the merged number resolves to the kept record through `contact_identifier`. A merge that drops internal
  DND needs a kept contact with no `dnd_status` row, and every intake-created contact gets one.
- **Number formatting** (+91, 0, 91, spaces, Devanagari digits): the gate, `addSuppression`, the import and the
  erasure all normalise through `normaliseIndianPhone`. No mismatch found.
- **Workspace salt:** tombstones are per workspace by design. G3 checks the salted HMAC and both legacy shapes.
- **The retry ladder bypassing G7:** every retry is a new attempt through the full gate. Retries that do not count
  toward the budget (`provider_error`, `switched_off`) are excluded from the gap and the ceilings by design.
- **Future-scheduled dials and G7:** G7 counts only attempts that were dialled, so a scheduled dial cannot consume or
  dodge the cap.
- **`test.ring_member_phone`:** it rings only a `verified_test_phone` of the workspace. An API-key actor may pick any
  member's verified phone (a colleague, not a customer), so this is not a stranger-dial path.
- **Tenancy:** every gate query is scoped by `workspace_id`, or keyed by an id already loaded under it. The
  review-stop count is keyed by a unique campaign id.
