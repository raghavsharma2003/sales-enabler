param(
  [Parameter(Mandatory = $true)][string]$ResourceGroup,
  [Parameter(Mandatory = $true)][string]$ParametersFile
)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command az -ErrorAction SilentlyContinue)) { throw 'Azure CLI is unavailable. No deployment was attempted.' }
$template = Join-Path $PSScriptRoot 'main.bicep'
$parametersPath = (Resolve-Path -LiteralPath $ParametersFile).Path
$parameters = Get-Content -LiteralPath $parametersPath -Raw | ConvertFrom-Json
if (($parameters | ConvertTo-Json -Depth 20) -match 'REPLACE_WITH') { throw 'Replace all example placeholders in a private local parameter file first.' }
if ($parameters.parameters.webImage.value -notmatch '@sha256:[a-fA-F0-9]{64}$') { throw 'Use an immutable web image digest.' }
if ($parameters.parameters.appUrl.value -notmatch '^https://[^/]+/?$') { throw 'Use the final HTTPS app origin.' }
if ($parameters.parameters.enableWorker.value -eq $true) {
  if ($parameters.parameters.workerImage.value -notmatch '@sha256:[a-fA-F0-9]{64}$') { throw 'Enabled workers require an immutable worker image digest.' }
}
if ($parameters.parameters.enableChannelWorker.value -eq $true) {
  if ($parameters.parameters.channelWorkerImage.value -notmatch '@sha256:[a-fA-F0-9]{64}$') { throw 'Enabled channel workers require an immutable image digest.' }
}
if ($parameters.parameters.enableLearningWorker.value -eq $true) {
  if ($parameters.parameters.learningWorkerImage.value -notmatch '@sha256:[a-fA-F0-9]{64}$') { throw 'Enabled learning workers require an immutable image digest.' }
}
if (($parameters.parameters.enableChannelWorker.value -eq $true -or $parameters.parameters.enableLearningWorker.value -eq $true) -and $parameters.parameters.azureEnabled.value -ne $true) { throw 'Configure the existing Azure inference resource before enabling channel or learning processing.' }
if ($parameters.parameters.azureEnabled.value -eq $true) {
  foreach ($name in @('azureEndpoint', 'azureKeySecretUri', 'azureTextDeployment', 'azureRealtimeDeployment', 'inferenceAllowedOrganizationIds')) {
    if (-not $parameters.parameters.$name.value) { throw "Azure hosting requires $name." }
  }
  if ($parameters.parameters.azureEndpoint.value -notmatch '^https://[^/]+(?:/openai/v1)?/?$') { throw 'Use the existing authorized HTTPS Azure inference origin.' }
}
if ($parameters.parameters.enableVoiceGateway.value -eq $true) {
  if ($parameters.parameters.azureEnabled.value -ne $true) { throw 'The public gateway requires the existing Azure voice configuration.' }
  if ($parameters.parameters.voiceGatewayImage.value -notmatch '@sha256:[a-fA-F0-9]{64}$') { throw 'Enabled voice gateways require an immutable image digest.' }
  if ($parameters.parameters.publicVoiceGatewayUrl.value -notmatch '^wss://[^/]+/voice$') { throw 'Set the public WSS gateway URL ending in /voice.' }
  if (-not $parameters.parameters.publicSessionHashSecretUri.value) { throw 'Set the existing public-session hashing secret URI.' }
}
if ($parameters.parameters.speechEnabled.value -eq $true) {
  if ($parameters.parameters.enableVoiceGateway.value -ne $true) { throw 'Hosted private speech requires the WSS gateway.' }
  if ($parameters.parameters.azureSpeechKeySecretUri.value -notmatch '^https://[^/]+\.vault\.azure\.net/secrets/[^/]+/?$') { throw 'Set the Key Vault URI for the approved Azure Speech key.' }
  if ($parameters.parameters.azureSpeechRegion.value -notmatch '^[a-z][a-z0-9-]{1,40}$') { throw 'Set the existing Azure Speech region.' }
  if ($parameters.parameters.continuousSpeechGatewayUrl.value -notmatch '^wss://[^/]+/private-speech$') { throw 'Set the private speech WSS URL ending in /private-speech.' }
  $publicGateway = [Uri]$parameters.parameters.publicVoiceGatewayUrl.value
  $privateGateway = [Uri]$parameters.parameters.continuousSpeechGatewayUrl.value
  if ($publicGateway.Host -ne $privateGateway.Host) { throw 'Public voice and private speech must use the reviewed shared gateway host.' }
}
if ($parameters.parameters.enableVoiceSupervisor.value -eq $true) {
  if ($parameters.parameters.azureEnabled.value -ne $true) { throw 'The private voice supervisor requires the existing Azure voice configuration.' }
  if ($parameters.parameters.voiceSupervisorImage.value -notmatch '@sha256:[a-fA-F0-9]{64}$') { throw 'The private voice supervisor requires an immutable image digest.' }
}
if ($parameters.parameters.speechEnabled.value -eq $true -and $parameters.parameters.enableVoiceSupervisor.value -ne $true) { throw 'Private Azure voice admission requires the durable supervisor.' }
$webMinReplicas = if ($null -eq $parameters.parameters.webMinReplicas) { 0 } else { [int]$parameters.parameters.webMinReplicas.value }
$voiceGatewayMinReplicas = if ($null -eq $parameters.parameters.voiceGatewayMinReplicas) { 0 } else { [int]$parameters.parameters.voiceGatewayMinReplicas.value }
$databasePoolMax = if ($null -eq $parameters.parameters.databasePoolMax) { 4 } else { [int]$parameters.parameters.databasePoolMax.value }
if ($webMinReplicas -notin @(0, 1) -or $voiceGatewayMinReplicas -notin @(0, 1)) { throw 'Private-beta web and gateway minimum replicas must be zero or one; maximum replicas remain one.' }
if ($databasePoolMax -lt 1 -or $databasePoolMax -gt 4) { throw 'The B1ms private-beta plan caps each process PostgreSQL pool at four connections.' }
foreach ($name in @('databaseSecretUri', 'connectorKeySecretUri', 'authLifecycleKeySecretUri')) {
  if ($parameters.parameters.$name.value -notmatch '^https://[^/]+\.vault\.azure\.net/secrets/[^/]+/?$') { throw "Use a versionless Key Vault secret URI for $name." }
}
if ($parameters.parameters.azureDeploymentPricesJson.value) {
  try { $priceMap = $parameters.parameters.azureDeploymentPricesJson.value | ConvertFrom-Json -AsHashtable }
  catch { throw 'azureDeploymentPricesJson must be a JSON object containing only reviewed deployment rates.' }
  if ($priceMap -isnot [hashtable]) { throw 'azureDeploymentPricesJson must be a JSON object.' }
}
if ($parameters.parameters.requireEmailVerification.value -ne $false -and $parameters.parameters.accountEmailEnabled.value -ne $true) { throw 'Production email verification is required by default. Configure an existing ACS Email resource/key/sender before planning a ready public deployment.' }
# What-if is read-only infrastructure planning. This script never runs create/deploy.
# Parameter files contain resource references only; secret values remain in Key Vault.
& az deployment group what-if --resource-group $ResourceGroup --template-file $template --parameters "@$parametersPath" --only-show-errors
if ($LASTEXITCODE -ne 0) { throw 'Azure what-if failed; no deployment was applied.' }
