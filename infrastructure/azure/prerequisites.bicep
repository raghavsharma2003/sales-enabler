targetScope = 'resourceGroup'

@description('Short, stable prefix used only for this private-beta infrastructure.')
@minLength(3)
@maxLength(24)
param namePrefix string

@description('East US 2 is the reviewed pilot region. Change only after a regional quota and data-location review.')
param location string = 'eastus2'

@description('Existing shared Basic ACR in the approved resource group. This template does not create or reconfigure it.')
param registryName string

@description('Existing shared Log Analytics workspace in the approved resource group.')
param logAnalyticsWorkspaceName string

@description('Globally unique Key Vault name reserved for sales-enabler runtime secrets.')
param keyVaultName string

@description('Globally unique PostgreSQL Flexible Server name.')
param postgresServerName string

@description('PostgreSQL administrator login. The dedicated server keeps this separate from application account emails.')
param postgresAdministratorLogin string

@secure()
@description('PostgreSQL administrator password supplied only at deployment time. Never store it in a parameter file or repository.')
param postgresAdministratorPassword string

@description('Application database created on the private server.')
@minLength(1)
@maxLength(63)
param postgresDatabaseName string = 'sales_enabler'

@allowed([
  '16'
  '17'
])
param postgresVersion string = '16'

@description('Smallest reviewed private-beta compute. Resize only from measured CPU-credit, memory, and connection evidence.')
@allowed([
  'Standard_B1ms'
  'Standard_B2s'
])
param postgresSkuName string = 'Standard_B1ms'

@minValue(32)
@maxValue(128)
param postgresStorageGiB int = 32

@minValue(7)
@maxValue(35)
param postgresBackupRetentionDays int = 7

@description('Private address space; review for overlap before any future peering.')
param virtualNetworkAddressPrefix string = '10.42.0.0/16'
param containerAppsSubnetPrefix string = '10.42.0.0/27'
param postgresSubnetPrefix string = '10.42.1.0/28'

@description('Private DNS zone must end in postgres.database.azure.com and must not equal the server name.')
param postgresPrivateDnsZoneName string = 'sales-enabler.postgres.database.azure.com'

@description('Monthly notification budget. This alerts; it never stops Azure resources.')
@minValue(25)
@maxValue(500)
param monthlyBudgetUsd int = 150

@description('One or more operator addresses required by the resource-group budget API.')
param budgetContactEmails array

@description('Budget start date, normally injected as the first day of the deployment month.')
param budgetStartDate string

var commonTags = {
  product: 'sales-enabler'
  environment: 'private-beta'
  managedBy: 'bicep'
}
var virtualNetworkName = '${namePrefix}-vnet'
var containerAppsSubnetName = 'container-apps'
var postgresSubnetName = 'postgresql'
var environmentName = '${namePrefix}-env'
var identityName = '${namePrefix}-runtime'

resource registry 'Microsoft.ContainerRegistry/registries@2025-11-01' existing = {
  name: registryName
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: logAnalyticsWorkspaceName
}

resource virtualNetwork 'Microsoft.Network/virtualNetworks@2025-01-01' = {
  name: virtualNetworkName
  location: location
  tags: commonTags
  properties: {
    addressSpace: {
      addressPrefixes: [virtualNetworkAddressPrefix]
    }
  }
}

resource containerAppsSubnet 'Microsoft.Network/virtualNetworks/subnets@2025-01-01' = {
  parent: virtualNetwork
  name: containerAppsSubnetName
  properties: {
    addressPrefix: containerAppsSubnetPrefix
    delegations: [{
      name: 'Microsoft.App.environments'
      properties: {
        serviceName: 'Microsoft.App/environments'
      }
    }]
  }
}

resource postgresSubnet 'Microsoft.Network/virtualNetworks/subnets@2025-01-01' = {
  parent: virtualNetwork
  name: postgresSubnetName
  properties: {
    addressPrefix: postgresSubnetPrefix
    delegations: [{
      name: 'Microsoft.DBforPostgreSQL.flexibleServers'
      properties: {
        serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
      }
    }]
  }
}

resource postgresDns 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: postgresPrivateDnsZoneName
  location: 'global'
  tags: commonTags
}

resource postgresDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: postgresDns
  name: '${namePrefix}-vnet-link'
  location: 'global'
  tags: commonTags
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: virtualNetwork.id
    }
  }
}

resource environment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: environmentName
  location: location
  tags: commonTags
  properties: {
    appLogsConfiguration: {
      destination: 'azure-monitor'
    }
    vnetConfiguration: {
      infrastructureSubnetId: containerAppsSubnet.id
      internal: false
    }
    workloadProfiles: [{
      name: 'Consumption'
      workloadProfileType: 'Consumption'
    }]
    zoneRedundant: false
  }
}

resource environmentDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: environment
  name: '${namePrefix}-environment-logs'
  properties: {
    workspaceId: logAnalytics.id
    logs: [
      {
        category: 'ContainerAppSystemLogs'
        enabled: true
      }
      {
        category: 'ContainerAppConsoleLogs'
        enabled: true
      }
    ]
    metrics: [{
      category: 'AllMetrics'
      enabled: true
    }]
  }
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: identityName
  location: location
  tags: commonTags
}

resource vault 'Microsoft.KeyVault/vaults@2025-05-01' = {
  name: keyVaultName
  location: location
  tags: commonTags
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    enabledForDeployment: false
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: false
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2025-08-01' = {
  name: postgresServerName
  location: location
  tags: commonTags
  sku: {
    name: postgresSkuName
    tier: 'Burstable'
  }
  properties: {
    administratorLogin: postgresAdministratorLogin
    administratorLoginPassword: postgresAdministratorPassword
    version: postgresVersion
    storage: {
      storageSizeGB: postgresStorageGiB
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: postgresBackupRetentionDays
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      delegatedSubnetResourceId: postgresSubnet.id
      privateDnsZoneArmResourceId: postgresDns.id
      publicNetworkAccess: 'Disabled'
    }
  }
  dependsOn: [postgresDnsLink]
}

resource applicationDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2025-08-01' = {
  parent: postgres
  name: postgresDatabaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.UTF8'
  }
}

resource monthlyBudget 'Microsoft.Consumption/budgets@2023-05-01' = {
  name: '${namePrefix}-monthly'
  properties: {
    amount: monthlyBudgetUsd
    category: 'Cost'
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: budgetStartDate
    }
    notifications: {
      Actual50: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 50
        thresholdType: 'Actual'
        contactEmails: budgetContactEmails
        contactGroups: []
        contactRoles: []
      }
      Actual75: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 75
        thresholdType: 'Actual'
        contactEmails: budgetContactEmails
        contactGroups: []
        contactRoles: []
      }
      Actual90: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 90
        thresholdType: 'Actual'
        contactEmails: budgetContactEmails
        contactGroups: []
        contactRoles: []
      }
      Actual100: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 100
        thresholdType: 'Actual'
        contactEmails: budgetContactEmails
        contactGroups: []
        contactRoles: []
      }
      Forecast100: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 100
        thresholdType: 'Forecasted'
        contactEmails: budgetContactEmails
        contactGroups: []
        contactRoles: []
      }
    }
  }
}

output environmentId string = environment.id
output identityId string = identity.id
output identityName string = identity.name
output keyVaultName string = vault.name
output postgresServerName string = postgres.name
output postgresDatabaseName string = applicationDatabase.name
output registryServer string = registry.properties.loginServer
