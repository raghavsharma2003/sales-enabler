import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesAzureActionPattern, permitsAzureAction } from '../lib/rbac-permissions.mjs';

const contributor = {
  actions: ['*'],
  notActions: [
    'Microsoft.Authorization/*/Write',
    'Microsoft.Authorization/*/Delete',
  ],
  dataActions: [],
  notDataActions: [],
};

test('Azure wildcards match authorization actions in middle path segments', () => {
  assert.equal(matchesAzureActionPattern('Microsoft.Authorization/*/Write', 'Microsoft.Authorization/roleAssignments/write'), true);
  assert.equal(matchesAzureActionPattern('Microsoft.Authorization/*/Delete', 'Microsoft.Authorization/locks/delete'), true);
  assert.equal(matchesAzureActionPattern('Microsoft.Authorization/*/Write', 'Microsoft.Network/virtualNetworks/write'), false);
});

test('Contributor permits foundation work but not role-assignment or lock mutation', () => {
  assert.equal(permitsAzureAction([contributor], 'Microsoft.Network/virtualNetworks/write'), true);
  assert.equal(permitsAzureAction([contributor], 'Microsoft.Authorization/roleAssignments/read'), true);
  assert.equal(permitsAzureAction([contributor], 'Microsoft.Authorization/roleAssignments/write'), false);
  assert.equal(permitsAzureAction([contributor], 'Microsoft.Authorization/locks/write'), false);
  assert.equal(permitsAzureAction([contributor], 'Microsoft.Authorization/locks/delete'), false);
});

test('an independent exact grant adds authority that Contributor excludes', () => {
  const roleAssignmentAdministrator = {
    actions: ['Microsoft.Authorization/roleAssignments/write'],
    notActions: [],
    dataActions: [],
    notDataActions: [],
  };
  assert.equal(permitsAzureAction([contributor, roleAssignmentAdministrator], 'Microsoft.Authorization/roleAssignments/write'), true);
  assert.equal(permitsAzureAction([contributor, roleAssignmentAdministrator], 'Microsoft.Authorization/locks/write'), false);
});
