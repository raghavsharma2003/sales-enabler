import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authenticate } from '../lib/server/auth';
import { HttpError } from '../lib/server/http';
import { handleAgentAction } from '../lib/platform/agents';
import type { PlatformRecord } from '../lib/platform/records';
import { changeDeploymentStatus, createDeployment, deploymentBrand, getPublicDeployment } from '../lib/deployments/engine';
import { PUBLICATION_ACKNOWLEDGEMENT } from '../lib/deployments/contracts';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
process.env.AZURE_OPENAI_ENDPOINT = 'https://fictional-resource.openai.azure.com';
process.env.AZURE_OPENAI_API_KEY = 'fictional-key-never-used';
const origin = 'https://brand.example.test';
const request = () => new Request('http://localhost:3000/api/test', { headers: { origin: 'http://localhost:3000' } });
function png(width = 64, height = 64) {
  const bytes = Buffer.alloc(24); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes); bytes.writeUInt32BE(13, 8); Buffer.from('IHDR').copy(bytes, 12); bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20);
  return `data:image/png;base64,${bytes.toString('base64')}`;
}
async function fixture(brand: Record<string, unknown>) {
  const user = (await authenticate({ mode: 'register', email: `${randomUUID()}@example.test`, password: 'fictional brand password', organization: 'Private workspace name' }, request())).user;
  const agent = await handleAgentAction(user, 'agent.create', { name: 'Public agent', role: 'AI representative', objective: 'Answer public questions.', disclosure: 'I am an AI assistant.', primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Clear.', memoryScope: 'none', escalation: 'Offer staff help.', knowledgeIds: [], enabledTools: [] }) as PlatformRecord;
  const version = await handleAgentAction(user, 'agent.version', { agentId: agent.id, revision: agent.revision }) as PlatformRecord;
  const testRun = await handleAgentAction(user, 'test.run', { versionId: version.id }) as PlatformRecord;
  const release = await handleAgentAction(user, 'release.publish', { versionId: version.id, testRunId: testRun.id, currentReleaseId: null }) as PlatformRecord;
  const deployment = await createDeployment(user, { name: 'Public deployment', agentId: agent.id, versionId: version.id, releaseId: release.id, channel: 'web_chat', publicKnowledgeIds: [], brand, allowedOrigins: [origin], limits: { enabled: true, maxSessionsPerDay: 10, maxTurnsPerConversation: 10, maxConcurrentSessions: 2, maxSessionSeconds: 300, maxSessionsPerIpHour: 2 }, allowUnknownInbound: false });
  return { user, deployment };
}

test('deployment brand freezes explicit sanitized public name, accent and raster logo', async () => {
  const logoDataUri = png(), f = await fixture({ name: 'Public Acme', welcomeMessage: 'Welcome to Public Acme.', accent: '#FFF200', onAccent: '#ffffff', logoDataUri, description: 'must not copy' });
  assert.deepEqual(f.deployment.data.brand, { name: 'Public Acme', welcomeMessage: 'Welcome to Public Acme.', accent: '#fff200', onAccent: '#242634', logoDataUri });
  const published = await changeDeploymentStatus(f.user, { deploymentId: f.deployment.id, revision: 1, action: 'publish', publicationAcknowledgement: PUBLICATION_ACKNOWLEDGEMENT });
  const view = await getPublicDeployment(published.data.publicId, origin);
  assert.deepEqual(view.brand, f.deployment.data.brand);
  assert.equal(JSON.stringify(view).includes('Private workspace name'), false);
  assert.equal('description' in view.brand, false);
});

test('deployment brand rejects invalid accents, remote/SVG logos and oversized raster data', () => {
  const base = { name: 'Public Acme', welcomeMessage: 'Welcome.' };
  for (const value of ['indigo', '#12345g', '#12345678']) assert.throws(() => deploymentBrand({ ...base, accent: value }), error => error instanceof HttpError && error.status === 400 && /accent/.test(error.message));
  for (const value of ['https://example.test/logo.png', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', `data:image/png;base64,${Buffer.alloc(256 * 1024 + 1).toString('base64')}`]) assert.throws(() => deploymentBrand({ ...base, logoDataUri: value }), error => error instanceof HttpError && error.status === 400);
});

test('legacy deployment brands retain the Relay fallback contract', async () => {
  assert.deepEqual(deploymentBrand({ name: 'Legacy company', welcomeMessage: 'Hello.' }), { name: 'Legacy company', welcomeMessage: 'Hello.' });
  const f = await fixture({ name: 'Legacy company', welcomeMessage: 'Hello.' });
  const published = await changeDeploymentStatus(f.user, { deploymentId: f.deployment.id, revision: 1, action: 'publish', publicationAcknowledgement: PUBLICATION_ACKNOWLEDGEMENT });
  assert.deepEqual((await getPublicDeployment(published.data.publicId, origin)).brand, { name: 'Legacy company', welcomeMessage: 'Hello.' });
});
