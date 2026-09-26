import { requireUser } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { getVoiceConfiguration } from "@/lib/voice/config";
import { HttpError } from "@/lib/server/http";
import type { VoiceProfile } from "@/lib/voice/contracts";
import { getRecord, listRecords } from "@/lib/platform/records";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const query = new URL(request.url).searchParams;
    const releaseId = query.get("releaseId");
    if (releaseId && query.has("profile")) throw new HttpError(400, "Choose a draft profile or an active release.");
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
      const config = version.data.config as { voiceProfile?: unknown } | undefined;
      profile = config?.voiceProfile === "maya-despina" ? "maya-despina" : "provider-default";
    } else {
      const requested = query.get("profile") || "provider-default";
      if (requested !== "provider-default" && requested !== "maya-despina") throw new HttpError(400, "Choose a supported voice profile.");
      profile = requested;
    }
    return Response.json(getVoiceConfiguration(process.env, profile), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
