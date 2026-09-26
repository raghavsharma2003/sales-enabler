import { normalizeAzureRealtimeEndpoint } from "./config";

export type AzureVoiceCheckStatus = "ready" | "needs-deployment" | "credentials-rejected" | "quota-unavailable" | "unavailable";
export interface AzureVoiceCheckResult {
  ready: boolean;
  provider: "azure";
  model: string;
  status: AzureVoiceCheckStatus;
  message: string;
  checkedAt: string;
}

/** Checks provisioning only. It does not create a WebRTC peer or generate speech. */
export async function checkAzureRealtimeDeployment(
  env: Record<string, string | undefined> = process.env,
  transport: typeof fetch = fetch,
): Promise<AzureVoiceCheckResult> {
  const model = env.AZURE_OPENAI_REALTIME_DEPLOYMENT?.trim() || "";
  const result = (status: AzureVoiceCheckStatus, message: string): AzureVoiceCheckResult => ({
    ready: status === "ready", provider: "azure", model, status, message, checkedAt: new Date().toISOString(),
  });
  if (env.VOICE_PROVIDER?.trim().toLowerCase() !== "azure") return result("unavailable", "Select Azure as the voice provider before checking its Realtime connection.");
  if (env.VOICE_TRANSPORT && env.VOICE_TRANSPORT !== "webrtc") return result("unavailable", "Set WebRTC as the Azure voice transport before checking Realtime access.");
  const base = normalizeAzureRealtimeEndpoint(env.AZURE_OPENAI_ENDPOINT);
  if (!base) return result("unavailable", "Set a valid Azure OpenAI resource endpoint before checking Realtime access.");
  if (!env.AZURE_OPENAI_API_KEY?.trim()) return result("unavailable", "Set the Azure OpenAI server API key before checking Realtime access.");
  if (!model) return result("needs-deployment", "Set the exact Azure Realtime deployment name before checking access.");
  try {
    const response = await transport(`${base}/realtime/client_secrets`, {
      method: "POST",
      headers: { "api-key": env.AZURE_OPENAI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: 10 },
        session: { type: "realtime", model },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 401 || response.status === 403) return result("credentials-rejected", "Azure rejected this resource's API key or access. Check the key and resource permissions.");
    if (response.status === 400 || response.status === 404 || response.status === 422) return result("needs-deployment", "Azure rejected Realtime provisioning for this deployment. Confirm it is an enabled Realtime model in a supported region and that the name matches exactly.");
    if (response.status === 429) return result("quota-unavailable", "Azure Realtime is at its usage or quota limit. Check deployment quota and retry later.");
    if (!response.ok) return result("unavailable", "Azure Realtime could not be checked right now. Try again later.");
    // Inspect only whether a secret exists; never return, log, or persist its value.
    const body = await response.json() as { value?: unknown };
    if (typeof body.value !== "string" || !body.value) return result("unavailable", "Azure did not issue a Realtime client secret. Check the deployment and retry.");
    return result("ready", "Azure accepted the deployment and issued a short-lived session secret. A browser call is still needed to verify speech.");
  } catch {
    return result("unavailable", "The Azure Realtime check could not reach the resource. Check the endpoint and network, then retry.");
  }
}
