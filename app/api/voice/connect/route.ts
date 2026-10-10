import { assertSameOrigin, requireUser, type AuthUser } from '@/lib/server/auth';
import { releasedVoiceContext } from '@/lib/voice/release';
import { previewVoiceContext, compileCampaignVoiceContext } from '@/lib/voice/context';
import { createRecord } from '@/lib/platform/records';
import { apiError, field, HttpError, json, readBody } from '@/lib/server/http';
import { getVoiceConfiguration, VoiceConfigurationError } from '@/lib/voice/config';
import { getVoiceServerAdapter, buildProviderInstructions, VoiceConnectionError, VoiceCallAllocationError, voiceAllocationNotStarted } from '@/lib/voice/server';
import type { VoiceProfile } from '@/lib/voice/contracts';
import { readAudioOffer } from '@/lib/voice/offer';
import { buildVoiceToolAuthority } from '@/lib/voice/tools/authority';
import { assertInferenceAccess, assertVoiceAttemptActive, beginVoiceAttempt, markAttemptProvisioning, attachProviderCall, bindVoiceAttemptCall, failVoiceAttempt, requestVoiceStop } from '@/lib/usage/service';
import { assertPrivateVoiceContactScope } from '@/lib/voice/private-scope';
import { hangupAzureCall } from '@/lib/voice/call-control';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  let actor: AuthUser | undefined;
  let attemptId: string | undefined;
  let providerStarted = false;
  let allocated: { providerCallRef: string; providerConfigurationDigest: string } | undefined;
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    actor = user;
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
    const speechDelivery = context.agent.speechDelivery ? { ...context.agent.speechDelivery } : undefined;
    if (speechDelivery && configuration.provider !== 'azure') throw new HttpError(400, 'Configured speech delivery requires Azure Realtime. Choose the Azure voice provider to use this profile.');
    await assertInferenceAccess(user);
    const adapter = getVoiceServerAdapter(process.env, fetch, profile);
    const sdp = configuration.provider === 'gemini' ? undefined : readAudioOffer(data.sdp);
    if (campaignRunId) {
      const checked = await compileCampaignVoiceContext(user, { campaignRunId, contactId: contactId!, releaseId: field(data, 'releaseId', 100) }, initialContext);
      if (checked.contextDigest !== context.contextDigest || !('campaignDigest' in context) || checked.campaignDigest !== context.campaignDigest) throw new HttpError(409, 'Campaign call context changed. Refresh and try again.');
    }
    const toolAuthority = await buildVoiceToolAuthority(user, context, contactId);
    await assertPrivateVoiceContactScope(user, contactId);
    if (configuration.provider === 'azure') {
      const reservation = await beginVoiceAttempt(user, { requestId: field(data, 'requestId', 160), provider: 'azure', purpose: 'private_webrtc' });
      attemptId = reservation.id;
      if (reservation.replayed || !await markAttemptProvisioning(user, attemptId)) {
        // A status replay is never permission to allocate a second paid session.
        attemptId = undefined;
        throw new HttpError(409, 'This voice request already exists or was cancelled. Check Usage & services before starting another call.');
      }
    }
    if (request.signal.aborted) throw new HttpError(409, 'The call was cancelled before connection.');
    providerStarted = true;
    const result = await adapter.connect({ sdp, instructions: context.instructions, userId: user.id, organizationId: context.organizationId, signal: request.signal, enabledTools: toolAuthority.enabledTools, speechVocabulary: context.speechVocabulary, ...(speechDelivery ? { speechDelivery } : {}) });
    const { providerCallRef, providerConfigurationDigest, ...publicResult } = result;
    if (providerCallRef && providerConfigurationDigest) allocated = { providerCallRef, providerConfigurationDigest };
    if (attemptId) {
      if (!providerCallRef || !providerConfigurationDigest) throw new VoiceCallAllocationError('The voice provider did not return a controllable call reference.');
      const bound = await attachProviderCall(user, attemptId, providerCallRef, {}, providerConfigurationDigest);
      if (request.signal.aborted || bound.state !== 'active' || Date.parse(bound.deadlineAt) <= Date.now()) {
        await requestVoiceStop(user, attemptId);
        throw new HttpError(409, 'The call was cancelled while connecting. Its server cleanup is being tracked.');
      }
      await assertInferenceAccess(user);
      await assertPrivateVoiceContactScope(user, contactId);
    }
    if (campaignRunId) {
      const checked = await compileCampaignVoiceContext(user, { campaignRunId, contactId: contactId!, releaseId: field(data, 'releaseId', 100) }, initialContext);
      if (checked.contextDigest !== context.contextDigest || !('campaignDigest' in context) || checked.campaignDigest !== context.campaignDigest) throw new HttpError(409, 'Campaign call context changed. Refresh and try again.');
    }
    const initialInstructions = buildProviderInstructions(context.instructions, profile, toolAuthority.enabledTools);
    const behaviorContext = { settings: { allowedLanguages: context.agent.allowedLanguages,
      primaryLanguage: context.agent.primaryLanguage, responseStyle: context.agent.responseStyle }, relationship: context.relationship, ...(speechDelivery ? { speechDelivery } : {}) };
    const configuredOpening = context.agent.openingMessage?.trim() || context.agent.disclosure;
    const openingMessage = /\b(ai|artificial intelligence|virtual assistant)\b/i.test(configuredOpening)
      ? configuredOpening : `${context.agent.disclosure} ${configuredOpening}`;
    if (mode === 'preview') {
      // An issued connection is not evidence that audio or an outcome succeeded.
      const preview = await createRecord(user, 'voice_preview', {
        agentId, contactId, config: context.agent, contextDigest: context.contextDigest,
        knowledgeSources: context.knowledgeSources, relationshipSourceIds: context.relationship.sourceIds, relationship: context.relationship,
        provider: result.provider, inputMode, requestedBy: user.id, mode: 'internal_draft_test', toolAuthority,
        ...(attemptId ? { voiceAttemptId: attemptId } : {}),
      }, 'connection_issued');
      if (attemptId) await bindVoiceAttemptCall(user, attemptId, { kind: 'voice_preview', id: preview.id });
      if (attemptId) await assertVoiceAttemptActive(user, attemptId);
      if (request.signal.aborted && attemptId) { await requestVoiceStop(user, attemptId); throw new HttpError(409, 'The call was cancelled while connecting.'); }
      return json({ ...publicResult, openingMessage, initialInstructions, behaviorContext, enabledTools: toolAuthority.enabledTools, previewId: preview.id, ...(attemptId ? { voiceAttemptId: attemptId } : {}) });
    }
    const connection = await createRecord(user, 'voice_connection', {
      agentId, versionId: field(data, 'versionId', 100), releaseId: field(data, 'releaseId', 100), contactId,
      config: context.agent, relationship: context.relationship, contextDigest: context.contextDigest,
      ...(campaignRunId && 'campaignDigest' in context ? { campaignRunId, campaignDigest: context.campaignDigest } : {}),
      provider: result.provider, inputMode, requestedBy: user.id, mode: 'released_browser_call', toolAuthority,
      ...(attemptId ? { voiceAttemptId: attemptId } : {}),
    }, 'connection_issued');
    if (attemptId) await bindVoiceAttemptCall(user, attemptId, { kind: 'voice_connection', id: connection.id });
    if (attemptId) await assertVoiceAttemptActive(user, attemptId);
    if (request.signal.aborted && attemptId) { await requestVoiceStop(user, attemptId); throw new HttpError(409, 'The call was cancelled while connecting.'); }
    return json({ ...publicResult, openingMessage, initialInstructions, behaviorContext, enabledTools: toolAuthority.enabledTools, connectionId: connection.id, ...(attemptId ? { voiceAttemptId: attemptId } : {}) });
  } catch (error) {
    if (actor && attemptId) {
      const reference = allocated || (error instanceof VoiceCallAllocationError && error.providerCallRef && error.providerConfigurationDigest
        ? { providerCallRef: error.providerCallRef, providerConfigurationDigest: error.providerConfigurationDigest } : undefined);
      try {
        if (reference) await attachProviderCall(actor, attemptId, reference.providerCallRef, {}, reference.providerConfigurationDigest);
        await failVoiceAttempt(actor, attemptId, { definitivePreProviderFailure: !providerStarted || voiceAllocationNotStarted(error) });
        if (providerStarted) await requestVoiceStop(actor, attemptId);
      } catch {
        // If persistence failed after allocation, still try to stop the known
        // server-owned call. No lost receipt is treated as a refunded budget.
        if (reference) await hangupAzureCall(reference).catch(() => undefined);
      }
    }
    if (error instanceof VoiceConfigurationError) return json({ error: error.message }, 503);
    if (error instanceof VoiceConnectionError) return json({ error: error.message }, 502);
    return apiError(error);
  }
}
