import { createHash } from 'node:crypto';
import type { AuthUser } from '../../server/auth';
import { db } from '../../server/db';
import { HttpError } from '../../server/http';
import type { AgentConfig } from '../../platform/agents';
import { normalizeVoiceTools, type VoiceToolName } from './contracts';

export const VOICE_TOOL_MAX_DURATION_MS = 30 * 60 * 1000;
export type SourceAnchor = { id: string; kind: string; digest: string };
export type VoiceToolAuthority = {
  version: 1; contextDigest: string; enabledTools: VoiceToolName[];
  contactId?: string; memoryScope: string; sources: SourceAnchor[];
  expiresAt: string; identityVerified: false; contextMode: 'internal_operator_browser';
};
export type ToolRow = { id: string; kind: string; status: string | null; data: string; created_at: string };
export const sourceDigest = (row: ToolRow) => createHash('sha256').update(JSON.stringify([row.kind, row.status, row.data])).digest('hex');
export const rowData = (row: ToolRow): Record<string, any> => {
  const stored = JSON.parse(row.data);
  return row.kind.startsWith('platform:') ? stored.data : stored;
};
export async function readToolRow(user: AuthUser, kind: string, id: string): Promise<ToolRow | undefined> {
  const [row] = await (await db()).all('SELECT id,kind,status,data,created_at FROM entities WHERE organization_id = ? AND kind = ? AND id = ?', [user.organizationId, kind, id]);
  return row as ToolRow | undefined;
}

/** Only call with the server-validated compiled context, before issuing the connection. */
export async function buildVoiceToolAuthority(user: AuthUser, context: {
  agent: AgentConfig & { enabledTools?: VoiceToolName[] }; contextDigest: string;
  knowledgeSources: { id: string }[]; relationship: { sourceIds: string[] };
}, contactId?: string): Promise<VoiceToolAuthority> {
  const enabledTools = normalizeVoiceTools(context.agent.enabledTools);
  const sources: SourceAnchor[] = [];
  if (enabledTools.length) {
    for (const source of context.knowledgeSources) {
      const row = await readToolRow(user, 'platform:brain_source', source.id);
      if (!row || row.status !== 'approved') throw new HttpError(409, 'Approved call knowledge changed. Refresh the call.');
      sources.push({ id: row.id, kind: row.kind, digest: sourceDigest(row) });
    }
    if (contactId && context.agent.memoryScope === 'approved_contact') {
      for (const id of context.relationship.sourceIds) {
        const row = await readToolRow(user, 'memory', id) || await readToolRow(user, 'platform:commitment', id);
        if (!row || rowData(row).contactId !== contactId || row.status !== (row.kind === 'memory' ? 'approved' : 'open')) throw new HttpError(409, 'Approved relationship context changed. Refresh the call.');
        sources.push({ id: row.id, kind: row.kind, digest: sourceDigest(row) });
      }
    }
  }
  return { version: 1, contextDigest: context.contextDigest, enabledTools, contactId,
    memoryScope: context.agent.memoryScope, sources, expiresAt: new Date(Date.now() + VOICE_TOOL_MAX_DURATION_MS).toISOString(),
    identityVerified: false, contextMode: 'internal_operator_browser' };
}
