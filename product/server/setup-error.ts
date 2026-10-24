// A refusal caused by how this server is set up (a missing key, provider or address). The message is what a member, an
// API caller or an MCP client reads: plain words, never an environment variable, a path or a stack. The operator's hint
// (which variable to set) goes to the server log only, once per code. The registry passes `code` on in the refusal.
const logged = new Set<string>();

export class SetupError extends Error {
  constructor(message: string, public readonly code: string, hint: string) {
    super(message); this.name = 'SetupError';
    if (!logged.has(code)) { logged.add(code); console.warn(`[vp] setup: ${code}: ${hint}`); }
  }
}

/** What must never reach a member in a refusal or a result: an environment variable name, a server file path, a stack frame. */
export const SERVER_DETAIL = /\bVP_[A-Z][A-Z0-9_]+|(?:^|[\s(:'"`])\/(?:home|tmp|var|etc|opt|usr|root|srv|app)\/[\w./-]+|\bfile:\/\/\/|\n\s+at [^\n]+:\d+:\d+|\bat (?:async )?[\w.<>]+ \([^)]*:\d+:\d+\)/;

/** A refusal reason as a member may read it. A reason that carries server detail is logged and replaced with plain words. */
export function publicReason(reason: string, tool?: string): string {
  if (!SERVER_DETAIL.test(reason)) return reason;
  console.warn(`[vp] refusal of ${tool ?? 'a tool'} carried server detail and was replaced: ${reason}`);
  return 'This could not be done because of how the server is set up. The team that runs it has been told.';
}
