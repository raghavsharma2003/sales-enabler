// A local fake OpenID provider for tests: keys generated in-process, never a real IdP. It serves discovery, a JWKS,
// /authorize (issues a code bound to the request's nonce, PKCE challenge and redirect_uri, then redirects back) and
// /token (checks client_secret_basic, the code, the redirect_uri and the PKCE verifier, then signs an ID token).
// `next` shapes the person and the token of the next sign-in, so a test can ask for a wrong iss, aud, exp, nonce,
// alg or kid and watch the relying party refuse it.
import { createHash, createHmac, createSign, generateKeyPairSync, randomBytes, sign as cryptoSign, type KeyObject } from 'node:crypto';
import { createServer, type Server } from 'node:http';

export interface NextLogin {
  claims?: Record<string, unknown>;            // merged over the defaults (iss, aud, sub, email, email_verified, exp, iat, nonce)
  drop?: string[];                             // claims to remove
  alg?: 'RS256' | 'ES256' | 'none' | 'HS256';  // HS256 signs with the RSA public key as an HMAC secret (alg confusion)
  kid?: string;                                // a kid to put in the header instead of the real one
  tamper?: boolean;                            // flip a byte of the signature
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

export class FakeIdp {
  server!: Server;
  issuer = '';
  clientId = 'vp-test-client';
  clientSecret = 'synthetic-secret-' + randomBytes(8).toString('hex');
  next: NextLogin = {};
  person = { sub: 'user-1', email: 'alice@acme-test.example', name: 'Alice Test' };
  private rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
  private ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  private codes = new Map<string, { nonce: string; challenge: string; redirectUri: string; next: NextLogin; person: FakeIdp['person'] }>();
  tokenCalls = 0;

  async start(): Promise<this> {
    this.server = createServer((req, res) => this.handle(req.method ?? 'GET', new URL(req.url ?? '/', this.issuer || 'http://x'), req, res));
    await new Promise<void>(r => this.server.listen(0, '127.0.0.1', r));
    this.issuer = `http://127.0.0.1:${(this.server.address() as { port: number }).port}`;
    return this;
  }
  close() { this.server.close(); this.server.closeAllConnections?.(); }

  jwks() {
    return { keys: [
      { ...this.rsa.publicKey.export({ format: 'jwk' }), kid: 'rsa-1', alg: 'RS256', use: 'sig' },
      { ...this.ec.publicKey.export({ format: 'jwk' }), kid: 'ec-1', alg: 'ES256', use: 'sig' },
    ] };
  }

  /** Sign an ID token the way `n` asks. Exposed so verifier tests can build tokens directly. */
  token(claims: Record<string, unknown>, n: NextLogin = {}): string {
    const alg = n.alg ?? 'RS256';
    const kid = n.kid ?? (alg === 'ES256' ? 'ec-1' : 'rsa-1');
    const head = b64({ alg, typ: 'JWT', ...(alg === 'none' ? {} : { kid }) });
    const body = b64(Object.fromEntries(Object.entries(claims).filter(([k]) => !(n.drop ?? []).includes(k))));
    const data = `${head}.${body}`;
    let sig: Buffer;
    if (alg === 'none') sig = Buffer.alloc(0);
    else if (alg === 'HS256') sig = createHmac('sha256', this.rsa.publicKey.export({ format: 'pem', type: 'spki' })).update(data).digest();
    else if (alg === 'ES256') sig = cryptoSign('sha256', Buffer.from(data), { key: this.ec.privateKey as KeyObject, dsaEncoding: 'ieee-p1363' });
    else sig = createSign('sha256').update(data).sign(this.rsa.privateKey);
    if (n.tamper && sig.length) sig[sig.length - 1] ^= 1;
    return `${data}.${sig.toString('base64url')}`;
  }

  claimsFor(nonce: string, person = this.person, extra: Record<string, unknown> = {}) {
    const now = Math.floor(Date.now() / 1000);
    return { iss: this.issuer, aud: this.clientId, sub: person.sub, email: person.email, email_verified: true, name: person.name, iat: now, exp: now + 300, nonce, ...extra };
  }

  private handle(method: string, u: URL, req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) {
    const json = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (u.pathname === '/.well-known/openid-configuration') {
      return json(200, { issuer: this.issuer, authorization_endpoint: `${this.issuer}/authorize`, token_endpoint: `${this.issuer}/token`, jwks_uri: `${this.issuer}/jwks`,
        code_challenge_methods_supported: ['S256'], id_token_signing_alg_values_supported: ['RS256', 'ES256'], response_types_supported: ['code'] });
    }
    if (u.pathname === '/jwks') return json(200, this.jwks());
    if (u.pathname === '/authorize' && method === 'GET') {
      const p = u.searchParams;
      if (p.get('client_id') !== this.clientId || p.get('response_type') !== 'code' || p.get('code_challenge_method') !== 'S256' || !p.get('nonce') || !p.get('state')) {
        return json(400, { error: 'invalid_request' });
      }
      const code = randomBytes(16).toString('hex');
      this.codes.set(code, { nonce: p.get('nonce')!, challenge: p.get('code_challenge')!, redirectUri: p.get('redirect_uri')!, next: this.next, person: { ...this.person } });
      const back = new URL(p.get('redirect_uri')!);
      back.searchParams.set('code', code); back.searchParams.set('state', p.get('state')!);
      res.writeHead(302, { location: back.toString() }); return res.end();
    }
    if (u.pathname === '/token' && method === 'POST') {
      const chunks: Buffer[] = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        this.tokenCalls++;
        const f = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
        const basic = Buffer.from(String(req.headers.authorization ?? '').replace(/^Basic /, ''), 'base64').toString('utf8');
        if (basic !== `${encodeURIComponent(this.clientId)}:${encodeURIComponent(this.clientSecret)}`) return json(401, { error: 'invalid_client' });
        const c = this.codes.get(f.get('code') ?? '');
        this.codes.delete(f.get('code') ?? '');
        if (!c || f.get('grant_type') !== 'authorization_code' || f.get('redirect_uri') !== c.redirectUri) return json(400, { error: 'invalid_grant' });
        const verifier = f.get('code_verifier') ?? '';
        if (createHash('sha256').update(verifier).digest('base64url') !== c.challenge) return json(400, { error: 'invalid_grant' });
        json(200, { token_type: 'Bearer', access_token: 'synthetic', id_token: this.token(this.claimsFor(c.nonce, c.person, c.next.claims), c.next) });
      });
      return;
    }
    json(404, { error: 'not_found' });
  }
}
