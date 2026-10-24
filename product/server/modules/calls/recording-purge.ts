// Recordings are deleted on the voice runtime, not just hidden (DPDP: erasure reaches the audio). A call's recording is
// purged when the person asked to be erased (forget_request scope erase_me, or a contact intake erased in place), or when its workspace's recordings retention
// (policy.retention.get recordings_days) has passed since the call ended. The runtime deletes the file on a signed request
// that names the call and its workspace, and refuses another workspace's recording. The row is marked (and recording_uri
// cleared) only after the runtime confirmed the file is gone, so the job is idempotent and safe across restarts: a purge
// that failed, or was cut short, is simply tried again on the next run, and the runtime's purge is itself idempotent.
import type pg from 'pg';
import { many } from '../../db.ts';
import { runtime } from '../../runtime-client.ts';
import { retentionPolicy } from '../intake/retention.ts';

export type PurgeReason = 'retention' | 'erased';
const BATCH = 200;

/** Calls whose recording must go now, erasures first. */
async function due(pool: pg.Pool, workspaceId?: string): Promise<{ id: string; workspace_id: string; reason: PurgeReason }[]> {
  const erased = await many<{ id: string; workspace_id: string }>(pool,
    `SELECT cv.id, cv.workspace_id FROM conversation cv
     JOIN contact ct ON ct.id = cv.contact_id AND ct.workspace_id = cv.workspace_id
     WHERE cv.recording_uri IS NOT NULL AND ($1::uuid IS NULL OR cv.workspace_id = $1::uuid)
       AND (ct.erased_at IS NOT NULL OR EXISTS (SELECT 1 FROM forget_request f WHERE f.workspace_id = cv.workspace_id AND f.contact_id = cv.contact_id AND f.scope = 'erase_me'))
     LIMIT ${BATCH}`, [workspaceId ?? null]);
  const out: { id: string; workspace_id: string; reason: PurgeReason }[] = erased.map(r => ({ ...r, reason: 'erased' }));
  // Retention is per workspace: read each workspace's policy once, then its calls past the window.
  const wss = await many<{ workspace_id: string }>(pool,
    `SELECT DISTINCT workspace_id FROM conversation WHERE recording_uri IS NOT NULL AND ended_at IS NOT NULL AND ($1::uuid IS NULL OR workspace_id = $1::uuid)`, [workspaceId ?? null]);
  for (const { workspace_id } of wss) {
    if (out.length >= BATCH) break;
    const { policy } = await retentionPolicy(pool, workspace_id);
    const old = await many<{ id: string }>(pool,
      `SELECT id FROM conversation WHERE workspace_id = $1 AND recording_uri IS NOT NULL AND ended_at < now() - make_interval(days => $2)
       ORDER BY ended_at LIMIT ${BATCH}`, [workspace_id, policy.recordings_days]);
    for (const r of old) if (!out.some(o => o.id === r.id)) out.push({ id: r.id, workspace_id, reason: 'retention' });
  }
  return out.slice(0, BATCH);
}

/** One run of calls.recording_purge. Returns what happened, for the job log and tests. */
export async function purgeRecordings(pool: pg.Pool, opts: { workspaceId?: string } = {}): Promise<{ purged: number; failed: number }> {
  const rt = runtime();
  if (!rt.purgeRecording) return { purged: 0, failed: 0 };
  let purged = 0, failed = 0;
  for (const c of await due(pool, opts.workspaceId)) {
    const r = await rt.purgeRecording(c.id, c.workspace_id, c.reason);
    if (!r.ok) {
      // A pending erasure, never silent: the call page and erasure.pending show it until the runtime confirms.
      failed++;
      await pool.query(`UPDATE conversation SET recording_purge_tries = recording_purge_tries + 1, recording_purge_tried_at = now(), recording_purge_error = $3
        WHERE id = $1 AND workspace_id = $2`, [c.id, c.workspace_id, String(r.reason ?? 'the voice runtime did not confirm').slice(0, 300)]);
      console.warn(`[vp] recording purge of ${c.id} (${c.reason}) not confirmed, retried next run: ${r.reason ?? 'no reason'}`);
      continue;
    }
    await pool.query(`UPDATE conversation SET recording_uri = NULL, recording_purged_at = now(), recording_purge_reason = $3, recording_purge_error = NULL
      WHERE id = $1 AND workspace_id = $2 AND recording_uri IS NOT NULL`, [c.id, c.workspace_id, c.reason]);
    purged++;
  }
  return { purged, failed };
}
