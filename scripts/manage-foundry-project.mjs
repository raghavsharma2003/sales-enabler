import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const GUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const RESOURCE_GROUP = /^[a-zA-Z0-9_().-]{1,90}$/;
const RESOURCE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,63}$/;
const LOCATION = /^[a-zA-Z0-9 ._-]{1,128}$/;
const REQUIRED = [
  'AZURE_TENANT_ID',
  'AZURE_CLIENT_ID',
  'AZURE_CLIENT_SECRET',
  'AZURE_SUBSCRIPTION_ID',
  'AZURE_RESOURCE_GROUP',
  'AZURE_FOUNDRY_ACCOUNT_NAME',
];
const PROJECT_NAME = 'sales-enabler';
const API_VERSION = '2025-06-01';
const ARM_ORIGIN = 'https://management.azure.com';
const MAX_TOKEN_RESPONSE = 131_072;
const MAX_ARM_RESPONSE = 1_048_576;
const REQUEST_TIMEOUT_MS = 20_000;
const PROVISIONING_STATES = new Set([
  'Accepted',
  'Creating',
  'Deleting',
  'Moving',
  'Failed',
  'Succeeded',
  'ResolvingDNS',
]);

function configurationResult(settings) {
  const missingVariables = REQUIRED.filter((key) => {
    const value = settings[key];
    return typeof value !== 'string' || !value.trim() || value.includes('REPLACE_WITH');
  });
  const invalidVariables = [];
  for (const key of ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_SUBSCRIPTION_ID']) {
    if (!missingVariables.includes(key) && !GUID.test(settings[key])) invalidVariables.push(key);
  }
  if (!missingVariables.includes('AZURE_RESOURCE_GROUP') &&
      (!RESOURCE_GROUP.test(settings.AZURE_RESOURCE_GROUP) || settings.AZURE_RESOURCE_GROUP.endsWith('.'))) {
    invalidVariables.push('AZURE_RESOURCE_GROUP');
  }
  if (!missingVariables.includes('AZURE_FOUNDRY_ACCOUNT_NAME') &&
      !RESOURCE_NAME.test(settings.AZURE_FOUNDRY_ACCOUNT_NAME)) {
    invalidVariables.push('AZURE_FOUNDRY_ACCOUNT_NAME');
  }
  if (!RESOURCE_NAME.test(PROJECT_NAME)) invalidVariables.push('AZURE_FOUNDRY_PROJECT_NAME');
  return { missingVariables, invalidVariables };
}

async function requestJson(fetcher, url, options, maximum) {
  let response;
  try {
    response = await fetcher(url, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 0, transportFailure: true };
  }

  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximum) {
    await response.body?.cancel().catch(() => {});
    return { ok: false, status: response.status, invalidResponse: true };
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    return { ok: false, status: response.status };
  }
  if (response.status === 204) return { ok: true, status: response.status, value: null };

  const reader = response.body?.getReader();
  if (!reader) return { ok: true, status: response.status, value: null };
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maximum) {
        await reader.cancel();
        return { ok: false, status: response.status, invalidResponse: true };
      }
      chunks.push(part.value);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    return {
      ok: true,
      status: response.status,
      value: text.length ? JSON.parse(text) : null,
    };
  } catch {
    await reader.cancel().catch(() => {});
    return { ok: false, status: response.status, invalidResponse: true };
  }
}

function resourceState(value) {
  const state = value?.properties?.provisioningState;
  return PROVISIONING_STATES.has(state) ? state : 'unknown';
}

function projectResult(response, expectedId) {
  if (!response.ok) return null;
  const value = response.value;
  // ARM can return either the child name or its account/child qualified form.
  const qualifiedName = `${expectedId.split('/').at(-3)}/${PROJECT_NAME}`;
  const valid = typeof value === 'object' && value !== null &&
    typeof value.id === 'string' && value.id.toLowerCase() === expectedId.toLowerCase() &&
    (value.name === PROJECT_NAME || value.name === qualifiedName) &&
    value.type === 'Microsoft.CognitiveServices/accounts/projects';
  if (!valid) return null;
  const provisioningState = resourceState(value);
  return {
    exists: true,
    httpStatus: response.status,
    provisioningState,
    ready: provisioningState === 'Succeeded',
  };
}

/**
 * Inspect, and only when explicitly requested create, the fixed sales-enabler
 * project beneath one explicitly configured existing Azure AI Services account.
 */
export async function manageFoundryProject(settings, { create = false, fetcher = fetch } = {}) {
  const configuration = configurationResult(settings ?? {});
  if (configuration.missingVariables.length || configuration.invalidVariables.length) {
    return { ok: false, stage: 'configuration', ...configuration };
  }
  if (typeof create !== 'boolean') {
    return { ok: false, stage: 'configuration', missingVariables: [], invalidVariables: ['create'] };
  }

  const tokenUrl = `https://login.microsoftonline.com/${settings.AZURE_TENANT_ID}/oauth2/v2.0/token`;
  const identity = await requestJson(fetcher, tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: settings.AZURE_CLIENT_ID,
      client_secret: settings.AZURE_CLIENT_SECRET,
      grant_type: 'client_credentials',
      scope: `${ARM_ORIGIN}/.default`,
    }).toString(),
  }, MAX_TOKEN_RESPONSE);
  if (!identity.ok || typeof identity.value?.access_token !== 'string' || identity.value.access_token.length < 20) {
    return { ok: false, stage: 'identity', httpStatus: identity.status };
  }

  const accountPath = `/subscriptions/${settings.AZURE_SUBSCRIPTION_ID}` +
    `/resourceGroups/${encodeURIComponent(settings.AZURE_RESOURCE_GROUP)}` +
    `/providers/Microsoft.CognitiveServices/accounts/${encodeURIComponent(settings.AZURE_FOUNDRY_ACCOUNT_NAME)}`;
  const projectPath = `${accountPath}/projects/${PROJECT_NAME}`;
  const accountUrl = `${ARM_ORIGIN}${accountPath}?api-version=${API_VERSION}`;
  const projectUrl = `${ARM_ORIGIN}${projectPath}?api-version=${API_VERSION}`;
  const authorization = { Authorization: `Bearer ${identity.value.access_token}` };

  const account = await requestJson(fetcher, accountUrl, {
    method: 'GET', headers: authorization,
  }, MAX_ARM_RESPONSE);
  if (!account.ok) {
    return { ok: false, stage: 'account-read', httpStatus: account.status, mutationAttempted: false };
  }
  const accountValue = account.value;
  const accountMatches = typeof accountValue === 'object' && accountValue !== null &&
    typeof accountValue.id === 'string' && accountValue.id.toLowerCase() === accountPath.toLowerCase() &&
    accountValue.name === settings.AZURE_FOUNDRY_ACCOUNT_NAME &&
    accountValue.type === 'Microsoft.CognitiveServices/accounts';
  if (!accountMatches) {
    return { ok: false, stage: 'account-validation', reason: 'resource-mismatch', mutationAttempted: false };
  }

  const accountState = resourceState(accountValue);
  const location = typeof accountValue.location === 'string' ? accountValue.location.trim() : '';
  const accountReady = accountValue.kind === 'AIServices' &&
    accountValue.properties?.allowProjectManagement === true &&
    accountState === 'Succeeded' && LOCATION.test(location);
  const accountSummary = {
    readable: true,
    kindIsAIServices: accountValue.kind === 'AIServices',
    projectManagementEnabled: accountValue.properties?.allowProjectManagement === true,
    provisioningState: accountState,
    readyForProjectCreation: accountReady,
  };

  const project = await requestJson(fetcher, projectUrl, {
    method: 'GET', headers: authorization,
  }, MAX_ARM_RESPONSE);
  if (project.ok) {
    const summary = projectResult(project, projectPath);
    if (!summary) {
      return { ok: false, stage: 'project-validation', reason: 'resource-mismatch', account: accountSummary, mutationAttempted: false };
    }
    return { ok: true, stage: 'project-read', action: 'none', account: accountSummary, project: summary };
  }
  if (project.status !== 404) {
    return { ok: false, stage: 'project-read', httpStatus: project.status, account: accountSummary, mutationAttempted: false };
  }
  if (!create) {
    return {
      ok: true,
      stage: 'project-read',
      action: 'none',
      account: accountSummary,
      project: { exists: false, httpStatus: 404, ready: false },
      creationAuthorized: false,
    };
  }
  if (!accountReady) {
    return { ok: false, stage: 'account-readiness', account: accountSummary, mutationAttempted: false };
  }

  const creation = await requestJson(fetcher, projectUrl, {
    method: 'PUT',
    headers: {
      ...authorization,
      'Content-Type': 'application/json',
      'If-None-Match': '*',
    },
    body: JSON.stringify({
      location,
      identity: { type: 'SystemAssigned' },
      properties: { displayName: PROJECT_NAME },
    }),
  }, MAX_ARM_RESPONSE);

  const ambiguousSuccess = creation.invalidResponse && creation.status >= 200 && creation.status < 300;
  if (creation.transportFailure || ambiguousSuccess || creation.status >= 500) {
    return {
      ok: false,
      stage: 'project-create',
      outcome: 'uncertain',
      ...(creation.status ? { httpStatus: creation.status } : {}),
      mutationAttempted: true,
    };
  }
  if (!creation.ok) {
    return { ok: false, stage: 'project-create', outcome: 'failed', httpStatus: creation.status, mutationAttempted: true };
  }

  if (creation.status === 202) {
    const followUp = await requestJson(fetcher, projectUrl, {
      method: 'GET', headers: authorization,
    }, MAX_ARM_RESPONSE);
    const summary = projectResult(followUp, projectPath);
    if (summary?.ready) {
      return { ok: true, stage: 'project-create', action: 'create-confirmed', outcome: 'succeeded', project: summary };
    }
    return {
      ok: true,
      stage: 'project-create',
      action: 'create-started',
      outcome: 'pending',
      project: summary ?? {
        exists: followUp.status === 404 ? false : null,
        httpStatus: followUp.status,
        ready: false,
      },
    };
  }

  const summary = projectResult(creation, projectPath);
  if (!summary) {
    return { ok: false, stage: 'project-create', outcome: 'uncertain', httpStatus: creation.status, mutationAttempted: true };
  }
  return {
    ok: true,
    stage: 'project-create',
    action: creation.status === 201 ? 'created' : 'create-confirmed',
    outcome: summary.ready ? 'succeeded' : 'pending',
    project: summary,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--create') || args.filter((arg) => arg === '--create').length > 1) {
    throw new Error('usage');
  }
  const configPath = resolve('.env.azure-management.local');
  const contents = readFileSync(configPath, 'utf8');
  if (Buffer.byteLength(contents) > 65_536) throw new Error('configuration-size');
  const result = await manageFoundryProject(parseEnv(contents), { create: args.includes('--create') });
  console.log(JSON.stringify(result));
  if (!result.ok || result.outcome === 'pending') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    console.error('Azure Foundry project management could not complete. Check the private management configuration and network access. No credentials, tokens, resource IDs, or provider response bodies were logged.');
    process.exitCode = 1;
  });
}
