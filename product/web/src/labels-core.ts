// The few labels the always-loaded shell needs (store, api), kept apart so the rest of labels.ts loads with the pages and
// the first load stays small (decision.2026-10-24.web-budget-per-chunk). labels.ts re-exports them.

/** Server configuration is never a person's problem to read: a refusal that names an environment variable (or the telephony
 *  adapter being off) becomes what it means for them. Every other refusal is the server's own words, unchanged. */
export function plainReason(reason: string): string {
  if (/telephony provider is not enabled/i.test(reason)) return 'Phone lines are not switched on for this workspace yet, so numbers cannot be searched, rented or rung from here. Practice callers and browser test calls work without one.';
  if (/\bVP_[A-Z0-9_]{3,}\b/.test(reason)) return 'This is not switched on for this workspace yet. Your Vyakti administrator can turn it on.';
  return reason;
}

/** A short human title per tool, for approval cards and receipts. `ask` = what the card asks, `done` = what the receipt says. */
export const TOOL_LABEL: Record<string, { ask: string; done: string }> = {
  'wallet.topup': { ask: 'Add money to the wallet', done: 'Money added to the wallet' },
  'audience.create': { ask: 'Save an audience', done: 'Audience saved' },
  'source.commit': { ask: 'Import this list', done: 'List imported' },
  'campaign.launch': { ask: 'Launch the campaign', done: 'Campaign launched' },
  'inbound.route.set': { ask: 'Answer calls to this number with this agent', done: 'This number now answers calls' },
  'inbound.route.clear': { ask: 'Stop answering calls to this number', done: 'This number no longer answers calls' },
  'campaign.pause': { ask: 'Pause the campaign', done: 'Campaign paused' },
  'campaign.resume': { ask: 'Resume the campaign', done: 'Campaign resumed' },
  'campaign.stop': { ask: 'Stop the campaign', done: 'Campaign stopped' },
  'campaign.draft': { ask: 'Save the campaign draft', done: 'Campaign draft saved' },
  'campaign.window.widen': { ask: 'Widen the calling window', done: 'Calling window widened' },
  'campaign.window.narrow': { ask: 'Narrow the calling window', done: 'Calling window narrowed' },
  'policy.window.set': { ask: 'Change the calling hours', done: 'Calling hours changed' },
  'version.publish': { ask: 'Publish this agent', done: 'Agent published' },
  'version.restore': { ask: 'Roll this agent back to an earlier version', done: 'Agent rolled back' },
  'version.language_variant': { ask: 'Publish this agent in another language', done: 'Language version published' },
  'brief.edit': { ask: 'Change the agent', done: 'Agent changed' },
  'stack.set': { ask: 'Choose a voice stack', done: 'Voice stack chosen' },
  'agent.create': { ask: 'Create an agent', done: 'Agent created' },
  'number.rent': { ask: 'Rent a number', done: 'Number requested' },
  'member.invite': { ask: 'Invite a teammate', done: 'Invitation sent' },
  'member.role.set': { ask: 'Change a teammate\'s role', done: 'Role changed' },
  'apikey.create': { ask: 'Create an API key', done: 'API key created' },
  'apikey.revoke': { ask: 'Revoke an API key', done: 'API key revoked' },
  'apikey.rotate': { ask: 'Rotate an API key', done: 'API key rotated' },
  'sso.config.set': { ask: 'Change the single sign-on settings', done: 'Single sign-on settings saved' },
  'sso.required.set': { ask: 'Change whether single sign-on is required', done: 'Single sign-on requirement changed' },
  'scim.token.create': { ask: 'Create a provisioning token', done: 'Provisioning token created' },
  'scim.token.rotate': { ask: 'Rotate a provisioning token', done: 'Provisioning token rotated' },
  'scim.token.revoke': { ask: 'Revoke a provisioning token', done: 'Provisioning token revoked' },
  'audit.export': { ask: 'Export the activity ledger', done: 'Activity ledger exported' },
  'memory.policy.set': { ask: 'Change what is remembered', done: 'Memory setting changed' },
  'dpdp.request.execute': { ask: 'Carry out a data request', done: 'Data request carried out' },
  'fact.forget': { ask: 'Forget a remembered fact', done: 'Fact forgotten' },
  'fact.approve': { ask: 'Approve a remembered fact', done: 'Fact approved' },
  'proposal.accept': { ask: 'Test this change on real calls', done: 'Test approved' },
  'experiment.start': { ask: 'Start the test on real calls', done: 'Test started' },
  'script.pacing.restore': { ask: 'Restore full pacing to this script', done: 'Full pacing restored' },
  'proposal.probe': { ask: 'Simulate this change', done: 'Change simulated' },
  'operator.brain.set': { ask: 'Switch the model', done: 'Model switched' },
  'operator.autonomy.raise': { ask: 'Let the assistant draft and test on its own', done: 'The assistant can draft and test on its own' },
  'operator.autonomy.lower': { ask: 'Ask before every draft and test', done: 'The assistant now asks first' },
  'knowledge.ingest': { ask: 'Add a knowledge source', done: 'Knowledge source added' },
  'brand.update': { ask: 'Change the brand details', done: 'Brand details saved' },
  'contact.merge': { ask: 'Merge two records of one person', done: 'Records merged' },
  'contact.unsuppress': { ask: 'Allow calling this person again', done: 'Person can be called again' },
  'contact.suppress': { ask: 'Stop calling this person', done: 'Person will not be called' },
  'cap.raise': { ask: 'Raise a spend cap', done: 'Spend cap raised' },
  'cap.lower': { ask: 'Lower a spend cap', done: 'Spend cap lowered' },
  'campaign.burst.set': { ask: 'Let a campaign burst', done: 'Burst turned on' },
  'campaign.burst.off': { ask: 'Turn a campaign\'s burst off', done: 'Burst turned off' },
  'test.simulate': { ask: 'Run a practice call', done: 'Practice call run' },
  'test.chat': { ask: 'Send a practice chat line', done: 'Practice chat answered' },
  'knowledge.ingest_site': { ask: 'Read the company website', done: 'Website read' },
  'offering.import': { ask: 'Import an offerings sheet', done: 'Sheet imported' },
  'knowledge.fact.decide': { ask: 'Decide which facts she may say', done: 'Facts decided' },
  'test.chat_keep': { ask: 'Keep a practice chat for review', done: 'Practice chat kept' },
  'monitor.create': { ask: 'Turn on a monitor', done: 'Monitor turned on' },
};
export const toolAsk = (tool: string, fallback: string) => TOOL_LABEL[tool]?.ask ?? fallback;
export const toolDone = (tool: string, fallback: string) => TOOL_LABEL[tool]?.done ?? fallback;

/** "Who asked" on the approval sheet, from brief.today's requestedBy (FRICTION R7). */
export function requesterLine(r: { type: 'member' | 'assistant' | 'api_key' | 'system'; name: string | null; memberId: string | null }, meId?: string): string {
  if (r.type === 'assistant') return r.memberId && r.memberId === meId ? 'The assistant asked for you' : r.name ? `The assistant asked for ${r.name}` : 'The assistant asked';
  if (r.type === 'api_key') return r.name ? `API key "${r.name}" asked` : 'An API key asked';
  if (r.type === 'system') return 'Vyakti asked';
  return r.memberId && r.memberId === meId ? 'You asked for this' : r.name ? `${r.name} asked` : 'A team member asked';
}
