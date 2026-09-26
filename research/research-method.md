# Product discovery method and evidence boundaries

Research date: 2026-09-21. This is a product decision exercise, not an implementation or launch commitment.

## The founder's brief

Explore a company brain, intelligent CRM, company command centre, and natural, emotionally responsive voice agents that automate sales and customer management. Consider market research, customer support, sales enablement and hiring. Investigate every branch of the existing repositories, but allow the best product to require entirely new work. Use less expensive models for mechanical exploration and stronger models for demanding analysis.

## Repository scope

The target `raghavsharma2003/sales-enabler` was cloned locally. Its initial main commit is `319a84b043afbb3b072e9559c7f3012237fa7a80`; the only tracked file was an empty `.gitkeep`. Research is being assembled on local branch `codex/product-discovery`.

Source repositories are separate clones in the parent workspace's `research-sources` directory. They are evidence sources, not dependencies of this product. No source application has been deployed, no customer records have been changed, and no outreach has been sent for this research.

Named remote branches at initial discovery (excluding the symbolic remote HEAD):

| Repository | Branches |
| --- | ---: |
| command_centre | 21 |
| html-portfolio | 31 |
| Vyakti-GroupAI | 3 |
| sales-enabler | 1 |

The three audits record branch-specific evidence. Enumerating every branch does not mean reading every historical version of every line. Shared content can be inspected once; unique deltas need their own assessment. Branch-tip inspection also does not prove deployed state. Coverage limitations must remain explicit.

[branch-inventory.json](branch-inventory.json) independently records every named source branch, commit, tree and tracked-path count. It confirms 20 distinct trees across CommandCentre's 21 branches, 31 across html-portfolio's 31 branches, and 3 across GroupAI's 3 branches. Path counts include assets and generated files and must not be interpreted as reviewed code. The target repository's initial main branch was separately inspected as described above.

## Evidence labels

- **Code inspected:** implementation and relevant callers/schema inspected statically at an identified ref. This is not a claim of successful runtime execution.
- **Repository-reported:** documentation, saved measurements or test reports say something happened. This research did not independently reproduce it.
- **Vendor-published:** official product documentation, pricing or customer story. Establishes what is offered or claimed, not independent causal proof or universal availability.
- **Research evidence:** a published study with a defined setting and method. Its result is limited to that setting.
- **Inference:** our interpretation of the above.
- **Hypothesis:** an unvalidated product, buyer, price or outcome assumption to test with customers.

Competitor absence from a search result is not evidence that a feature does not exist. A technically useful asset is not evidence of willingness to pay. Customer enthusiasm is weaker evidence than access to a real workflow, a budget owner and a paid pilot.

## Founder clarification

The founder can reach an Indian study-abroad consultancy helping Indian students enter international colleges. They explicitly want a general product that can be tailored to each customer, with study abroad as the first concrete use case. The current task is planning features, value, market, industry and competitive advantage; a build deadline and budget are not yet the decision.

Accordingly, the product proposal separates shared platform capabilities from industry and company configuration. It uses the consultancy to make the value proposition testable without hardcoding the platform to admissions. No customer interviews or external pilot measurements have been performed in this phase.

## Decision discipline

First choose a painful, recurring customer outcome and buyer. Then choose the minimum workflow that can improve it, the evidence needed to prove improvement, and the delivery constraints. Only then choose which existing components reduce execution risk. An existing feature receives no priority merely because it was expensive to build.

Keep a broad company vision while limiting the first paid offer to a workflow a buyer can understand, authorize and measure. Expand when adjacent workflows share the same customer state, integrations and buyer; do not assume that support, recruiting and research belong in the same first product.
