# Connecting an MCP client to Vyakti

Vyakti's tools are available to any Model Context Protocol (MCP) client, for example your own agent, an IDE assistant
or an orchestration framework. They are the same tools the Vyakti app and the assistant use, generated from one
registry, so the MCP list always matches the product.

## What you need

- A **workspace API key**. In Vyakti, go to **Settings → API keys**, create a key and copy it (it is shown once).
  - A key acts with the Builder role.
  - To limit what a key can do, give it **scopes**:
    - a scope is a tool name (`campaign.estimate`) or a family of tools (`agent` covers `agent.create`, `agent.get`, …);
    - a key with no scopes can use every tool a Builder can.
- Your Vyakti address, for example `https://app.vyakti.example`.

## Connect

| Setting | Value |
|---|---|
| Transport | Streamable HTTP |
| URL | `https://app.vyakti.example/v1/mcp` |
| Header | `Authorization: Bearer vp_xxxxxxxx_…` |
| Protocol versions | `2025-06-18` (also `2025-03-26`, `2024-11-05`) |

The server answers each request on its own POST, as JSON. It keeps no session and sends no server-initiated stream.

Requests from a browser page are refused unless its origin is on the deployment's allow-list. MCP is for servers and
agents, not for web pages.

Example with a generic MCP client configuration:

```json
{
  "mcpServers": {
    "vyakti": {
      "type": "http",
      "url": "https://app.vyakti.example/v1/mcp",
      "headers": { "Authorization": "Bearer ${VYAKTI_API_KEY}" }
    }
  }
}
```

Keep the key in your client's secret store or an environment variable, never in a prompt or a file you share.

## Tools

`tools/list` returns every tool your key may use. For each tool you get:
- its input JSON Schema;
- a one-line description;
- hints: read-only, destructive, reaches people.

Tool names use `_` where Vyakti's own names use `.`: `agent_create` is `agent.create`. Either form is accepted on
`tools/call`.

Every result's text starts with one of four outcomes:

| Outcome | Meaning |
|---|---|
| `DONE` | It ran. The result follows. |
| `NOT DONE` | Nothing changed. The reason follows: a missing field, a scope your key lacks, a rule. |
| `WAITING FOR APPROVAL` | Nothing has happened yet. See "Approvals" below. |
| `UNKNOWN` | It may or may not have happened, for example when a carrier timed out. Do not retry; check first. |

The same receipt is also in `structuredContent`.

## Approvals: what an outside agent can and cannot do

**Run at once:**
- reads;
- drafts and tests: creating or editing a draft agent, a draft campaign, a practice call.

If the workspace is set to "Ask before drafts", drafts and tests wait for approval too.

**Return an approval card instead of running:** anything that reaches people, spends money, deletes, or changes
policy. For example: launching a campaign, publishing an agent, adding money, raising a cap, pausing a campaign.
- `tools/call` returns `WAITING FOR APPROVAL` with the card's id.
- A person in your workspace approves or declines it in Vyakti, with a deliberate hold.
- Your agent can read the outcome with `action_get` (`{ "id": "<card id>" }`). It reports `proposed`, `executed`,
  `cancelled`, `expired` or `unknown`, and the result once it ran.

**Cannot do at all:** approve anything. No MCP tool approves a card, and an API key cannot approve one over any other
route either.

Each card is bound to the exact arguments it was proposed with. If anything changes before the person approves it, the
card is cancelled and has to be proposed again.

## Errors

| Response | Meaning |
|---|---|
| `401` | No API key, or not a valid key. A signed-in browser session cannot use MCP. |
| `403` | The request came from a browser origin that is not allowed. |
| JSON-RPC `-32601` | The method is not supported. The server supports `initialize`, `ping`, `tools/list` and `tools/call`. |
| JSON-RPC `-32602` | Unknown tool name, or the arguments are not an object. |

## TypeScript

To call the same tools without MCP, use the TypeScript SDK in `product/sdk` (see its README). It provides typed calls
and `waitForApproval()`.
