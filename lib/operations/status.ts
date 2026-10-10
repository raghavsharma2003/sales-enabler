import type { AuthUser } from '../server/auth';
import { db, type Database } from '../server/db';

export type OperationsServiceId = 'private-voice-supervisor' | 'automation-worker' | 'channel-worker' | 'learning-worker';
export type OperationsServiceState = 'disabled' | 'fresh' | 'stale' | 'unknown';
export type OperationsDestination = 'Automations' | 'Deployments' | 'Quality';

export type OperationsServiceHealth = {
  id: OperationsServiceId;
  label: string;
  state: OperationsServiceState;
  lastHeartbeatAt: string | null;
  ageSeconds: number | null;
  freshnessSeconds: number;
  destination: OperationsDestination;
};

export type OperationsQueueSummary = {
  id: 'automation-schedules' | 'channel-replies' | 'learning-jobs';
  label: string;
  serviceId: Exclude<OperationsServiceId, 'private-voice-supervisor'>;
  count: number;
  oldestSavedAt: string | null;
  oldestAgeSeconds: number | null;
  destination: OperationsDestination;
};

export type OperationsStatus = {
  capturedAt: string;
  services: OperationsServiceHealth[];
  queues: OperationsQueueSummary[];
};

export type OperationsStatusDependencies = {
  database?: Database;
  env?: Record<string, string | undefined>;
  now?: () => Date;
};

type HeartbeatRow = { service: string; status: string; updated_at: string };
type QueueRow = { kind: string; total: number | string; oldest_created_at: string | null };

const SERVICE_DEFINITIONS: Array<{
  id: OperationsServiceId;
  label: string;
  healthyStatuses: readonly string[];
  freshnessSeconds: number;
  enabled: (env: Record<string, string | undefined>) => boolean;
  destination: OperationsDestination;
}> = [
  {
    id: 'private-voice-supervisor', label: 'Private voice supervisor', healthyStatuses: ['healthy'], freshnessSeconds: 30,
    enabled: () => true, destination: 'Deployments',
  },
  {
    id: 'automation-worker', label: 'Scheduled email worker', healthyStatuses: ['running'], freshnessSeconds: 120,
    enabled: env => env.AUTOMATION_WORKER_ENABLED === '1', destination: 'Automations',
  },
  {
    id: 'channel-worker', label: 'Channel reply worker', healthyStatuses: ['ready'], freshnessSeconds: 120,
    enabled: env => env.CHANNEL_WORKER_ENABLED === '1', destination: 'Deployments',
  },
  {
    id: 'learning-worker', label: 'Conversation learning worker', healthyStatuses: ['running'], freshnessSeconds: 120,
    enabled: env => env.LEARNING_WORKER_ENABLED === '1', destination: 'Deployments',
  },
];

const QUEUE_DEFINITIONS: Array<{
  id: OperationsQueueSummary['id'];
  label: string;
  kind: string;
  status: string;
  serviceId: OperationsQueueSummary['serviceId'];
  destination: OperationsDestination;
}> = [
  { id: 'automation-schedules', label: 'Enabled email schedules', kind: 'platform:automation_schedule', status: 'enabled', serviceId: 'automation-worker', destination: 'Automations' },
  { id: 'channel-replies', label: 'Channel replies waiting', kind: 'channel:job', status: 'queued', serviceId: 'channel-worker', destination: 'Deployments' },
  { id: 'learning-jobs', label: 'Learning jobs waiting', kind: 'learning:job', status: 'queued', serviceId: 'learning-worker', destination: 'Deployments' },
];

function timestamp(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function boundedAgeSeconds(nowMs: number, value: unknown): number | null {
  const parsed = timestamp(value);
  if (parsed === null || parsed > nowMs + 5_000) return null;
  return Math.max(0, Math.floor((nowMs - parsed) / 1_000));
}

function serviceHealth(
  definition: (typeof SERVICE_DEFINITIONS)[number],
  rows: HeartbeatRow[],
  env: Record<string, string | undefined>,
  nowMs: number,
): OperationsServiceHealth {
  const reports = rows.filter(row => row.service === definition.id);
  const valid = reports
    .map(row => ({ row, ageSeconds: boundedAgeSeconds(nowMs, row.updated_at), at: timestamp(row.updated_at) }))
    .filter((item): item is { row: HeartbeatRow; ageSeconds: number; at: number } => item.ageSeconds !== null && item.at !== null)
    .sort((left, right) => right.at - left.at);
  const fresh = valid.find(item => definition.healthyStatuses.includes(item.row.status) && item.ageSeconds <= definition.freshnessSeconds);
  const latest = fresh ?? valid[0];
  const enabled = definition.enabled(env);
  const state: OperationsServiceState = !enabled ? 'disabled' : fresh ? 'fresh' : valid.length ? 'stale' : 'unknown';
  return {
    id: definition.id,
    label: definition.label,
    state,
    lastHeartbeatAt: latest?.row.updated_at ?? null,
    ageSeconds: latest?.ageSeconds ?? null,
    freshnessSeconds: definition.freshnessSeconds,
    destination: definition.destination,
  };
}

/**
 * Returns process freshness and tenant-safe aggregate work counts. Heartbeats do
 * not establish provider delivery, and queue reads never select job payloads.
 */
export async function getOperationsStatus(user: AuthUser, dependencies: OperationsStatusDependencies = {}): Promise<OperationsStatus> {
  const database = dependencies.database ?? await db();
  const env = dependencies.env ?? process.env;
  const now = dependencies.now?.() ?? new Date();
  const nowMs = now.getTime();
  const [heartbeats, queueRows] = await Promise.all([
    database.all<HeartbeatRow>(
      'SELECT service,status,updated_at FROM service_heartbeats WHERE service IN (?,?,?,?)',
      SERVICE_DEFINITIONS.map(service => service.id),
    ),
    database.all<QueueRow>(
      `SELECT kind,COUNT(*) AS total,MIN(created_at) AS oldest_created_at
       FROM entities
       WHERE organization_id=? AND ((kind=? AND status=?) OR (kind=? AND status=?) OR (kind=? AND status=?))
       GROUP BY kind`,
      [
        user.organizationId,
        ...QUEUE_DEFINITIONS.flatMap(queue => [queue.kind, queue.status]),
      ],
    ),
  ]);
  const byKind = new Map(queueRows.map(row => [row.kind, row]));
  return {
    capturedAt: now.toISOString(),
    services: SERVICE_DEFINITIONS.map(definition => serviceHealth(definition, heartbeats, env, nowMs)),
    queues: QUEUE_DEFINITIONS.map(definition => {
      const row = byKind.get(definition.kind);
      const count = Number(row?.total ?? 0);
      const safeCount = Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
      const oldestAgeSeconds = safeCount ? boundedAgeSeconds(nowMs, row?.oldest_created_at) : null;
      return {
        id: definition.id,
        label: definition.label,
        serviceId: definition.serviceId,
        count: safeCount,
        oldestSavedAt: oldestAgeSeconds === null ? null : row?.oldest_created_at ?? null,
        oldestAgeSeconds,
        destination: definition.destination,
      };
    }),
  };
}
