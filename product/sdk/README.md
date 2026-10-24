# Vyakti TypeScript SDK

Typed calls to Vyakti's tools, and the approval flow.

The tools are generated from the same registry as the app, the HTTP API, MCP (`docs/mcp.md`) and the assistant.
`tools.gen.ts` is written by `scripts/sdk-gen.ts` from `shared/tool-catalog.json`.

The SDK is not published yet. It lives in this repository.

```ts
import { Vyakti } from './sdk/index.ts';

const vy = new Vyakti({ baseUrl: 'https://app.vyakti.example', apiKey: process.env.VYAKTI_API_KEY! });

// Drafts run at once.
const agent = await vy.call('agent.create', { name: 'Service follow-up', templateId: 'appliance-service-followup' });

// Anything that reaches people, spends, deletes or changes policy returns an approval card.
const card = await vy.call('cap.raise', { scope: 'workspace', period: 'daily', capInrMilli: 2_000_000 });
if (card.status === 'needs_approval') {
  const outcome = await vy.waitForApproval(card.actionId);   // a person approves it in Vyakti
  console.log(outcome.status);                                // 'executed', 'cancelled', 'expired', ...
}
```

How a call can come back:
- **Receipts, not exceptions.** Every call returns a receipt: `confirmed`, `needs_approval`, `not_executed` (with the
  reason) or `unknown`. Only transport errors throw `VyaktiError`.
- **Key permissions.** The key's role (Builder) and scopes apply, exactly as on the HTTP API.
- **No approvals.** The SDK has no way to approve. A person approves in Vyakti.

After adding or changing a tool, regenerate:

```
node --import tsx product/scripts/tool-catalog.ts && node --import tsx product/scripts/sdk-gen.ts
```

`tests/sdk.test.ts` fails when either file is behind the registry.
