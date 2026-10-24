// The subject of a tool run: the one named thing it acted on (an agent, a campaign, a contact, a call, ...), so the
// activity ledger can say "ran a practice call: Asha" instead of six identical lines. Only {type, id} is stored in the
// audit payload, never a name or any text: names are resolved at read time, inside the workspace, and a deleted thing
// simply loses its name. A create's input names nothing, so its subject comes from the result (agent.create returns agentId).

/** Argument keys that name an entity, most specific first. A tool whose input has one of these gets a subject. */
export const SUBJECT_KEYS: readonly (readonly [string, SubjectType])[] = [
  ['conversationId', 'call'], ['attemptId', 'attempt'], ['agentId', 'agent'], ['campaignId', 'campaign'], ['contactId', 'contact'],
  ['asContactId', 'contact'], ['keepId', 'contact'], ['audienceId', 'audience'], ['agentVersionId', 'version'], ['versionId', 'version'],
  ['parentVersionId', 'version'], ['experimentId', 'experiment'], ['proposalId', 'proposal'], ['issueId', 'issue'], ['numberId', 'number'],
  ['outcomeDefinitionId', 'outcome'], ['definitionId', 'outcome'], ['judgeVersionId', 'judge'], ['memberId', 'member'], ['breakGlassMemberId', 'member'],
  ['offeringId', 'offering'], ['sourceId', 'source'], ['toolId', 'tool'], ['factId', 'fact'],
] as const;
/** Id arguments that are deliberately not a subject: internal handles a buyer never names (a revision, an upload, a
 *  delivery, a one-time reveal, ...). The guard test makes every new *Id argument land in one of the two lists. */
export const INTERNAL_ID_KEYS: readonly string[] = ['revisionId', 'auditEventId', 'scopeId', 'requestId', 'mergeId', 'suppressionId', 'stashId',
  'sourceMessageId', 'revealId', 'objectId', 'uploadId', 'receiptId', 'endpointId', 'deliveryId', 'fromVersionId', 'exportId', 'handOffId', 'alertId', 'importId', 'integrationId', 'authIntegrationId', 'destinationId', 'deploymentId',
  'connectionId', 'threadId'];
export type SubjectType = 'call' | 'attempt' | 'agent' | 'campaign' | 'contact' | 'audience' | 'version' | 'experiment' | 'proposal' | 'issue' | 'number'
  | 'outcome' | 'judge' | 'member' | 'offering' | 'source' | 'tool' | 'fact';
export interface Subject { type: SubjectType; id: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pick = (o: unknown, only?: ReadonlySet<SubjectType>): Subject | null => {
  if (!o || typeof o !== 'object') return null;
  const rec = o as Record<string, unknown>;
  for (const [k, type] of SUBJECT_KEYS) {
    if (only && !only.has(type)) continue;
    if (typeof rec[k] === 'string' && UUID.test(rec[k] as string)) return { type, id: (rec[k] as string).toLowerCase() };
  }
  return null;
};
/** What a create can make. A result also carries ids that are not what was made (the member who made it, the call it
 *  opened), so only these kinds are taken from a result. */
const CREATED: ReadonlySet<SubjectType> = new Set(['agent', 'campaign', 'audience', 'contact', 'version', 'experiment', 'proposal', 'outcome', 'judge', 'offering', 'source', 'tool']);

/** Tools whose own entity is a bare `id` (campaign.draft {id?}, campaign.launch {id}): in these namespaces `id`, in the
 *  input or else in a create's result, is the subject before any other key. campaign.draft names its audience too, but
 *  the campaign is what it saved (open.2026-10-24.activity-subject-campaign-draft). */
const OWN_ID: Readonly<Record<string, SubjectType>> = { campaign: 'campaign', audience: 'audience', contact: 'contact', offering: 'offering' };

/** The subject of one tool run: what its input names; for a create, whose input names nothing, what its result made. */
export function subjectOf(input: unknown, result?: unknown, tool?: string): Subject | null {
  const own = tool ? OWN_ID[tool.split('.')[0]] : undefined;
  if (own) for (const o of [input, result]) {
    const id = o && typeof o === 'object' ? (o as Record<string, unknown>).id : undefined;
    if (typeof id === 'string' && UUID.test(id)) return { type: own, id: id.toLowerCase() };
  }
  return pick(input) ?? pick(result, CREATED);
}
