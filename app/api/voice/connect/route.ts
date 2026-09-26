import { assertSameOrigin, requireUser } from '@/lib/server/auth';
import { releasedVoiceContext } from '@/lib/voice/release';
import { previewVoiceContext, compileCampaignVoiceContext } from '@/lib/voice/context';
import { createRecord } from '@/lib/platform/records';
import { apiError, field, HttpError, json, readBody } from '@/lib/server/http';
import { getVoiceConfiguration, VoiceConfigurationError } from '@/lib/voice/config';
import { getVoiceServerAdapter, buildProviderInstructions, VoiceConnectionError } from '@/lib/voice/server';
import type { VoiceProfile } from '@/lib/voice/contracts';
import { readAudioOffer } from '@/lib/voice/offer';
import { buildVoiceToolAuthority } from '@/lib/voice/tools/authority';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const data = await readBody(request);
    if (data.consent !== true) throw new HttpError(400, 'Confirm consent before starting a voice conversation.');
    if (data.mode !== undefined && data.mode !== 'preview' && data.mode !== 'release') throw new HttpError(400, 'Choose preview or release calling mode.');
    const mode = data.mode === 'preview' ? 'preview' : 'release';
    if (data.inputMode !== undefined && data.inputMode !== 'microphone' && data.inputMode !== 'text') throw new HttpError(400, 'Choose microphone or typed input.');
    const inputMode = data.inputMode === 'text' ? 'text' : 'microphone';
    const contactId = field(data, 'contactId', 100, false) || undefined;
    const campaignRunId = field(data, 'campaignRunId', 100, false) || undefined;
    if (campaignRunId && mode === 'preview') throw new HttpError(400, 'Draft previews cannot be attached to campaign runs.');
    if (campaignRunId && !contactId) throw new HttpError(400, 'Choose a queued campaign recipient.');
    const agentId = field(data, 'agentId', 100, mode === 'release') || undefined;
    const initialContext = mode === 'preview'
      ? await previewVoiceContext(user, { draft: data.draft, agentId, contactId })
      : await releasedVoiceContext(user, { agentId: agentId!, versionId: field(data, 'versionId', 100), releaseId: field(data, 'releaseId', 100), contactId });
    const context = campaignRunId
      ? await compileCampaignVoiceContext(user, { campaignRunId, contactId: contactId!, releaseId: field(data, 'releaseId', 100) }, initialContext)
      : initialContext;
    // Profile authority is the validated draft or immutable released agent, never a caller-supplied provider field.
    const profile: VoiceProfile = context.agent.voiceProfile === 'maya-despina' ? 'maya-despina' : 'provider-default';
    const configuration = getVoiceConfiguration(process.env, profile);
    const adapter = getVoiceServerAdapter(process.env, fetch, profile);
    const sdp = configuration.provider === 'gemini' ? undefined : readAudioOffer(data.sdp);
    if (campaignRunId) {
      const checked = await compileCampaignVoiceContext(user, { campaignRunId, contactId: contactId!, releaseId: field(data, 'releaseId', 100) }, initialContext);
      if (checked.contextDigest !== context.contextDigest || !('campaignDigest' in context) || checked.campaignDigest !== context.campaignDigest) throw new HttpError(409, 'Campaign call context changed. Refresh and try again.');
    }
    const toolAuthority = await buildVoiceToolAuthority(user, context, contactId);
    const result = await adapter.connect({ sdp, instructions: context.instructions, userId: user.id, organizationId: context.organizationId, signal: request.signal, enabledTools: toolAuthority.enabledTools });
    if (campaignRunId) {
      const checked = await compileCampaignVoiceContext(user, { campaignRunId, contactId: contactId!, releaseId: field(data, 'releaseId', 100) }, initialContext);
      if (checked.contextDigest !== context.contextDigest || !('campaignDigest' in context) || checked.campaignDigest !== context.campaignDigest) throw new HttpError(409, 'Campaign call context changed. Refresh and try again.');
    }
    const initialInstructions = buildProviderInstructions(context.instructions, profile, toolAuthority.enabledTools);
    const behaviorContext = { settings: { allowedLanguages: context.agent.allowedLanguages,
      primaryLanguage: context.agent.primaryLanguage, responseStyle: context.agent.responseStyle }, relationship: context.relationship };
    const configuredOpening = context.agent.openingMessage?.trim() || context.agent.disclosure;
    const openingMessage = /\b(ai|artificial intelligence|virtual assistant)\b/i.test(configuredOpening)
      ? configuredOpening : `${context.agent.disclosure} ${configuredOpening}`;
    if (mode === 'preview') {
      // An issued connection is not evidence that audio or an outcome succeeded.
      const preview = await createRecord(user, 'voice_preview', {
        agentId, contactId, config: context.agent, contextDigest: context.contextDigest,
        knowledgeSources: context.knowledgeSources, relationshipSourceIds: context.relationship.sourceIds, relationship: context.relationship,
        provider: result.provider, inputMode, requestedBy: user.id, mode: 'internal_draft_test', toolAuthority,
      }, 'connection_issued');
      return json({ ...result, openingMessage, initialInstructions, behaviorContext, enabledTools: toolAuthority.enabledTools, previewId: preview.id });
    }
    const connection = await createRecord(user, 'voice_connection', {
      agentId, versionId: field(data, 'versionId', 100), releaseId: field(data, 'releaseId', 100), contactId,
      config: context.agent, relationship: context.relationship, contextDigest: context.contextDigest,
      ...(campaignRunId && 'campaignDigest' in context ? { campaignRunId, campaignDigest: context.campaignDigest } : {}),
      provider: result.provider, inputMode, requestedBy: user.id, mode: 'released_browser_call', toolAuthority,
    }, 'connection_issued');
    return json({ ...result, openingMessage, initialInstructions, behaviorContext, enabledTools: toolAuthority.enabledTools, connectionId: connection.id });
  } catch (error) {
    if (error instanceof VoiceConfigurationError) return json({ error: error.message }, 503);
    if (error instanceof VoiceConnectionError) return json({ error: error.message }, 502);
    return apiError(error);
  }
}
