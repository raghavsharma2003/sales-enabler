targetScope = 'resourceGroup'

@description('Existing Azure Container Apps managed environment resource ID. This template does not create it.')
param environmentId string
@description('Existing user-assigned identity resource ID with AcrPull and Key Vault secret read permissions.')
param identityId string
param location string = resourceGroup().location
param appName string
@description('Immutable image reference, preferably registry/repository@sha256:digest, built from target web.')
param webImage string
param registryServer string
@description('Final HTTPS application origin; must match OAuth redirect configuration.')
param appUrl string
@description('Existing Key Vault secret URI containing DATABASE_URL with TLS verification enabled.')
param databaseSecretUri string
@description('Existing Key Vault secret URI containing the stable 64-character hexadecimal connector key.')
param connectorKeySecretUri string
@description('Existing Key Vault secret URI containing the separate stable 64-character hexadecimal account lifecycle key.')
param authLifecycleKeySecretUri string
param requireEmailVerification bool = true
@description('Requires an existing configured ACS Email resource/sender; creates no email resources.')
param accountEmailEnabled bool = false
param accountEmailEndpoint string = ''
param accountEmailKeySecretUri string = ''
param accountEmailSender string = ''
@description('Use only the existing authorized Azure inference resource. No inference resources are created.')
param azureEnabled bool = false
param azureEndpoint string = ''
param azureKeySecretUri string = ''
param azureTextDeployment string = ''
param azureRealtimeDeployment string = ''
@description('Comma-separated organization IDs explicitly activated by the platform operator. Empty means hosted inference is denied.')
param inferenceAllowedOrganizationIds string = ''
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
@description('Per-process PostgreSQL pool cap. Four keeps web, gateway, supervisor and one probe below the B1ms connection budget.')
@minValue(1)
@maxValue(4)
param databasePoolMax int = 4
@description('Optional verified per-million deployment pricing map used only for operator cost estimates.')
param azureDeploymentPricesJson string = ''
@description('Enables hosted private recognition through the same WSS gateway. Uses the existing approved Speech resource.')
param speechEnabled bool = false
param azureSpeechKeySecretUri string = ''
param azureSpeechRegion string = ''
@description('Published private recognition URL wss://YOUR-GATEWAY-HOST/private-speech.')
param continuousSpeechGatewayUrl string = ''
@description('Explicit approval required before setting true: the worker may execute enabled schedules.')
param enableWorker bool = false
param workerImage string = ''
@description('Explicit opt-in: processing queued authorized channel replies may use inference and external messaging.')
param enableChannelWorker bool = false
param channelWorkerImage string = ''
@description('Explicit global opt-in for authorized learning enqueue and the separate inference worker.')
param enableLearningWorker bool = false
param learningWorkerImage string = ''
param enableVoiceGateway bool = false
param voiceGatewayImage string = ''
@description('Published gateway URL wss://YOUR-GATEWAY-HOST/voice. Origins remain deployment-allowlisted in the application.')
param publicVoiceGatewayUrl string = ''
param publicSessionHashSecretUri string = ''
@description('Durable private-call deadline and revocation supervisor. Must stay at one replica whenever private Azure calls are admitted.')
param enableVoiceSupervisor bool = false
param voiceSupervisorImage string = ''
@allowed([0, 1])
param webMinReplicas int = 0
@allowed([0, 1])
param voiceGatewayMinReplicas int = 0

var secrets = concat([
  { name: 'database-url', keyVaultUrl: databaseSecretUri, identity: identityId }
  { name: 'connector-key', keyVaultUrl: connectorKeySecretUri, identity: identityId }
  { name: 'auth-lifecycle-key', keyVaultUrl: authLifecycleKeySecretUri, identity: identityId }
], azureEnabled ? [{ name: 'azure-api-key', keyVaultUrl: azureKeySecretUri, identity: identityId }] : [],
speechEnabled ? [{ name: 'azure-speech-key', keyVaultUrl: azureSpeechKeySecretUri, identity: identityId }] : [],
accountEmailEnabled ? [{ name: 'account-email-key', keyVaultUrl: accountEmailKeySecretUri, identity: identityId }] : [],
!empty(publicSessionHashSecretUri) ? [{ name: 'public-session-key', keyVaultUrl: publicSessionHashSecretUri, identity: identityId }] : [])

var appEnvironment = concat([
  { name: 'NODE_ENV', value: 'production' }
  { name: 'APP_URL', value: appUrl }
  { name: 'DATABASE_URL', secretRef: 'database-url' }
  { name: 'CONNECTOR_ENCRYPTION_KEY', secretRef: 'connector-key' }
  { name: 'AUTH_LIFECYCLE_KEY', secretRef: 'auth-lifecycle-key' }
  { name: 'AUTH_REQUIRE_EMAIL_VERIFICATION', value: string(requireEmailVerification) }
  { name: 'LEARNING_WORKER_ENABLED', value: enableLearningWorker ? '1' : '0' }
  { name: 'ALLOW_SQLITE_PRODUCTION', value: '0' }
  { name: 'DATABASE_POOL_MAX', value: string(databasePoolMax) }
  { name: 'VOICE_PROVIDER', value: azureEnabled ? 'azure' : 'none' }
  { name: 'VOICE_TRANSPORT', value: 'webrtc' }
  { name: 'PUBLIC_VOICE_GATEWAY_URL', value: publicVoiceGatewayUrl }
  { name: 'CONTINUOUS_SPEECH_GATEWAY_URL', value: continuousSpeechGatewayUrl }
  { name: 'CONTINUOUS_SPEECH_ALLOW_LOCAL_WS', value: 'false' }
  { name: 'INFERENCE_ALLOWED_ORGANIZATION_IDS', value: inferenceAllowedOrganizationIds }
  { name: 'INFERENCE_ALLOW_LOCAL', value: 'false' }
  { name: 'AI_DAILY_ORG_TOKEN_BUDGET', value: string(aiDailyOrgTokenBudget) }
  { name: 'VOICE_DAILY_ORG_ATTEMPT_BUDGET', value: string(voiceDailyOrgAttemptBudget) }
  { name: 'VOICE_DAILY_ORG_SECONDS_BUDGET', value: string(voiceDailyOrgSecondsBudget) }
  { name: 'VOICE_MAX_LIVE_PER_USER', value: string(voiceMaxLivePerUser) }
  { name: 'VOICE_MAX_LIVE_PER_ORG', value: string(voiceMaxLivePerOrg) }
  { name: 'AZURE_OPENAI_DEPLOYMENT_PRICES_JSON', value: azureDeploymentPricesJson }
], azureEnabled ? [
  { name: 'AZURE_OPENAI_ENDPOINT', value: azureEndpoint }
  { name: 'AZURE_OPENAI_API_KEY', secretRef: 'azure-api-key' }
  { name: 'AZURE_OPENAI_TEXT_DEPLOYMENT', value: azureTextDeployment }
  { name: 'AZURE_OPENAI_REALTIME_DEPLOYMENT', value: azureRealtimeDeployment }
] : [], speechEnabled ? [
  { name: 'AZURE_SPEECH_KEY', secretRef: 'azure-speech-key' }
  { name: 'AZURE_SPEECH_REGION', value: azureSpeechRegion }
] : [], accountEmailEnabled ? [
  { name: 'AZURE_COMMUNICATION_EMAIL_ENDPOINT', value: accountEmailEndpoint }
  { name: 'AZURE_COMMUNICATION_EMAIL_ACCESS_KEY', secretRef: 'account-email-key' }
  { name: 'AZURE_COMMUNICATION_EMAIL_SENDER', value: accountEmailSender }
] : [], !empty(publicSessionHashSecretUri) ? [{ name: 'PUBLIC_SESSION_HASH_SECRET', secretRef: 'public-session-key' }] : [])

resource app 'Microsoft.App/containerApps@2025-01-01' = {
  name: appName
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identityId}': {} } }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: { external: true, targetPort: 3000, transport: 'auto', allowInsecure: false }
      registries: [{ server: registryServer, identity: identityId }]
      secrets: secrets
    }
    template: {
      terminationGracePeriodSeconds: 60
      containers: [{
        name: 'web'
        image: webImage
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: concat(appEnvironment, [{ name: 'AUTOMATION_WORKER_ENABLED', value: '0' }, { name: 'CHANNEL_WORKER_ENABLED', value: '0' }])
        probes: [
          { type: 'Startup', httpGet: { path: '/api/health', port: 3000 }, initialDelaySeconds: 5, periodSeconds: 5, timeoutSeconds: 3, failureThreshold: 30 }
          { type: 'Liveness', httpGet: { path: '/api/health', port: 3000 }, periodSeconds: 30, timeoutSeconds: 3, failureThreshold: 3 }
          { type: 'Readiness', httpGet: { path: '/api/health?ready=1', port: 3000 }, periodSeconds: 15, timeoutSeconds: 10, failureThreshold: 3 }
        ]
      }]
      // HTTP ingress wakes the private beta; one replica is the hard scale boundary.
      scale: { minReplicas: webMinReplicas, maxReplicas: 1 }
    }
  }
}

resource worker 'Microsoft.App/containerApps@2025-01-01' = if (enableWorker) {
  name: '${appName}-worker'
  location: location
  dependsOn: [app]
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identityId}': {} } }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [{ server: registryServer, identity: identityId }]
      secrets: secrets
      // No ingress. Monitor durable service_heartbeats independently of web probes.
    }
    template: {
      terminationGracePeriodSeconds: 90
      containers: [{
        name: 'worker'
        image: workerImage
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: concat(appEnvironment, [{ name: 'AUTOMATION_WORKER_ENABLED', value: '1' }, { name: 'CHANNEL_WORKER_ENABLED', value: '0' }])
      }]
      scale: { minReplicas: 1, maxReplicas: 1 }
    }
  }
}

resource voiceSupervisor 'Microsoft.App/containerApps@2025-01-01' = if (enableVoiceSupervisor) {
  name: '${appName}-voice-supervisor'
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identityId}': {} } }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [{ server: registryServer, identity: identityId }]
      secrets: secrets
      // No ingress. Private-call admission requires its fresh durable database heartbeat.
    }
    template: {
      terminationGracePeriodSeconds: 90
      containers: [{
        name: 'voice-supervisor'
        image: voiceSupervisorImage
        resources: { cpu: json('0.25'), memory: '0.5Gi' }
        env: concat(appEnvironment, [{ name: 'AUTOMATION_WORKER_ENABLED', value: '0' }, { name: 'CHANNEL_WORKER_ENABLED', value: '0' }])
      }]
      // Durable provider deadlines cannot depend on an HTTP request waking this process.
      scale: { minReplicas: 1, maxReplicas: 1 }
    }
  }
}

output voiceSupervisorEnabled bool = enableVoiceSupervisor

output applicationUrl string = 'https://${app.properties.configuration.ingress.fqdn}'
output workerEnabled bool = enableWorker

resource channelWorker 'Microsoft.App/containerApps@2025-01-01' = if (enableChannelWorker) {
  name: '${appName}-channels'
  location: location
  dependsOn: [app]
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identityId}': {} } }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [{ server: registryServer, identity: identityId }]
      secrets: secrets
      // Deliberately no ingress. Alert on channel-worker durable heartbeat age.
    }
    template: {
      terminationGracePeriodSeconds: 90
      containers: [{
        name: 'channel-worker'
        image: channelWorkerImage
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: concat(appEnvironment, [{ name: 'AUTOMATION_WORKER_ENABLED', value: '0' }, { name: 'CHANNEL_WORKER_ENABLED', value: '1' }])
      }]
      scale: { minReplicas: 1, maxReplicas: 1 }
    }
  }
}

resource learningWorker 'Microsoft.App/containerApps@2025-01-01' = if (enableLearningWorker) {
  name: '${appName}-learning'
  location: location
  dependsOn: [app]
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identityId}': {} } }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [{ server: registryServer, identity: identityId }]
      secrets: secrets
      // Deliberately no ingress. Alert on learning-worker durable heartbeat age.
    }
    template: {
      terminationGracePeriodSeconds: 90
      containers: [{
        name: 'learning-worker'
        image: learningWorkerImage
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: concat(appEnvironment, [{ name: 'AUTOMATION_WORKER_ENABLED', value: '0' }, { name: 'CHANNEL_WORKER_ENABLED', value: '0' }])
      }]
      scale: { minReplicas: 1, maxReplicas: 1 }
    }
  }
}

resource voiceGateway 'Microsoft.App/containerApps@2025-01-01' = if (enableVoiceGateway) {
  name: '${appName}-voice'
  location: location
  dependsOn: [app]
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identityId}': {} } }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: { external: true, targetPort: 3001, transport: 'auto', allowInsecure: false }
      registries: [{ server: registryServer, identity: identityId }]
      secrets: secrets
    }
    template: {
      terminationGracePeriodSeconds: 60
      containers: [{
        name: 'voice-gateway'
        image: voiceGatewayImage
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: concat(appEnvironment, [{ name: 'AUTOMATION_WORKER_ENABLED', value: '0' }, { name: 'CHANNEL_WORKER_ENABLED', value: '0' }])
        probes: [
          { type: 'Startup', httpGet: { path: '/health', port: 3001 }, periodSeconds: 5, timeoutSeconds: 3, failureThreshold: 20 }
          { type: 'Liveness', httpGet: { path: '/health', port: 3001 }, periodSeconds: 30, timeoutSeconds: 3, failureThreshold: 3 }
          { type: 'Readiness', httpGet: { path: '/health', port: 3001 }, periodSeconds: 15, timeoutSeconds: 3, failureThreshold: 3 }
        ]
      }]
      // Active WebSocket connections keep the gateway replica alive; cold start is explicit beta behavior.
      scale: { minReplicas: voiceGatewayMinReplicas, maxReplicas: 1 }
    }
  }
}
