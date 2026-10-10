/** Browser-only navigation references and explicit campaign/agent decisions. No customer payloads. */
import type { AgentConfig } from './agents';
import type { PlatformRecord, PlatformViewProps } from './contracts';
import { campaignEditorFields } from './campaign-workspace-view';
import { readCampaignSetup } from './campaign-workflow';
import { versionKnowledgeState } from './agent-readiness';
import { isReleaseReviewPacket, latestConfigurationRun, releaseReviewRequest } from './release-review';

export type CampaignAgentReference = { campaignId: string; revision: number; agentId?: string };
const prefix = 'campaign-agent~';
const validId = (value: string) => /^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$/.test(value);
export function campaignAgentFocus(reference: CampaignAgentReference): string {
  if (!validId(reference.campaignId) || !Number.isSafeInteger(reference.revision) || reference.revision < 1 || (reference.agentId !== undefined && (!validId(reference.agentId) || reference.agentId === 'new'))) throw new Error('Invalid campaign agent reference.');
  return `${prefix}${reference.campaignId}~${reference.revision}~${reference.agentId || 'new'}`;
}
/** Null means a legacy Agent Studio route. Malformed handoffs never select a default agent. */
export function parseCampaignAgentFocus(focus?: string): CampaignAgentReference | 'invalid' | null {
  if (!focus?.startsWith('campaign-agent')) return null;
  if (!focus.startsWith(prefix) || focus.length > 240) return 'invalid';
  const parts = focus.slice(prefix.length).split('~');
  if (parts.length !== 3 || !validId(parts[0]) || !/^[1-9]\d{0,15}$/.test(parts[1]) || !Number.isSafeInteger(Number(parts[1])) || !validId(parts[2])) return 'invalid';
  return { campaignId: parts[0], revision: Number(parts[1]), ...(parts[2] === 'new' ? {} : { agentId: parts[2] }) };
}

export function campaignAgentContext(records: PlatformRecord[], reference: CampaignAgentReference) {
  const campaign = records.find(record => record.kind === 'campaign' && record.id === reference.campaignId);
  if (!campaign) throw new Error('This campaign is unavailable in this workspace.');
  if (campaign.revision !== reference.revision) throw new Error('The campaign changed while you prepared the agent. Return to the campaign and review its saved setup.');
  const setup = readCampaignSetup(campaign);
  if (!setup || records.some(record => record.kind === 'campaign_run' && record.data.campaignId === campaign.id)) throw new Error('This campaign is no longer in editable setup. Return to review its current stage.');
  if (setup.fields.channel !== 'browser') throw new Error('This campaign no longer uses browser voice. Return to review its channel.');
  const offering = records.find(record => record.kind === 'offering' && record.id === setup.fields.offeringId && record.status === 'approved');
  if (!offering || typeof offering.data.name !== 'string' || !offering.data.name.trim()) throw new Error('Choose an approved product or service in campaign Intent before preparing an agent.');
  if (!setup.fields.goal?.trim()) throw new Error('Save a campaign goal in Intent before preparing an agent.');
  return { campaign, offering, fields: campaignEditorFields(campaign) };
}

/** An operator must explicitly copy this deterministic starting draft into the editor. */
export function campaignAgentTemplate(records: PlatformRecord[], reference: CampaignAgentReference): Partial<AgentConfig> {
  const { offering, fields } = campaignAgentContext(records, reference);
  const feedback = fields.kind === 'feedback';
  const knowledgeIds = (fields.sourceIds || []).filter(id => records.some(record => record.kind === 'brain_source' && record.id === id && record.status === 'approved'));
  return {
    name: `${offering.data.name} · ${feedback ? 'Feedback' : 'Sales'}`.slice(0, 120),
    role: feedback ? 'Customer feedback representative' : 'Sales qualification representative',
    objective: `Help with ${offering.data.name}. Campaign goal: ${fields.goal}`.slice(0, 3000),
    disclosure: 'I am an AI assistant for this company.',
    systemPrompt: feedback ? 'Ask one open question at a time about the customer’s experience. Confirm corrections. Use approved company sources for factual claims. Do not assume feelings or promise resolutions. Offer human help when needed.' : 'Understand the person’s needs before discussing the offering. Ask one question at a time. Use approved company sources for factual claims. Do not invent prices, guarantees or commitments. Offer human help when needed.',
    openingMessage: feedback ? 'Hello, I’m an AI assistant with the team. Is now a good time to ask about your experience?' : 'Hello, I’m an AI assistant with the team. Is now a good time to discuss what you’re looking for?',
    knowledgeIds, enabledTools: knowledgeIds.length ? ['search_company_knowledge'] : [],
  };
}

export function campaignAgentBinding(input: { records: PlatformRecord[]; reference: CampaignAgentReference; agentId: string; releaseId: string; dirty: boolean; viewer: boolean }) {
  if (input.viewer) throw new Error('Operator access is required to use an agent in a campaign.');
  if (input.dirty) throw new Error('Save or discard your agent changes before returning with a release.');
  const context = campaignAgentContext(input.records, input.reference);
  if (input.reference.agentId !== input.agentId) throw new Error('This agent does not match the campaign preparation context.');
  const agent = input.records.find(record => record.kind === 'agent_definition' && record.id === input.agentId);
  const release = input.records.find(record => record.kind === 'release' && record.id === input.releaseId);
  const version = input.records.find(record => record.kind === 'agent_version' && record.id === release?.data.versionId);
  if (!agent || !release || release.status !== 'active' || release.data.channel !== 'browser' || release.data.agentId !== agent.id || !version || version.data.agentId !== agent.id) throw new Error('The exact active release for this agent is unavailable. Review Publish again.');
  if (version.data.sourceRevision !== agent.revision || versionKnowledgeState(version, input.records) !== 'current') throw new Error('The active version does not match the current saved agent and knowledge. Run checks and publish the current version first.');
  const run = latestConfigurationRun(input.records, agent.id, version.id);
  if (!run || run.status !== 'passed' || run.data.passed !== true) throw new Error('Run passing configuration checks for this exact version before returning.');
  return { ...context, agent, release, version, run };
}

/** No navigation URL applies a release. This runs only from the explicit return button. */
export async function returnCampaignAgent(input: Omit<Parameters<typeof campaignAgentBinding>[0], 'records'>, loadRecords: () => Promise<PlatformRecord[]>, act: PlatformViewProps['act'], stillCurrent: () => boolean) {
  const check = () => { if (!stillCurrent()) throw new Error('The agent or campaign selection changed. Review the current draft before returning.'); };
  check();
  const first = campaignAgentBinding({ ...input, records: await loadRecords() });
  check();
  const review = await act('release.review', releaseReviewRequest(first.version, first.run, 'publish'));
  if (!isReleaseReviewPacket(review) || review.agentId !== first.agent.id || review.agentVersionId !== first.version.id || review.testRunId !== first.run.id || review.currentReleaseId !== first.release.id || !review.publishable) throw new Error('Current release evidence no longer allows this agent to be used. Review Publish and resolve its blockers.');
  check();
  const current = campaignAgentBinding({ ...input, records: await loadRecords() });
  if (current.agent.revision !== first.agent.revision || current.version.id !== first.version.id || current.run.id !== first.run.id) throw new Error('The release evidence changed. Review Publish again before returning.');
  check();
  const value = await act('campaign.setup.update', { id: current.campaign.id, revision: current.campaign.revision, phase: 'review', patch: { agentReleaseId: current.release.id } });
  const saved = value as PlatformRecord | undefined;
  if (!saved || saved.kind !== 'campaign' || saved.id !== input.reference.campaignId || saved.revision !== current.campaign.revision + 1 || readCampaignSetup(saved)?.fields.agentReleaseId !== input.releaseId) throw new Error('The campaign save could not be confirmed. Return to the campaign and inspect its saved release before retrying.');
  return saved;
}
