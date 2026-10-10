import { requireUser } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { getVoiceConfiguration } from "@/lib/voice/config";
import { HttpError } from "@/lib/server/http";
import type { VoiceProfile } from "@/lib/voice/contracts";
import { getRecord, listRecords } from "@/lib/platform/records";
import { continuousSpeechConfiguration } from "@/lib/voice/continuous-speech-authority";
import { parseLiveVoiceProfile, resolveAzureVoiceLiveVoice } from '@/lib/voice/live-voice';
import { azureVoiceLiveConfiguration } from '@/lib/voice/voice-live-session';
import { voiceLiveGatewayConfiguration } from '@/lib/voice/voice-live-authority';

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const query = new URL(request.url).searchParams;
    const releaseId = query.get("releaseId");
    if (releaseId && (query.has("profile") || query.has('liveVoice'))) throw new HttpError(400, "Choose a draft profile or an active release.");
    let liveVoice;
    if (query.has('liveVoice')) {
      const raw = query.get('liveVoice') || '';
      try { if (raw.length > 256) throw new Error(); liveVoice = parseLiveVoiceProfile(JSON.parse(raw)); }
      catch { throw new HttpError(400, 'Choose a supported live conversation voice.'); }
      if (query.get('profile') === 'maya-despina') throw new HttpError(400, 'Maya uses its own live voice configuration.');
    }
    let profile: VoiceProfile;
    if (releaseId) {
      if (releaseId.length > 100) throw new HttpError(400, "Invalid release identifier.");
      const release = await getRecord(user.organizationId, "release", releaseId);
      if (release.status !== "active" || release.data.channel !== "browser") throw new HttpError(409, "The browser release is no longer active.");
      const active = (await listRecords(user.organizationId, "release")).filter(item => item.status === "active" && item.data.agentId === release.data.agentId);
      if (active.length !== 1 || active[0].id !== release.id) throw new HttpError(409, "Agent release state changed. Refresh before calling.");
      const versionId = String(release.data.versionId || "");
      const version = await getRecord(user.organizationId, "agent_version", versionId);
      if (version.data.agentId !== release.data.agentId) throw new HttpError(409, "The browser release has an invalid agent version.");
      const config = version.data.config as { voiceProfile?: unknown; liveVoice?: { engine?: string } } | undefined;
      if (config?.liveVoice?.engine === 'azure-voice-live') throw new HttpError(409, 'Voice Live is available for internal draft tests only.');
      if (config?.liveVoice) {
        try { liveVoice = parseLiveVoiceProfile(config.liveVoice); }
        catch { throw new HttpError(409, 'This release has an invalid live voice selection.'); }
      }
      profile = config?.voiceProfile === "maya-despina" ? "maya-despina" : "provider-default";
    } else {
      const requested = query.get("profile") || "provider-default";
      if (requested !== "provider-default" && requested !== "maya-despina") throw new HttpError(400, "Choose a supported voice profile.");
      profile = requested;
    }
    if (liveVoice?.engine === 'azure-voice-live') {
      const gateway = voiceLiveGatewayConfiguration();
      let model: string | undefined;
      let configured = false;
      let reason = gateway.reason;
      try { model = azureVoiceLiveConfiguration().model; configured = gateway.configured; }
      catch { reason = 'Azure Voice Live needs the workspace Speech key and Foundry endpoint.'; }
      return Response.json({ configured, provider: 'azure', engine: 'azure-voice-live',
        label: `${liveVoice.preset === 'taxila-diya' ? 'Diya' : 'Arjun'} · Azure Voice Live`,
        voice: resolveAzureVoiceLiveVoice(liveVoice)?.name, model, ...(reason ? { reason } : {}),
        capabilities: { browserAudio: configured, transcription: configured, interruption: configured,
          toolExecution: false, telephony: false, liveHumanTransfer: false },
        continuousSpeech: { configured: false, reason: 'Live understanding is not yet available with this Voice Live preview.' },
      }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const configuration = getVoiceConfiguration(process.env, profile);
    if (liveVoice?.engine === 'azure-openai-realtime' && configuration.provider !== 'azure') {
      throw new HttpError(503, 'This agent requires Azure OpenAI Realtime. Configure the Azure workspace voice before testing.');
    }
    const speech = configuration.provider === 'azure' ? continuousSpeechConfiguration() : { configured: false };
    return Response.json({ ...configuration, continuousSpeech: { configured: speech.configured, ...(speech.reason ? { reason: speech.reason } : {}) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
