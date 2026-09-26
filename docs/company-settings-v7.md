# Company settings v7

The Company workspace adds one owner-controlled `platform:company_profile` record without changing the existing organization or authentication model. The organization name remains the workspace name authority. Each save changes `organizations.name`, the profile record, and an audit event in one database transaction guarded by the exact current owner-membership bytes and a profile compare-and-set revision. A concurrent edit, demotion, or removal rolls the entire change back.

The profile records the workspace name, explicit public display name, optional HTTPS website, founder-authored description, industry, country, IANA timezone, one to eight languages, brand accent, and an optional raster logo. India, `Asia/Kolkata`, English, and Hindi are first-creation defaults for this product configuration; they are shown as editable defaults rather than inferred facts about every company. Existing organization names seed both name fields when no profile has been saved.

Founder descriptions remain unreviewed profile text. Saving settings does not add a fact to Company brain. The separate **Add to Company brain** action creates an attributed `draft` brain source for the exact saved profile revision. The existing Company brain review remains responsible for approval before an agent can use it.

Logos are stored as bounded data URIs in the tenant profile because this slice introduces no blob infrastructure. The server accepts only PNG, JPEG, or WebP data URIs with matching raster magic, valid dimensions from 16 through 2,048 pixels, and at most 256 KB of decoded bytes. SVG, remote URLs, embedded credentials, and arbitrary fetches are excluded. The authenticated company endpoint returns the profile; there is no public profile endpoint. A public deployment can expose only an explicit copied brand snapshot. `exportPublicBrand` contains the public display name, accent, contrast-safe foreground, optional sanitized logo, fallback color metadata, and an unverified-profile marker. It omits the private description, preferences, website, and user data.

The startup checklist reads persisted tenant records only:

- identity completeness from the current company profile;
- checked connector records from `integration:vault`, without opening or returning ciphertext or environment values;
- approved `platform:offering` records;
- active `platform:release` records;
- published `platform:agent_deployment` records.

These states describe saved evidence. They do not prove credentials remain valid, provider balance exists, speech works, a deployment is reachable, or production launch is approved. Missing records link operators to the existing Company brain, Integrations, Releases, and deployment workspaces.

`GET /api/company` is available to active members and reports the caller's current role. `PUT /api/company` and `POST /api/company` are same-origin authenticated mutations; profile saves and brain-draft creation require a current owner. Viewers and operators receive the same readable profile with disabled settings controls.

Scoped verification lives in `tests/company-settings.test.ts` and `tests/company-settings-logo.test.ts`. It covers creation defaults, organization/profile source consistency, validation, stale revisions, simultaneous saves, owner-only access, demotion and removal during fenced transactions, explicit draft creation, safe readiness output, route boundaries, logo formats and public-brand field minimization.
