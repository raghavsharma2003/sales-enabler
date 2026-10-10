targetScope = 'resourceGroup'

@description('Existing shared ACR in the approved resource group.')
param registryName string

@description('Project Key Vault created by prerequisites.bicep.')
param keyVaultName string

@description('Project runtime identity created by prerequisites.bicep.')
param runtimeIdentityName string

@description('Object ID of the dedicated deployment service principal.')
param deployerPrincipalId string

@description('Project PostgreSQL server created by prerequisites.bicep.')
param postgresServerName string

@description('Deletion locks protect the database and vault from accidental removal during the beta.')
param enableDeleteLocks bool = true

resource registry 'Microsoft.ContainerRegistry/registries@2025-11-01' existing = {
  name: registryName
}

resource vault 'Microsoft.KeyVault/vaults@2025-05-01' existing = {
  name: keyVaultName
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' existing = {
  name: runtimeIdentityName
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2025-08-01' existing = {
  name: postgresServerName
}

resource acrPullRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' existing = {
  scope: subscription()
  name: '7f951dda-4ed3-4680-a7ca-43fe172d538d'
}

resource acrPushRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' existing = {
  scope: subscription()
  name: '8311e382-0749-4cb8-b61a-304f252e45ec'
}

resource keyVaultSecretsUserRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' existing = {
  scope: subscription()
  name: '4633458b-17de-408a-b874-0445c86b69e6'
}

resource keyVaultSecretsOfficerRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' existing = {
  scope: subscription()
  name: 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'
}

resource runtimeAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, identity.id, acrPullRole.id)
  properties: {
    roleDefinitionId: acrPullRole.id
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource deployerAcrPush 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, deployerPrincipalId, acrPushRole.id)
  properties: {
    roleDefinitionId: acrPushRole.id
    principalId: deployerPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource runtimeVaultRead 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vault
  name: guid(vault.id, identity.id, keyVaultSecretsUserRole.id)
  properties: {
    roleDefinitionId: keyVaultSecretsUserRole.id
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource deployerVaultWrite 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vault
  name: guid(vault.id, deployerPrincipalId, keyVaultSecretsOfficerRole.id)
  properties: {
    roleDefinitionId: keyVaultSecretsOfficerRole.id
    principalId: deployerPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource postgresDeleteLock 'Microsoft.Authorization/locks@2020-05-01' = if (enableDeleteLocks) {
  scope: postgres
  name: 'protect-private-beta-database'
  properties: {
    level: 'CanNotDelete'
    notes: 'Remove only during an explicitly reviewed restore, replacement, or teardown.'
  }
}

resource vaultDeleteLock 'Microsoft.Authorization/locks@2020-05-01' = if (enableDeleteLocks) {
  scope: vault
  name: 'protect-private-beta-secrets'
  properties: {
    level: 'CanNotDelete'
    notes: 'Purge protection is also enabled; remove this lock only through reviewed operations.'
  }
}
