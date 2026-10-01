# Relay product usability audit — Assessment A

**Date:** 1 October 2026  
**Method:** unanchored design assessment from the running authenticated fictional workspace at `http://localhost:3000`, plus source and handler tracing. No detector findings were read or included.  
**Scope:** shell/navigation, Command centre, Company, Company brain, Agents, Test lab, Releases, Deployments, Campaigns and Conversations.  
**Product reading:** Relay is a general company brain + AI representative + campaign operations workspace for Indian founders and teams. Study abroad is one initial configuration, not the information architecture.

## Verdict

The visual system is coherent and the individual controls are often careful. The product is still very hard to use because it exposes its implementation objects as the navigation model. A founder must infer two different workflows, remember prerequisites across 18 global destinations, and translate `draft → version → test run → release → deployment` before reaching a customer. Campaign work then begins a second, separately modelled chain of `brief proposal → plan → campaign draft → preflight → run → conversation → analysis`. Relay has built many strong records, but it has not yet composed them into one comprehensible operating experience.

The highest-impact next pass is **app shell + Home**, not another isolated editor polish pass. Home should derive one real next action from existing readiness and record contracts, show active work and review queues, and teach the company → knowledge → representative → campaign → conversation → learning loop. The shell should expose that same loop while preserving every existing hash destination and backend action.

## Design health

| # | Nielsen heuristic | Score | Main finding |
|---|---|---:|---|
| 1 | Visibility of system status | 2/4 | Record states are explicit inside detail screens, but Home says `0 needing review` and `No open decisions` when Company reports 0/5 readiness. |
| 2 | Match with the real world | 2/4 | Founder tasks are translated into product-internal nouns such as version, configuration check, release, deployment and plan application. |
| 3 | User control and freedom | 3/4 | Drafts, pause/stop, preflight and review gates are strong; local modes/tabs are not URL state and there is little recovery from choosing the wrong branch. |
| 4 | Consistency and standards | 2/4 | Visual patterns are consistent, but the same lifecycle has multiple competing entry points and labels: Test call, Test lab, version checks, release, deployment. |
| 5 | Error prevention | 3/4 | Consent, source authority, immutable snapshots and owner publication gates are unusually careful. Prerequisites are often discovered only after entering another page. |
| 6 | Recognition rather than recall | 1/4 | Users must remember what they did on several screens, which artifact is current, and where the next gate lives. |
| 7 | Flexibility and efficiency | 1/4 | Search covers only a subset of records; most navigation is buttons; deep state, recent work, cross-object commands and bulk paths are thin. |
| 8 | Aesthetic and minimalist design | 2/4 | Quiet styling and panels help, but the shell is crowded and the Agents workbench presents library, editor and call studio at once. |
| 9 | Error recognition and recovery | 2/4 | Server errors are generally honest, but the global banner can be far from the initiating field and many blocked states only send the user elsewhere. |
| 10 | Help and documentation | 1/4 | There is abundant defensive copy, but no task-led onboarding, product map, or contextual explanation of how artifacts relate. |
| **Total** |  | **19/40 — Poor** | **Major structural redesign is required; surface polish will not fix task completion.** |

### Cognitive load

Six of eight checks fail.

- **Single focus — fail.** Home shows a five-stage company flow, a decision queue, useful checks and a separate five-stage voice preparation flow. Agents simultaneously shows an agent library, a multi-section editor and a complete call studio.
- **Chunking — fail.** The shell exposes 18 destinations in four groups. Build alone exposes six peer destinations even though four are one agent lifecycle.
- **Grouping — pass.** Related controls are usually placed in named panels and fieldsets.
- **Visual hierarchy — pass.** Page titles, panels, muted explanations and indigo primary actions are consistent.
- **One thing at a time — fail.** Creating, configuring, versioning and live-testing coexist in Agents; campaign planning and campaign management are separate local modes under one destination.
- **Minimal choices — fail.** The persistent navigation exceeds working-memory limits before page actions are considered.
- **Working memory — fail.** The user must remember source approval, offering state, agent revision/version state, passing check, active release, channel consent and audience state across screens.
- **Progressive disclosure — fail at product level.** Deployment itself has a good three-step wizard, but the overall product reveals the entire object catalogue while hiding the dependency path.

## What is working

1. **Operational honesty is product-specific and valuable.** Deployment copy distinguishes draft, registry publication, provider activation and public runtime. Conversations distinguish anonymous/unverified participants, source timestamps and provider acceptance. These are not generic dashboard decorations; they reflect real authority boundaries.
2. **The underlying contracts support a much better UX.** Agent versions, passing checks, active releases, source digests, campaign preflight, consent and immutable run/deployment snapshots already exist. The redesign can compose existing records rather than weaken them.
3. **Interaction craft is stronger than the information architecture.** Labels are generally explicit, tabs have keyboard behavior, viewer states are read-only, forms retain drafts, and the deployment wizard focuses each step. The app can reuse these patterns.

## Current completion path and where it breaks

The product-intended path is:

`create workspace → describe company → ingest/review sources → approve offering → create representative → capture version → run checks → publish release → create campaign/deployment → converse → review evidence/learning`

The current UI does not present this as one path:

1. Registration collects only company name and credentials, then opens the generic workspace (`app/page.tsx:138-142`). There is no first-run state or handoff to Company.
2. Home presents a company flow that starts with systems/sources and omits Company identity, Agents, Test lab, Releases and Deployments (`components/company-operating-flow.tsx:13-20`). It then presents a second voice-agent sequence that omits Company identity, offerings, campaigns and learning (`components/platform/command-view.tsx:34-36`).
3. Company contains the actual readiness model and shows the observed workspace at 0/5, but it is the last navigation group and below the initial sidebar viewport (`components/platform/company-view.tsx:73-120`; navigation order at `app/page.tsx:28-33`).
4. Company brain has Business model, Source intake and Ask tabs, but tab/mode is component state rather than durable route state (`components/platform/brain-view.tsx:10-20,34-46`).
5. Agents combines configuration, version capture and a draft voice call in one large three-pane workbench (`components/platform/agents-view.tsx:73-116`).
6. Test lab separately runs deterministic checks against a captured version (`components/platform/tests-view.tsx:7-19`).
7. Releases repeats the version/check selection and publishes the passing version (`components/platform/releases-view.tsx:7-24`).
8. Deployments adds a second publication concept around the active release, public subset, brand, origins and limits (`components/platform/deployments-view.tsx:322-439,456-483`). The internal wizard is good; its relationship to Release is not explained globally.
9. Campaigns adds three local modes plus a duplicate `New campaign` action (`components/platform/campaigns-view.tsx:20-24,50-54,68-78`). AI planning creates a plan record, then `Apply to campaign draft` creates/opens another record (`components/campaign-planner.tsx:139-147,173-187`).
10. Conversations contains both the saved-conversation review surface and another browser studio entry point (`components/platform/conversations-view.tsx:50-55,105-112`), while Agents and active campaign runs can also host voice studios.

An experienced operator can eventually build a mental map. A first-time founder cannot see why these nouns exist, which one is current, or what action advances the business goal.

## Priority structural issues

### P0 — Home reports “nothing to do” in an incomplete workspace

**Evidence.** In the live fictional workspace, Command centre displayed `0 needing review` and `No open decisions`. Company displayed 0/5 readiness: missing identity, systems, offering, release and deployment. Command centre only counts pending follow-ups, failed tests, open commitments, paused runs and pending memories (`components/platform/command-view.tsx:11-25`). It does not count missing foundational readiness. Company already derives the missing prerequisites on the server (`lib/company/service.ts:35-49`).

**Failure.** “No decisions” is interpreted as completion. The only strong Home action is `Connect a company system`, even though company identity and approved knowledge are missing. A founder is sent to credentials before understanding the product.

**Implementable fix.** Fetch or include the existing `CompanySettingsSnapshot.readiness` on Home. Replace the two competing process diagrams with one readiness-aware “Next best action” card. Missing company identity should be first; then source intake/offering; then agent/version/check/release; then audience/campaign. Keep the review queue separate and label zero as “No reviews waiting,” never “nothing to do.”

### P1 — The shell is an implementation catalogue, not a company operating model

**Evidence.** The persistent rail exposes 18 peer destinations (`app/page.tsx:28-34`). At the inspected desktop viewport, the rail has its own scroll and foundational Company/Team/Account destinations are below the initial view. Search returns sections, contacts and only five record kinds; it omits versions, tests, releases, deployments, plans, runs, sources and sessions (`app/page.tsx:116-120`). Navigation buttons update a `section/id` hash (`app/page.tsx:45-47,103-104`) but are not normal links.

**Failure.** Users learn the database taxonomy before learning the product. Closely related lifecycle gates appear as unrelated peers. Sidebar scrolling hides context and creates an “everything is equally important” signal.

**Implementable fix.** Keep every current hash as a backward-compatible destination, but change the visible hierarchy to the user’s loop:

- **Home**
- **Company**: Profile, Brain, Customers, Integrations
- **Representatives**: Agents, Checks, Releases, Deployments
- **Campaigns**: Campaigns, Automations, Inbox
- **Learn**: Conversations, Quality, Commitments, GroupAI

Use real anchor links pointing to the same encoded hashes so open-in-new-tab, copy link and browser history work. Expand the current group and collapse inactive groups; persist no sensitive state. Search should return every major artifact with status and owning destination.

### P1 — One representative has four lifecycles and three test entry points

**Evidence.** Agents includes a draft call tester and version capture (`components/platform/agents-view.tsx:71-79,111-116`). Test lab runs configuration checks (`components/platform/tests-view.tsx:16-19`). Releases selects the same agent/version and sends users back to Test lab when a passing run is absent (`components/platform/releases-view.tsx:22-24`). Deployments repeats prerequisites before its own three-step flow (`components/platform/deployments-view.tsx:322-332,427-439`). Conversations exposes another released-agent browser studio (`components/platform/conversations-view.tsx:68-72,105-107`).

**Failure.** The UI does not answer: “Is my representative ready to use?” A user must translate draft revision, captured version, passing configuration run, active browser release and public deployment, and decide whether “test” means a real conversation or deterministic validation.

**Implementable fix.** Do not merge the records. Add a persistent lifecycle header to the Agent detail: **Draft → Conversation test → Version → Checks → Release → Deployment**. Each step should show current status, the exact artifact it refers to, and one action. Reuse the current views under contextual subtabs or panels; keep legacy `#Agents`, `#Test%20lab`, `#Releases` and `#Deployments` hashes as aliases. Rename Test lab to **Release checks** in visible copy and reserve **Test conversation** for the voice studio.

### P1 — Campaign planning and campaign operation feel like different products

**Evidence.** Campaigns has header `New campaign` plus modes Manage / Plan with AI / Write manually (`components/platform/campaigns-view.tsx:68-70`). The default mode depends on whether any campaign exists (`:20`). Modes, selected plan and draft branch are local React state and are only partly represented in the hash (`:20-24,50-54`). The planner asks for offering, goal, audience, signals, outcome, evidence and result fields before creating a plan; applying the plan creates a campaign draft (`components/campaign-planner.tsx:21-50,139-147,151-187`). The manage view then adds release, preflight, launch, run, recipient result and conversation linking (`components/platform/campaigns-view.tsx:73-78`).

**Failure.** Users cannot form one stable campaign object. `New campaign`, `Plan with AI`, `Write manually`, `Generate campaign plan` and `Apply to campaign draft` appear to be five different creation operations. Reload/back navigation can return to a different local mode.

**Implementable fix.** Present one Campaign workspace with durable phases: **Intent → Audience → Representative & content → Review → Run → Results**. AI/manual are assistance choices inside Intent, not sibling product modes. A plan remains an attributable proposal behind the campaign; `Apply to campaign draft` becomes `Create campaign from this plan`. Persist phase in a compatible hash suffix/query while continuing to resolve old `#Campaigns/<id>` links. Keep the existing preflight, consent and immutable run snapshot as the Review/Launch gate.

### P1 — Save, preview, release and public snapshot semantics are individually correct but collectively opaque

**Evidence.** Company brand is explicitly a preview and must be copied into a deployment snapshot (`components/platform/company-view.tsx:102-117`). Agent Save updates a mutable draft; Capture version creates an immutable version (`components/platform/agents-view.tsx:60-71,111-115`; server immutability in `lib/platform/agents.ts:138-164`). Release binds a passing check and revalidates source digests (`lib/platform/agents.ts:166-181`). Deployment copies selected brand/knowledge into a separate immutable owner-controlled public boundary (`components/platform/deployments-view.tsx:357-368,428-439`; `lib/deployments/engine.ts:80-97,101-143`).

**Failure.** The system protects users technically but asks them to understand distributed-systems vocabulary. “Saved to your workspace” in the global footer (`app/page.tsx:133`) can also be read as all page edits being saved when many editors have explicit unsaved state.

**Implementable fix.** Add a shared artifact lineage component used by Company, Agent and Deployment: `Company profile r3 → approved sources → Agent draft r5 → Version 2 → passing check → active release → Deployment r1`. Label mutable vs frozen at each node and show “Changes here do/do not affect what is live.” Change the global footer to “Workspace data loaded · refreshed …”; let each editor own its Save state. Do not add an all-purpose publish action.

## Backend and authority contracts the redesign must keep

The redesign should compose existing actions, not invent a client-side shortcut around them.

- `requireUser` attaches active membership, blocks unverified email access, rejects viewer mutations and restricts Integrations to owners (`lib/server/auth.ts:38-46`). UI hiding is secondary to these server checks.
- All platform records are tenant-scoped by `organizationId`, including get/list/update predicates (`lib/platform/records.ts:13-21,33-47`). Deep links must never look up a record outside this scope.
- Company profile mutations acquire an owner membership fence and use optimistic revision checks (`lib/company/service.ts:57-70`). “Next action” may navigate or prefill, but must not auto-save profile text or auto-approve its brain draft.
- Agent versions are immutable snapshots; release publication rechecks the passing run, latest version, knowledge source digests and active binding (`lib/platform/agents.ts:138-181`). A unified lifecycle view must retain these separate records and conflicts.
- Campaign preflight rechecks explicit channel consent, contact existence, source plan authority, release state and mailbox authorization (`lib/platform/campaigns.ts:43-86`). Launch writes an immutable audience/content snapshot with authority fences (`:98-128`). A shorter UX cannot skip preflight.
- Deployment creation/publication is owner-only and retains owner authorization version, exact release/test/source authority, selected public knowledge, AI disclosure, provider constraints, origins and usage limits (`lib/deployments/engine.ts:80-97,101-160`). Public context intentionally removes private memory, tools and unselected sources (`:141-143`).
- Pause/stop, uncertain provider outcomes, public anonymous identity and reviewed learning should remain visible at the point of action.

## Bounded implementation pass: shell + Home

This pass materially improves the whole loop without rewriting the deep editors.

### 1. Introduce a shared product-stage model

Create a client selector from existing workspace records plus `/api/company` readiness. It should return:

- company profile readiness;
- approved source and offering readiness;
- agent draft/version/check/release/deployment readiness;
- customer/audience/consent readiness;
- active campaigns/conversations/review work;
- one next action with target hash and reason.

It is a presentation selector only. It must not infer provider connectivity, live delivery or business success from record counts.

### 2. Rebuild Command centre around three questions

1. **What should I do next?** One primary action and the few prerequisites immediately behind it.
2. **What is running?** Active campaign runs, automations, public deployments and provider-uncertain states.
3. **What needs my decision?** Existing review queue with evidence source and owner.

Remove the two independent process diagrams. Add “Start with a goal” choices only after prerequisites are clear: customer feedback, sales follow-up, or company knowledge setup. These are general jobs; study-abroad examples can appear as placeholder examples, never schema.

### 3. Restructure the rail without breaking links

Use the five job groups above, keep all current view keys and `hashState()` aliases, and render actual anchors to the existing hashes. Collapse inactive secondary destinations. Add status dots/counts only for actionable states, not raw record counts.

### 4. Add a compact lineage/status strip

On Home show the selected/default representative’s `draft → version → checks → release → deployment` state with an exact next action. The strip links to existing views; it does not move or duplicate their business logic.

### 5. Fix global status language

- `0 reviews waiting` when queues are empty.
- Never say “No open decisions” while setup is incomplete.
- Replace global `Saved to your workspace` with refresh/sync language.
- Use `Test conversation` vs `Release checks` consistently.

### Suggested sequence

1. Add the stage selector and tests for empty, partially configured and active-workspace states.
2. Rebuild Command centre with those derived states.
3. Replace the visible navigation hierarchy while preserving current hashes and view components.
4. Add full-record search/status metadata.
5. Add the representative lifecycle strip and terminology changes.
6. Verify owner/operator/viewer variants, keyboard navigation, legacy hashes, refresh/back behavior and the existing consent/publication gates.

### Explicitly out of scope for this pass

Do not rewrite Company brain ingestion, the Agent editor, campaign planner, deployment wizard, voice runtime, public assistant, or backend record schemas. Their next redesign can build on the new shell once users can reliably find and resume work.

## Persona walkthroughs

### Jordan — first-time founder

Jordan creates a workspace with a company name and lands on Command centre. The page reports no decisions and offers “Connect a company system,” while the actual Company profile is incomplete and hidden near the bottom of a scrolling rail. Jordan does not know whether to enter company context, create an agent, import customers, configure Azure or start a campaign. Opening Campaigns presents a disabled offering selector and tells Jordan to go to Company brain and return. This is a likely first-session abandonment path.

### Alex — experienced operator

Alex understands drafts and releases but must navigate among Agents, Test lab, Releases, Deployments, Campaigns and Conversations for one iteration. Search cannot retrieve the version/check/release/deployment chain, modes are not durable URLs, and navigation items are buttons rather than links. Alex will keep multiple mental notes or browser tabs and is likely to operate the wrong artifact after a newer revision appears.

### Indian founder/operator using the product between sales work

The intended operator needs to move from messy company material to a useful customer conversation quickly, often while interrupted. India/timezone/language defaults are helpful, but the UI demands product-architecture knowledge and long-form reading before it provides a business outcome. The redesign should start with the founder’s goal, show the minimum missing evidence/consent step, and let English/Hindi/Hinglish configuration remain inside the relevant Company/Agent record.

## Design specificity

Relay’s evidence language, public/private boundaries, AI disclosure, campaign consent and source-backed learning feel authored for this product. The quiet lilac/white visual world is coherent. The composition itself remains category-interchangeable: a left rail of database objects, cards, local tabs and workbenches could serve any admin SaaS. The missed opportunity is to make the source-backed operating loop itself the primary visual and navigational structure.

## Questions skipped

Targeted questions were skipped because the user has already authorized implementation and the parent task requested a bounded recommendation for the immediate pass.
