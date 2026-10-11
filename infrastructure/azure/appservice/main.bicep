targetScope = 'resourceGroup'

@allowed([
  'westus3'
  'centralindia'
])
param location string = 'westus3'
param namePrefix string = 'sales-enabler-beta'
param planName string
param webAppName string
param gatewayAppName string
param voiceLiveAppName string
param logAnalyticsWorkspaceName string
param postgresServerName string
param postgresAdministratorLogin string
@secure()
param postgresAdministratorPassword string
param postgresDatabaseName string = 'sales_enabler'

@allowed([
  'B2'
  'B3'
])
@description('B2 is the smallest evaluation tier. Move to B3 only after measured memory/CPU pressure.')
param appServiceSku string = 'B2'

param virtualNetworkAddressPrefix string = '10.43.0.0/16'
param appServiceSubnetPrefix string = '10.43.0.0/26'
param postgresSubnetPrefix string = '10.43.1.0/28'
param postgresPrivateDnsZoneName string = 'sales-enabler-appservice.postgres.database.azure.com'

@secure()
param databaseUrl string
@secure()
param connectorEncryptionKey string
@secure()
param authLifecycleKey string
@secure()
param publicSessionHashSecret string
@secure()
param azureOpenAiKey string
@secure()
param azureSpeechKey string
@secure()
param accountEmailAccessKey string

param azureOpenAiEndpoint string
param azureTextDeployment string
param azureRealtimeDeployment string
param azureSpeechRegion string
param azureVoiceLiveEndpoint string
param accountEmailEndpoint string
param accountEmailSender string
@description('Comma-separated organization IDs explicitly admitted to hosted inference.')
param inferenceAllowedOrganizationIds string
param azureDeploymentPricesJson string = ''

@minValue(1000)
@maxValue(1000000)
param aiDailyOrgTokenBudget int = 50000
@minValue(1)
@maxValue(500)
param voiceDailyOrgAttemptBudget int = 20
@minValue(60)
@maxValue(36000)
param voiceDailyOrgSecondsBudget int = 3600
@minValue(1)
@maxValue(3)
param voiceMaxLivePerUser int = 1
@minValue(1)
@maxValue(5)
param voiceMaxLivePerOrg int = 2
@minValue(1)
@maxValue(4)
param databasePoolMax int = 4

@minValue(25)
@maxValue(500)
param monthlyBudgetUsd int = 150
param budgetStartDate string
param budgetContactEmails array

var tags = {
  product: 'sales-enabler'
  environment: 'private-beta'
  architecture: 'native-app-service'
  managedBy: 'bicep'
}
var vnetName = '${namePrefix}-appservice-vnet'
var appSubnetName = 'appservice-integration'
var postgresSubnetName = 'postgresql'
var webOrigin = 'https://${webAppName}.azurewebsites.net'
var gatewayOrigin = '${gatewayAppName}.azurewebsites.net'
var voiceLiveOrigin = '${voiceLiveAppName}.azurewebsites.net'

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: logAnalyticsWorkspaceName
}

resource vnet 'Microsoft.Network/virtualNetworks@2025-01-01' = {
  name: vnetName
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [virtualNetworkAddressPrefix]
    }
  }
}

resource appSubnet 'Microsoft.Network/virtualNetworks/subnets@2025-01-01' = {
  parent: vnet
  name: appSubnetName
  properties: {
    addressPrefix: appServiceSubnetPrefix
    delegations: [{
      name: 'Microsoft.Web.serverFarms'
      properties: {
        serviceName: 'Microsoft.Web/serverFarms'
      }
    }]
  }
}

resource postgresSubnet 'Microsoft.Network/virtualNetworks/subnets@2025-01-01' = {
  parent: vnet
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
  tags: tags
}

resource postgresDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: postgresDns
  name: '${namePrefix}-appservice-link'
  location: 'global'
  tags: tags
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnet.id
    }
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2025-08-01' = {
  name: postgresServerName
  location: location
  tags: tags
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    administratorLogin: postgresAdministratorLogin
    administratorLoginPassword: postgresAdministratorPassword
    version: '16'
    storage: {
      storageSizeGB: 32
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: 7
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

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2025-08-01' = {
  parent: postgres
  name: postgresDatabaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.UTF8'
  }
}

resource plan 'Microsoft.Web/serverfarms@2024-11-01' = {
  name: planName
  location: location
  kind: 'linux'
  tags: tags
  sku: {
    name: appServiceSku
    tier: 'Basic'
    size: appServiceSku
    capacity: 1
  }
  properties: {
    reserved: true
    perSiteScaling: false
    zoneRedundant: false
  }
  dependsOn: [database]
}

var buildSettings = {
  WEBSITE_NODE_DEFAULT_VERSION: '~24'
  SCM_DO_BUILD_DURING_DEPLOYMENT: 'true'
  ENABLE_ORYX_BUILD: 'true'
  RUN_BUILD_COMMAND: 'bash infrastructure/azure/appservice/build.sh'
  WEBSITE_SKIP_RUNNING_KUDUAGENT: 'false'
}
var runtimeSettings = {
  NODE_ENV: 'production'
  HOSTNAME: '0.0.0.0'
  APP_URL: webOrigin
  DATABASE_URL: databaseUrl
  DATABASE_POOL_MAX: string(databasePoolMax)
  ALLOW_SQLITE_PRODUCTION: '0'
  CONNECTOR_ENCRYPTION_KEY: connectorEncryptionKey
  AUTH_LIFECYCLE_KEY: authLifecycleKey
  AUTH_REQUIRE_EMAIL_VERIFICATION: 'true'
  PUBLIC_SESSION_HASH_SECRET: publicSessionHashSecret
  PUBLIC_VOICE_GATEWAY_URL: 'wss://${gatewayOrigin}/voice'
  CONTINUOUS_SPEECH_GATEWAY_URL: 'wss://${gatewayOrigin}/private-speech'
  CONTINUOUS_SPEECH_ALLOW_LOCAL_WS: 'false'
  VOICE_LIVE_GATEWAY_URL: 'wss://${voiceLiveOrigin}/private-voice-live'
  VOICE_PROVIDER: 'azure'
  VOICE_TRANSPORT: 'webrtc'
  AZURE_OPENAI_ENDPOINT: azureOpenAiEndpoint
  AZURE_OPENAI_API_KEY: azureOpenAiKey
  AZURE_OPENAI_TEXT_DEPLOYMENT: azureTextDeployment
  AZURE_OPENAI_REALTIME_DEPLOYMENT: azureRealtimeDeployment
  AZURE_OPENAI_DEPLOYMENT_PRICES_JSON: azureDeploymentPricesJson
  AZURE_SPEECH_KEY: azureSpeechKey
  AZURE_SPEECH_REGION: azureSpeechRegion
  AZURE_VOICE_LIVE_ENDPOINT: azureVoiceLiveEndpoint
  INFERENCE_ALLOWED_ORGANIZATION_IDS: inferenceAllowedOrganizationIds
  INFERENCE_ALLOW_LOCAL: 'false'
  AI_DAILY_ORG_TOKEN_BUDGET: string(aiDailyOrgTokenBudget)
  VOICE_DAILY_ORG_ATTEMPT_BUDGET: string(voiceDailyOrgAttemptBudget)
  VOICE_DAILY_ORG_SECONDS_BUDGET: string(voiceDailyOrgSecondsBudget)
  VOICE_MAX_LIVE_PER_USER: string(voiceMaxLivePerUser)
  VOICE_MAX_LIVE_PER_ORG: string(voiceMaxLivePerOrg)
  AZURE_COMMUNICATION_EMAIL_ENDPOINT: accountEmailEndpoint
  AZURE_COMMUNICATION_EMAIL_ACCESS_KEY: accountEmailAccessKey
  AZURE_COMMUNICATION_EMAIL_SENDER: accountEmailSender
  AUTOMATION_WORKER_ENABLED: '0'
  CHANNEL_WORKER_ENABLED: '0'
  LEARNING_WORKER_ENABLED: '0'
}
var commonSettings = union(buildSettings, runtimeSettings)

resource web 'Microsoft.Web/sites@2025-03-01' = {
  name: webAppName
  location: location
  kind: 'app,linux'
  tags: tags
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    publicNetworkAccess: 'Enabled'
    siteConfig: {
      linuxFxVersion: 'NODE|24-lts'
      appCommandLine: 'node dist/bootstrap-db.cjs && exec node .next/standalone/server.js'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      http20Enabled: true
      healthCheckPath: '/api/health?ready=1'
      vnetRouteAllEnabled: true
    }
  }
}

resource gateway 'Microsoft.Web/sites@2025-03-01' = {
  name: gatewayAppName
  location: location
  kind: 'app,linux'
  tags: tags
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    publicNetworkAccess: 'Enabled'
    siteConfig: {
      linuxFxVersion: 'NODE|24-lts'
      appCommandLine: 'PUBLIC_VOICE_GATEWAY_HOST=0.0.0.0 PUBLIC_VOICE_GATEWAY_PORT=$PORT exec node dist/voice-gateway.cjs'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      http20Enabled: true
      webSocketsEnabled: true
      healthCheckPath: '/health'
      vnetRouteAllEnabled: true
    }
  }
}

resource voiceLive 'Microsoft.Web/sites@2025-03-01' = {
  name: voiceLiveAppName
  location: location
  kind: 'app,linux'
  tags: tags
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    publicNetworkAccess: 'Enabled'
    siteConfig: {
      linuxFxVersion: 'NODE|24-lts'
      appCommandLine: 'VOICE_LIVE_GATEWAY_HOST=0.0.0.0 VOICE_LIVE_GATEWAY_PORT=$PORT exec node dist/voice-live-gateway.cjs'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      http20Enabled: true
      webSocketsEnabled: true
      healthCheckPath: '/health'
      vnetRouteAllEnabled: true
    }
  }
}

resource webSettings 'Microsoft.Web/sites/config@2025-03-01' = {
  parent: web
  name: 'appsettings'
  properties: union(commonSettings, {
    WEBJOBS_STOPPED: '0'
  })
}

resource gatewaySettings 'Microsoft.Web/sites/config@2025-03-01' = {
  parent: gateway
  name: 'appsettings'
  properties: union(commonSettings, {
    WEBJOBS_STOPPED: '1'
  })
}

resource voiceLiveSettings 'Microsoft.Web/sites/config@2025-03-01' = {
  parent: voiceLive
  name: 'appsettings'
  properties: union(commonSettings, {
    WEBJOBS_STOPPED: '1'
  })
}

resource webAuth 'Microsoft.Web/sites/config@2025-03-01' = {
  parent: web
  name: 'authsettingsV2'
  properties: {
    platform: {
      enabled: false
    }
  }
}

resource gatewayAuth 'Microsoft.Web/sites/config@2025-03-01' = {
  parent: gateway
  name: 'authsettingsV2'
  properties: {
    platform: {
      enabled: false
    }
  }
}

resource voiceLiveAuth 'Microsoft.Web/sites/config@2025-03-01' = {
  parent: voiceLive
  name: 'authsettingsV2'
  properties: {
    platform: {
      enabled: false
    }
  }
}

resource webNetwork 'Microsoft.Web/sites/networkConfig@2024-04-01' = {
  parent: web
  name: 'virtualNetwork'
  properties: {
    subnetResourceId: appSubnet.id
    swiftSupported: true
  }
}

resource gatewayNetwork 'Microsoft.Web/sites/networkConfig@2024-04-01' = {
  parent: gateway
  name: 'virtualNetwork'
  properties: {
    subnetResourceId: appSubnet.id
    swiftSupported: true
  }
}

resource voiceLiveNetwork 'Microsoft.Web/sites/networkConfig@2024-04-01' = {
  parent: voiceLive
  name: 'virtualNetwork'
  properties: {
    subnetResourceId: appSubnet.id
    swiftSupported: true
  }
}

resource webDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: web
  name: '${namePrefix}-web-logs'
  properties: {
    workspaceId: logAnalytics.id
    logs: [
      { category: 'AppServiceConsoleLogs', enabled: true }
      { category: 'AppServiceHTTPLogs', enabled: true }
    ]
    metrics: [{ category: 'AllMetrics', enabled: true }]
  }
}

resource gatewayDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: gateway
  name: '${namePrefix}-gateway-logs'
  properties: {
    workspaceId: logAnalytics.id
    logs: [{ category: 'AppServiceConsoleLogs', enabled: true }]
    metrics: [{ category: 'AllMetrics', enabled: true }]
  }
}

resource voiceLiveDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: voiceLive
  name: '${namePrefix}-voice-live-logs'
  properties: {
    workspaceId: logAnalytics.id
    logs: [{ category: 'AppServiceConsoleLogs', enabled: true }]
    metrics: [{ category: 'AllMetrics', enabled: true }]
  }
}

resource monthlyBudget 'Microsoft.Consumption/budgets@2023-05-01' = {
  name: '${namePrefix}-appservice-monthly'
  properties: {
    amount: monthlyBudgetUsd
    category: 'Cost'
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: budgetStartDate
    }
    notifications: {
      Actual50: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 50, thresholdType: 'Actual', contactEmails: budgetContactEmails, contactGroups: [], contactRoles: [] }
      Actual75: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 75, thresholdType: 'Actual', contactEmails: budgetContactEmails, contactGroups: [], contactRoles: [] }
      Actual90: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 90, thresholdType: 'Actual', contactEmails: budgetContactEmails, contactGroups: [], contactRoles: [] }
      Actual100: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 100, thresholdType: 'Actual', contactEmails: budgetContactEmails, contactGroups: [], contactRoles: [] }
      Forecast100: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 100, thresholdType: 'Forecasted', contactEmails: budgetContactEmails, contactGroups: [], contactRoles: [] }
    }
  }
}
