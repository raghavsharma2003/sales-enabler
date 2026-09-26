import { isVoiceToolName, normalizeVoiceTools, type VoiceToolName } from "./tools/contracts";
import type { VoiceToolCall } from "./contracts";

export interface ClientToolScope {
  connectionId?: string;
  previewId?: string;
  enabledTools?: string[];
}

export type ClientToolOutput = Record<string, unknown>;

/** The browser only transports calls to the fixed same-origin endpoint. Authority lives on the server. */
export function createClientToolRunner(scope: ClientToolScope, parentSignal: AbortSignal, transport: typeof fetch = fetch) {
  const enabled = new Set(normalizeVoiceTools(scope.enabledTools));
  const scopeId = scope.connectionId && !scope.previewId ? { connectionId: scope.connectionId }
    : scope.previewId && !scope.connectionId ? { previewId: scope.previewId } : null;
  const pending = new Map<string, { controller: AbortController; promise: Promise<ClientToolOutput> }>();
  let ended = false;
  const unavailable = (): ClientToolOutput => ({ status: "not_available", message: "That in-call action is unavailable." });

  function run(call: VoiceToolCall): Promise<ClientToolOutput> {
    if (ended || !scopeId || !/^[A-Za-z0-9_-]{1,128}$/.test(call.id) || !isVoiceToolName(call.name) || !enabled.has(call.name)) return Promise.resolve(unavailable());
    const existing = pending.get(call.id);
    if (existing) return existing.promise;
    let args: unknown = call.arguments;
    if (typeof args === "string") {
      if (args.length > 12_000) return Promise.resolve(unavailable());
      try { args = JSON.parse(args); } catch { return Promise.resolve(unavailable()); }
    }
    if (!args || typeof args !== "object" || Array.isArray(args) || JSON.stringify(args).length > 12_000) return Promise.resolve(unavailable());
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, parentSignal, AbortSignal.timeout(15_000)]);
    const name = call.name as VoiceToolName;
    const promise = (async (): Promise<ClientToolOutput> => {
      try {
        const response = await transport("/api/voice/tools", {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", signal,
          body: JSON.stringify({ ...scopeId, requestId: `voice-${call.id}`, name, arguments: args }),
        });
        if (ended || signal.aborted || !response.ok) return unavailable();
        const body = await response.text();
        if (body.length > 20_000) return unavailable();
        const output = JSON.parse(body) as unknown;
        if (!output || typeof output !== "object" || Array.isArray(output)) return unavailable();
        const result = output as ClientToolOutput;
        if (result.status !== "available" && result.status !== "not_available" && result.status !== "awaiting_review") return unavailable();
        return result;
      } catch { return unavailable(); }
    })();
    pending.set(call.id, { controller, promise });
    return promise;
  }

  function cancel(ids: string[]) {
    for (const id of ids) pending.get(id)?.controller.abort();
  }

  function close() {
    if (ended) return;
    ended = true;
    for (const { controller } of pending.values()) controller.abort();
    pending.clear();
    if (scopeId && enabled.size) {
      // Best effort revocation; the server also enforces a short authority expiry.
      void transport("/api/voice/tools", { method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin", keepalive: true, body: JSON.stringify({ action: "end", ...scopeId }) }).catch(() => {});
    }
  }

  return { run, cancel, close, enabled: enabled.size > 0 && !!scopeId };
}
