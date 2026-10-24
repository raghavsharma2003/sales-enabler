// VP_LLM_<PURPOSE>_AUTH=vertex: the server mints its own Vertex token from VERTEX_SA_FILE (server/vertex-token.ts), as
// the voice runtime does, so a purpose such as brief_review can run on Vertex without a static key that dies after an
// hour. A local HTTP server plays both Google's token endpoint and the model.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { complete, llmKeysConfigured } from '../server/llm.ts';
import { forgetVertexTokens, vertexToken } from '../server/vertex-token.ts';

let server: Server; let base = ''; let dir = '';
const seen = { mints: 0, auth: [] as string[] };
const saved = { ...process.env };

before(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      if (req.url === '/token') {
        assert.match(body, /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=[\w-]+\.[\w-]+\.[\w-]+/);
        seen.mints++;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ access_token: `ya29.fake-${seen.mints}`, expires_in: 3600 }));
        return;
      }
      seen.auth.push(String(req.headers.authorization));
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: '{"findings": []}' } }], usage: { prompt_tokens: 10, completion_tokens: 2 }, model: 'google/flash-lite-fake' }));
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  dir = mkdtempSync(join(tmpdir(), 'vp-vertex-'));
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  writeFileSync(join(dir, 'sa.json'), JSON.stringify({ type: 'service_account', client_email: 'review@vp-test.example.test', private_key_id: 'k1',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: `${base}/token` }));
});
afterEach(() => { process.env = { ...saved }; forgetVertexTokens(); });
after(async () => { await new Promise(r => server.close(r)); rmSync(dir, { recursive: true, force: true }); });

function vertexEnv(region = 'centralindia') {
  for (const k of Object.keys(process.env)) if (/^VP_LLM_(BRIEF_REVIEW|DEFAULT)_/.test(k)) delete process.env[k];
  Object.assign(process.env, { VP_LLM_BRIEF_REVIEW_URL: `${base}/v1/chat/completions`, VP_LLM_BRIEF_REVIEW_MODEL: 'google/flash-lite-fake',
    VP_LLM_BRIEF_REVIEW_AUTH: 'vertex', VERTEX_SA_FILE: join(dir, 'sa.json'), VP_REGION: region });
}

test('vertex auth: configured without a static key, only from India', () => {
  vertexEnv();
  assert.equal(llmKeysConfigured('brief_review'), true);
  vertexEnv('eastus');
  assert.equal(llmKeysConfigured('brief_review'), false, 'Agent Platform is called only from India');
});

test('vertex auth: the token is minted, cached, and minted again after it expires', async () => {
  vertexEnv(); seen.mints = 0; seen.auth = [];
  const ask = () => complete({ purpose: 'brief_review', json: true, messages: [{ role: 'user', content: 'x' }] });
  await ask(); await ask();
  vertexToken()!.exp = 0;                       // the token has expired
  await ask();
  assert.equal(seen.mints, 2);
  assert.deepEqual(seen.auth, ['Bearer ya29.fake-1', 'Bearer ya29.fake-1', 'Bearer ya29.fake-2']);
});

test('a static key works as before when AUTH is not vertex', async () => {
  vertexEnv(); delete process.env.VP_LLM_BRIEF_REVIEW_AUTH;
  assert.equal(llmKeysConfigured('brief_review'), false);
  process.env.VP_LLM_BRIEF_REVIEW_KEY = 'static-key'; seen.auth = [];
  await complete({ purpose: 'brief_review', messages: [{ role: 'user', content: 'x' }] });
  assert.deepEqual(seen.auth, ['Bearer static-key']);
});
