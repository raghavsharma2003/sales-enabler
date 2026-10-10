import { isAbsolute, resolve } from 'node:path';

type Environment = Record<string, string | undefined>;
export type ReadinessIssue = { code: string; variables: string[] };

/** Returns variable names only. Never return configuration values or provider errors. */
export function configurationIssues(env: Environment = process.env): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const add = (code: string, ...variables: string[]) => issues.push({ code, variables });
  const production = env.NODE_ENV === 'production';
  try {
    const url = new URL(env.APP_URL || '');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || (production && url.protocol !== 'https:' && !local)) throw new Error();
  } catch { add('invalid_app_origin', 'APP_URL'); }
  if (production && !/^[a-f\d]{64}$/i.test(env.CONNECTOR_ENCRYPTION_KEY || '')) add('invalid_connector_key', 'CONNECTOR_ENCRYPTION_KEY');
  const verificationRequired = env.AUTH_REQUIRE_EMAIL_VERIFICATION === 'true' || (production && env.AUTH_REQUIRE_EMAIL_VERIFICATION !== 'false');
  if (env.AUTH_REQUIRE_EMAIL_VERIFICATION && !['true', 'false'].includes(env.AUTH_REQUIRE_EMAIL_VERIFICATION)) add('invalid_auth_verification_flag', 'AUTH_REQUIRE_EMAIL_VERIFICATION');
  if ((production || verificationRequired) && !/^[a-f\d]{64}$/i.test(env.AUTH_LIFECYCLE_KEY || '')) add('invalid_auth_lifecycle_key', 'AUTH_LIFECYCLE_KEY');
  let localAccountOutbox = false;
  try {
    const origin = new URL(env.APP_URL || '');
    localAccountOutbox = env.NODE_ENV === 'development' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) && !!env.AUTH_DEV_MAIL_OUTBOX && isAbsolute(env.AUTH_DEV_MAIL_OUTBOX);
    if (verificationRequired && !localAccountOutbox && origin.protocol !== 'https:') add('account_email_https_required', 'APP_URL');
  } catch { /* APP_URL already reports its own failure. */ }
  const mailVariables = ['AZURE_COMMUNICATION_EMAIL_ENDPOINT', 'AZURE_COMMUNICATION_EMAIL_ACCESS_KEY', 'AZURE_COMMUNICATION_EMAIL_SENDER'];
  if (!localAccountOutbox && (verificationRequired || mailVariables.some(name => !!env[name]))) {
    for (const name of mailVariables) if (!env[name]) add('missing_account_email_configuration', name);
    if (env.AZURE_COMMUNICATION_EMAIL_ENDPOINT) {
      try {
        const endpoint = new URL(env.AZURE_COMMUNICATION_EMAIL_ENDPOINT);
        if (endpoint.protocol !== 'https:' || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)?\.communication[s]?\.azure\.com$/.test(endpoint.hostname) || endpoint.port || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) throw new Error();
      } catch { add('invalid_account_email_endpoint', 'AZURE_COMMUNICATION_EMAIL_ENDPOINT'); }
    }
    const accessKey = env.AZURE_COMMUNICATION_EMAIL_ACCESS_KEY;
    if (accessKey && (!/^[A-Za-z0-9+/]+={0,2}$/.test(accessKey) || Buffer.from(accessKey, 'base64').length < 32)) add('invalid_account_email_key', 'AZURE_COMMUNICATION_EMAIL_ACCESS_KEY');
    if (env.AZURE_COMMUNICATION_EMAIL_SENDER && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.AZURE_COMMUNICATION_EMAIL_SENDER)) add('invalid_account_email_sender', 'AZURE_COMMUNICATION_EMAIL_SENDER');
  }
  if (env.DATABASE_URL) {
    try {
      const url = new URL(env.DATABASE_URL);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) throw new Error();
      if (production && !['localhost', '127.0.0.1', 'postgres'].includes(url.hostname) && !['verify-full', 'verify-ca', 'require'].includes(url.searchParams.get('sslmode') || '')) add('database_tls_required', 'DATABASE_URL');
    } catch { add('invalid_database_url', 'DATABASE_URL'); }
  } else if (production && env.ALLOW_SQLITE_PRODUCTION !== '1') add('postgresql_required', 'DATABASE_URL');
  const provider = env.VOICE_PROVIDER || 'none';
  if (!['none', 'azure'].includes(provider)) add('paid_provider_policy', 'VOICE_PROVIDER');
  const backgroundInference = env.LEARNING_WORKER_ENABLED === '1' || env.CHANNEL_WORKER_ENABLED === '1';
  if (provider === 'azure' || env.AZURE_OPENAI_API_KEY || env.AZURE_OPENAI_ENDPOINT || backgroundInference) {
    for (const name of ['AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', ...(provider === 'azure' ? ['AZURE_OPENAI_REALTIME_DEPLOYMENT'] : []), ...(backgroundInference ? ['AZURE_OPENAI_TEXT_DEPLOYMENT'] : [])]) {
      if (!env[name]?.trim()) add('missing_provider_configuration', name);
    }
    if (env.AZURE_OPENAI_ENDPOINT) {
      try { if (new URL(env.AZURE_OPENAI_ENDPOINT).protocol !== 'https:') throw new Error(); }
      catch { add('invalid_provider_endpoint', 'AZURE_OPENAI_ENDPOINT'); }
    }
  }
  for (const [id, secret] of [['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET']]) {
    if (!!env[id] !== !!env[secret]) add('incomplete_oauth_configuration', id, secret);
  }
  if (env.AUTOMATION_WORKER_ENABLED && !['0', '1'].includes(env.AUTOMATION_WORKER_ENABLED)) add('invalid_worker_flag', 'AUTOMATION_WORKER_ENABLED');
  if (env.CHANNEL_WORKER_ENABLED && !['0', '1'].includes(env.CHANNEL_WORKER_ENABLED)) add('invalid_worker_flag', 'CHANNEL_WORKER_ENABLED');
  if (env.LEARNING_WORKER_ENABLED && !['0', '1'].includes(env.LEARNING_WORKER_ENABLED)) add('invalid_worker_flag', 'LEARNING_WORKER_ENABLED');
  if (env.PUBLIC_VOICE_GATEWAY_URL) {
    try {
      const url = new URL(env.PUBLIC_VOICE_GATEWAY_URL);
      if (url.username || url.password || url.search || url.hash || url.pathname !== '/voice' || (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error();
    } catch { add('invalid_public_voice_gateway', 'PUBLIC_VOICE_GATEWAY_URL'); }
    if ((env.PUBLIC_SESSION_HASH_SECRET || '').length < 32) add('missing_public_session_secret', 'PUBLIC_SESSION_HASH_SECRET');
  }
  return issues;
}

export type DatabaseProbe = (requireWorker: boolean, requireChannelWorker?: boolean, requireLearningWorker?: boolean) => Promise<boolean>;
const schemaQuery = `SELECT o.id,u.password_hash,u.organization_id,s.token_hash,s.expires_at,
  e.id,e.organization_id,e.kind,e.data,a.id,a.event,h.id,h.service,h.status,h.updated_at,
  v.id,v.organization_id,v.mime_type,v.byte_count,v.sha256,v.duration_ms,v.sample_rate_hz,v.channels,v.bytes,v.created_at,v.expires_at
  FROM organizations o CROSS JOIN users u CROSS JOIN auth_sessions s
  CROSS JOIN entities e CROSS JOIN audit_events a CROSS JOIN service_heartbeats h
  CROSS JOIN evaluation_audio_artifacts v LIMIT 0`;

/** Read-only checks: a probe cannot initialize or migrate the application store. */
export async function probeDatabase(requireWorker = false, requireChannelWorker = false, requireLearningWorker = false): Promise<boolean> {
  const cutoff = new Date(Date.now() - 120_000).toISOString();
  const workerService = requireLearningWorker ? 'learning-worker' : requireChannelWorker ? 'channel-worker' : 'automation-worker';
  const workerStatus = requireChannelWorker ? 'ready' : 'running';
  if (process.env.DATABASE_URL) {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 2000, query_timeout: 2500, statement_timeout: 2500 });
    pool.on('error', () => {}); // Never forward connection strings or server error details.
    try {
      await pool.query(schemaQuery);
      return !(requireWorker || requireChannelWorker || requireLearningWorker) || (await pool.query('SELECT 1 FROM service_heartbeats WHERE service=$1 AND status=$2 AND updated_at >= $3 LIMIT 1', [workerService, workerStatus, cutoff])).rowCount === 1;
    } finally { await pool.end(); }
  }
  const { DatabaseSync } = await import('node:sqlite');
  const database = new DatabaseSync(process.env.SQLITE_PATH || resolve(process.cwd(), 'data/workspace.sqlite'), { readOnly: true });
  try {
    database.exec('PRAGMA busy_timeout = 1000');
    database.prepare(schemaQuery).all();
    return !(requireWorker || requireChannelWorker || requireLearningWorker) || !!database.prepare('SELECT 1 FROM service_heartbeats WHERE service=? AND status=? AND updated_at >= ? LIMIT 1').get(workerService, workerStatus, cutoff);
  } finally { database.close(); }
}

export async function checkReadiness(options: { env?: Environment; probe?: DatabaseProbe; requireWorker?: boolean; requireChannelWorker?: boolean; requireLearningWorker?: boolean } = {}) {
  const issues = configurationIssues(options.env);
  if (issues.length) return { ready: false, issues };
  try {
    if (!await (options.probe || probeDatabase)(options.requireWorker === true, options.requireChannelWorker === true, options.requireLearningWorker === true)) issues.push({ code: options.requireLearningWorker ? 'learning_worker_unavailable' : options.requireChannelWorker ? 'channel_worker_unavailable' : 'worker_unavailable', variables: [] });
  } catch { issues.push({ code: 'database_unavailable', variables: [] }); }
  return { ready: issues.length === 0, issues };
}
