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
if ($parameters.parameters.enableVoiceGateway.value -eq $true) {
  if ($parameters.parameters.azureEnabled.value -ne $true) { throw 'The public gateway requires the existing Azure voice configuration.' }
  if ($parameters.parameters.voiceGatewayImage.value -notmatch '@sha256:[a-fA-F0-9]{64}$') { throw 'Enabled voice gateways require an immutable image digest.' }
  if ($parameters.parameters.publicVoiceGatewayUrl.value -notmatch '^wss://[^/]+/voice$') { throw 'Set the public WSS gateway URL ending in /voice.' }
  if (-not $parameters.parameters.publicSessionHashSecretUri.value) { throw 'Set the existing public-session hashing secret URI.' }
}
if ($parameters.parameters.requireEmailVerification.value -ne $false -and $parameters.parameters.accountEmailEnabled.value -ne $true) { throw 'Production email verification is required by default. Configure an existing ACS Email resource/key/sender before planning a ready public deployment.' }
# What-if is read-only infrastructure planning. This script never runs create/deploy.
# Parameter files contain resource references only; secret values remain in Key Vault.
& az deployment group what-if --resource-group $ResourceGroup --template-file $template --parameters "@$parametersPath" --only-show-errors
if ($LASTEXITCODE -ne 0) { throw 'Azure what-if failed; no deployment was applied.' }
