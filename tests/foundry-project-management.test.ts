import test from 'node:test';
import assert from 'node:assert/strict';
import { manageFoundryProject } from '../scripts/manage-foundry-project.mjs';

const settings = {
  AZURE_TENANT_ID: '11111111-1111-1111-1111-111111111111',
  AZURE_CLIENT_ID: '22222222-2222-2222-2222-222222222222',
  AZURE_CLIENT_SECRET: 'fixture-secret-never-log-this',
  AZURE_SUBSCRIPTION_ID: '33333333-3333-3333-3333-333333333333',
  AZURE_RESOURCE_GROUP: 'startup-ai',
  AZURE_FOUNDRY_ACCOUNT_NAME: 'startup-foundry',
};
const token = 'fixture-access-token-never-log-this';
const accountPath = `/subscriptions/${settings.AZURE_SUBSCRIPTION_ID}/resourceGroups/${settings.AZURE_RESOURCE_GROUP}/providers/Microsoft.CognitiveServices/accounts/${settings.AZURE_FOUNDRY_ACCOUNT_NAME}`;
const projectPath = `${accountPath}/projects/sales-enabler`;

const account = (overrides = {}) => ({
  id: accountPath,
  name: settings.AZURE_FOUNDRY_ACCOUNT_NAME,
  type: 'Microsoft.CognitiveServices/accounts',
  kind: 'AIServices',
  location: 'centralindia',
  properties: { allowProjectManagement: true, provisioningState: 'Succeeded' },
  ...overrides,
});
const project = (state = 'Succeeded') => ({
  id: projectPath,
  name: 'sales-enabler',
  type: 'Microsoft.CognitiveServices/accounts/projects',
  location: 'centralindia',
  properties: { displayName: 'sales-enabler', provisioningState: state },
});

function azureMock(handler: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  return (async (input: URL | RequestInfo, init: RequestInit = {}) => {
    const url = new URL(String(input));
    assert.equal(init.redirect, 'error');
    if (url.hostname === 'login.microsoftonline.com') {
      assert.equal(init.method, 'POST');
      const form = new URLSearchParams(String(init.body));
      assert.equal(form.get('scope'), 'https://management.azure.com/.default');
      return Response.json({ access_token: token });
    }
    assert.equal(url.hostname, 'management.azure.com');
    assert.equal(new Headers(init.headers).get('Authorization'), `Bearer ${token}`);
    return handler(url, init);
  }) as typeof fetch;
}

test('missing, invalid, and endpoint-injection configuration never contacts the network', async () => {
  let calls = 0;
  const fetcher = (async () => { calls += 1; throw new Error('must not run'); }) as typeof fetch;
  const missing = await manageFoundryProject({}, { fetcher });
  assert.equal(missing.stage, 'configuration');
  assert.ok('missingVariables' in missing);
  assert.ok(missing.missingVariables?.includes('AZURE_RESOURCE_GROUP'));
  assert.ok(missing.missingVariables?.includes('AZURE_FOUNDRY_ACCOUNT_NAME'));

  for (const [key, value] of [
    ['AZURE_TENANT_ID', 'evil.example/steal'],
    ['AZURE_RESOURCE_GROUP', '../other?api-version=evil'],
    ['AZURE_FOUNDRY_ACCOUNT_NAME', 'good/../../steal'],
  ]) {
    const result = await manageFoundryProject({ ...settings, [key]: value }, { create: true, fetcher });
    assert.ok('invalidVariables' in result);
    assert.deepEqual(result.invalidVariables, [key]);
  }
  assert.equal(calls, 0);
});

test('default mode reads the exact account and missing target without mutation', async () => {
  const methods: string[] = [];
  const fetcher = azureMock((url, init) => {
    methods.push(String(init.method));
    assert.equal(url.searchParams.get('api-version'), '2025-06-01');
    if (url.pathname === accountPath) return Response.json(account());
    assert.equal(url.pathname, projectPath);
    return Response.json({ secret: settings.AZURE_CLIENT_SECRET }, { status: 404 });
  });
  const result = await manageFoundryProject(settings, { fetcher });
  assert.equal(result.ok, true);
  assert.equal(result.action, 'none');
  assert.equal(result.project.exists, false);
  assert.equal(result.creationAuthorized, false);
  assert.deepEqual(methods, ['GET', 'GET']);
  assert.doesNotMatch(JSON.stringify(result), /fixture-|33333333|startup-foundry|startup-ai/);
});

test('an existing project is never overwritten and in-progress is not reported ready', async () => {
  let puts = 0;
  const fetcher = azureMock((url, init) => {
    if (init.method === 'PUT') puts += 1;
    if (url.pathname === accountPath) return Response.json(account());
    return Response.json(project('Creating'));
  });
  const result = await manageFoundryProject(settings, { create: true, fetcher });
  assert.equal(result.ok, true);
  assert.equal(result.action, 'none');
  assert.ok(result.project && 'provisioningState' in result.project);
  assert.equal(result.project?.provisioningState, 'Creating');
  assert.equal(result.project?.ready, false);
  assert.equal(puts, 0);
});

test('ARM qualified child names are accepted only for the expected account and project', async () => {
  for (const name of ['sales-enabler', `${settings.AZURE_FOUNDRY_ACCOUNT_NAME}/sales-enabler`, 'unrelated-account/sales-enabler']) {
    let puts = 0;
    const result = await manageFoundryProject(settings, { create: true, fetcher: azureMock((url, init) => {
      if (init.method === 'PUT') puts++;
      if (url.pathname === accountPath) return Response.json(account());
      return Response.json({ ...project(), name });
    }) });
    assert.equal(result.ok, !name.startsWith('unrelated-account/'));
    assert.equal(puts, 0);
    if (result.ok) assert.equal(result.project?.ready, true);
  }
});

test('provider-controlled provisioning states are reduced to a safe allowlist', async () => {
  const sentinel = 'provider-secret-sentinel';
  const result = await manageFoundryProject(settings, { fetcher: azureMock((url) => {
    if (url.pathname === accountPath) return Response.json(account({
      properties: { allowProjectManagement: true, provisioningState: sentinel },
    }));
    return Response.json(project(sentinel));
  }) });
  assert.equal(result.account?.provisioningState, 'unknown');
  assert.ok(result.project && 'provisioningState' in result.project);
  assert.equal(result.project?.provisioningState, 'unknown');
  assert.equal(result.project?.ready, false);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(sentinel));
});

test('explicit create uses only the bounded child PUT and the account actual location', async () => {
  const calls: Array<{ path: string; method: string }> = [];
  const fetcher = azureMock((url, init) => {
    calls.push({ path: url.pathname, method: String(init.method) });
    if (url.pathname === accountPath) return Response.json(account({ location: 'South India' }));
    if (init.method === 'GET') return Response.json({ ignored: 'private-provider-body' }, { status: 404 });
    assert.equal(url.pathname, projectPath);
    assert.equal(new Headers(init.headers).get('If-None-Match'), '*');
    assert.deepEqual(JSON.parse(String(init.body)), {
      location: 'South India',
      identity: { type: 'SystemAssigned' },
      properties: { displayName: 'sales-enabler' },
    });
    return Response.json(project(), { status: 201 });
  });
  const result = await manageFoundryProject(settings, { create: true, fetcher });
  assert.equal(result.ok, true);
  assert.equal(result.action, 'created');
  assert.equal(result.outcome, 'succeeded');
  assert.deepEqual(calls, [
    { path: accountPath, method: 'GET' },
    { path: projectPath, method: 'GET' },
    { path: projectPath, method: 'PUT' },
  ]);
});

test('PUT 200 confirms the target without claiming it was newly created', async () => {
  const result = await manageFoundryProject(settings, { create: true, fetcher: azureMock((url, init) => {
    if (url.pathname === accountPath) return Response.json(account());
    if (init.method === 'GET') return Response.json({}, { status: 404 });
    return Response.json(project(), { status: 200 });
  }) });
  assert.equal(result.ok, true);
  assert.equal(result.action, 'create-confirmed');
  assert.equal(result.outcome, 'succeeded');
});

test('authentication, account readiness, and non-404 project errors cannot create', async () => {
  let puts = 0;
  const identityFailure = await manageFoundryProject(settings, {
    create: true,
    fetcher: async () => Response.json({ error_description: settings.AZURE_CLIENT_SECRET }, { status: 401 }),
  });
  assert.deepEqual(identityFailure, { ok: false, stage: 'identity', httpStatus: 401 });

  const notReady = await manageFoundryProject(settings, { create: true, fetcher: azureMock((url, init) => {
    if (init.method === 'PUT') puts += 1;
    if (url.pathname === accountPath) return Response.json(account({
      properties: { allowProjectManagement: false, provisioningState: 'Succeeded' },
    }));
    return Response.json({}, { status: 404 });
  }) });
  assert.equal(notReady.stage, 'account-readiness');
  assert.equal(notReady.mutationAttempted, false);

  const forbidden = await manageFoundryProject(settings, { create: true, fetcher: azureMock((url, init) => {
    if (init.method === 'PUT') puts += 1;
    if (url.pathname === accountPath) return Response.json(account());
    return Response.json({ providerSecret: settings.AZURE_CLIENT_SECRET }, { status: 403 });
  }) });
  assert.equal(forbidden.stage, 'project-read');
  assert.equal(forbidden.httpStatus, 403);
  assert.equal(forbidden.mutationAttempted, false);
  assert.equal(puts, 0);
  assert.doesNotMatch(JSON.stringify([identityFailure, notReady, forbidden]), /fixture-|providerSecret/);
});

test('transport, malformed 2xx, and server-error creates are uncertain and never retried', async () => {
  const cases = [
    {
      name: 'transport',
      response: () => { throw new Error(`network failed with ${settings.AZURE_CLIENT_SECRET}`); },
      expectedStatus: undefined,
    },
    {
      name: 'malformed-201',
      response: () => new Response(`not-json-${settings.AZURE_CLIENT_SECRET}`, { status: 201 }),
      expectedStatus: 201,
    },
    {
      name: 'server-500',
      response: () => Response.json({ providerSecret: settings.AZURE_CLIENT_SECRET }, { status: 500 }),
      expectedStatus: 500,
    },
  ];
  for (const fixture of cases) {
    let puts = 0;
    const fetcher = azureMock((url, init) => {
      if (url.pathname === accountPath) return Response.json(account());
      if (init.method === 'GET') return Response.json({}, { status: 404 });
      puts += 1;
      return fixture.response();
    });
    const result = await manageFoundryProject(settings, { create: true, fetcher });
    assert.equal(result.ok, false, fixture.name);
    assert.equal(result.stage, 'project-create', fixture.name);
    assert.equal(result.outcome, 'uncertain', fixture.name);
    assert.equal(result.mutationAttempted, true, fixture.name);
    assert.equal(result.httpStatus, fixture.expectedStatus, fixture.name);
    assert.equal(puts, 1, fixture.name);
    assert.doesNotMatch(JSON.stringify(result), /fixture-|providerSecret/, fixture.name);
  }
});

test('202 performs one same-origin target read and reports pending unless it is ready', async () => {
  for (const [state, expectedOutcome] of [['Creating', 'pending'], ['Succeeded', 'succeeded']] as const) {
    let projectGets = 0;
    let puts = 0;
    const fetcher = azureMock((url, init) => {
      if (url.pathname === accountPath) return Response.json(account());
      if (init.method === 'PUT') {
        puts += 1;
        return new Response(state === 'Creating' ? null : JSON.stringify({ providerLocation: 'https://evil.example/poll' }), {
          status: 202,
          headers: state === 'Creating'
            ? { Location: 'https://evil.example/poll' }
            : { Location: 'https://evil.example/poll', 'Content-Type': 'application/json' },
        });
      }
      projectGets += 1;
      return projectGets === 1 ? Response.json({}, { status: 404 }) : Response.json(project(state));
    });
    const result = await manageFoundryProject(settings, { create: true, fetcher });
    assert.equal(result.outcome, expectedOutcome);
    assert.ok(result.project);
    assert.equal(result.project?.ready, state === 'Succeeded');
    assert.equal(projectGets, 2);
    assert.equal(puts, 1);
  }
});

test('mismatched provider resources and oversized bodies are rejected without reflecting bodies', async () => {
  const mismatch = await manageFoundryProject(settings, { create: true, fetcher: azureMock((url) => {
    if (url.pathname === accountPath) return Response.json(account({ id: `${accountPath}/injected` }));
    throw new Error('project must not be read');
  }) });
  assert.equal(mismatch.stage, 'account-validation');
  assert.equal(mismatch.mutationAttempted, false);

  const oversized = await manageFoundryProject(settings, {
    fetcher: async () => new Response(JSON.stringify({ secret: settings.AZURE_CLIENT_SECRET }), {
      headers: { 'Content-Length': '200000' },
    }),
  });
  assert.deepEqual(oversized, { ok: false, stage: 'identity', httpStatus: 200 });
  assert.doesNotMatch(JSON.stringify([mismatch, oversized]), /fixture-|injected/);
});
