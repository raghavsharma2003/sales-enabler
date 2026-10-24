// A Vertex (Google Cloud) OAuth token minted from a service-account file, for an LLM purpose that sets
// VP_LLM_<PURPOSE>_AUTH=vertex (llm.ts). Same scheme as the voice runtime's providers/google.py VertexToken: an RS256
// JWT bearer grant, cached until 5 minutes before it expires, and refused outside India (Agent Platform is called only
// from India). A static key lasts about an hour (rejected.2026-10-24.runtime-judge-static-vertex-token).
import { createSign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

const INDIA_REGIONS = new Set(['centralindia', 'southindia', 'westindia', 'jioindiacentral', 'jioindiawest', 'india', 'in', 'asia-south1', 'asia-south2']);

interface ServiceAccount { client_email: string; private_key: string; private_key_id?: string; token_uri: string }

export class VertexToken {
  private tok: string | null = null;
  exp = 0;                                   // epoch seconds; tests set it to force a refresh
  private pending: Promise<string> | null = null;
  constructor(readonly sa: ServiceAccount) {}

  async get(): Promise<string> {
    if (this.tok && Date.now() / 1000 < this.exp - 300) return this.tok;
    this.pending ??= this.mint().finally(() => { this.pending = null; });
    return this.pending;
  }

  private async mint(): Promise<string> {
    const b64 = (x: string | Buffer) => Buffer.from(x).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT', ...(this.sa.private_key_id ? { kid: this.sa.private_key_id } : {}) }));
    const claim = b64(JSON.stringify({ iss: this.sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: this.sa.token_uri, iat: now, exp: now + 3600 }));
    const sig = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(this.sa.private_key);
    const res = await fetch(this.sa.token_uri, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${b64(sig)}` }) });
    if (!res.ok) throw new Error(`Vertex token request answered ${res.status}`);
    const d = await res.json() as { access_token: string; expires_in?: number };
    this.tok = d.access_token; this.exp = Date.now() / 1000 + Number(d.expires_in ?? 3600);
    return this.tok;
  }
}

const cache = new Map<string, VertexToken>();
const refusedLogged = new Set<string>();

/** The token source for this server, or null (with one logged reason) when there is no usable Vertex route. */
export function vertexToken(env: NodeJS.ProcessEnv = process.env): VertexToken | null {
  const path = env.VERTEX_SA_FILE;
  const why = !path || !existsSync(path) ? 'no VERTEX_SA_FILE' : env.VERTEX_OFF === '1' ? 'VERTEX_OFF=1'
    : !INDIA_REGIONS.has((env.VP_REGION ?? '').trim().toLowerCase()) ? `VP_REGION=${env.VP_REGION ?? ''} is not an Indian region; Agent Platform is called only from India` : null;
  if (why) { if (!refusedLogged.has(why)) { refusedLogged.add(why); console.warn(`[vp] Vertex route refused: ${why}`); } return null; }
  let t = cache.get(path!);
  if (!t) { t = new VertexToken(JSON.parse(readFileSync(path!, 'utf8')) as ServiceAccount); cache.set(path!, t); }
  return t;
}

/** Tests: forget cached tokens. */
export function forgetVertexTokens(): void { cache.clear(); }
