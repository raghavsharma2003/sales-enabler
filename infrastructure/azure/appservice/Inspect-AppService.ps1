param(
  [Parameter(Mandatory = $true)][string]$ResourceGroup,
  [Parameter(Mandatory = $true)][string]$ParametersFile
)

$ErrorActionPreference = 'Stop'
if (-not (Get-Command az -ErrorAction SilentlyContinue)) { throw 'Azure CLI is unavailable. No validation or deployment was attempted.' }
$template = Join-Path $PSScriptRoot 'main.bicep'
$parametersPath = (Resolve-Path -LiteralPath $ParametersFile).Path
$parameters = Get-Content -LiteralPath $parametersPath -Raw | ConvertFrom-Json
if (($parameters | ConvertTo-Json -Depth 20) -match 'REPLACE_WITH') { throw 'Replace every example placeholder in a private ignored App Service parameter file.' }

$providerState = & az provider show --namespace Microsoft.Web --query registrationState --output tsv --only-show-errors
if ($LASTEXITCODE -ne 0 -or $providerState -ne 'Registered') { throw 'Microsoft.Web is not registered. Registration is a separate reviewed subscription change; no what-if was attempted.' }
if ($parameters.parameters.location.value -notin @('westus3', 'centralindia')) { throw 'The reviewed native pilot regions are West US 3 or Central India; East US/East US 2 PostgreSQL is restricted for this subscription.' }
if ($parameters.parameters.appServiceSku.value -notin @('B2', 'B3')) { throw 'Native hosting supports B2 for evaluation or B3 after measured pressure. B1 is below the reviewed process memory envelope.' }
if ([int]$parameters.parameters.databasePoolMax.value -lt 1 -or [int]$parameters.parameters.databasePoolMax.value -gt 4) { throw 'The B1ms database plan caps each process pool at four connections.' }
$appNames = @($parameters.parameters.webAppName.value, $parameters.parameters.gatewayAppName.value, $parameters.parameters.voiceLiveAppName.value)
if (@($appNames | Select-Object -Unique).Count -ne 3) { throw 'Web, public/continuous gateway, and Voice Live gateway require three distinct App Service app names.' }
if (@($appNames | Where-Object { $_ -notmatch '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$' }).Count -gt 0) { throw 'Use valid globally unique lowercase App Service names.' }
if ($parameters.parameters.inferenceAllowedOrganizationIds.value -notmatch '^[^,\s]+(?:,[^,\s]+)*$') { throw 'Set a finite comma-separated private-beta organization allowlist.' }
if ($parameters.parameters.azureOpenAiEndpoint.value -notmatch '^https://[^/]+(?:/openai/v1)?/?$') { throw 'Use the existing authorized HTTPS Azure OpenAI origin.' }
if ($parameters.parameters.azureVoiceLiveEndpoint.value -notmatch '^https://[a-z0-9][a-z0-9.-]*\.(services\.ai\.azure\.com|cognitiveservices\.azure\.com)/?$') { throw 'Use the existing authorized Azure Voice Live resource origin.' }
if ($parameters.parameters.azureSpeechRegion.value -notmatch '^[a-z][a-z0-9-]{1,40}$') { throw 'Use the existing Azure Speech region.' }
if ($parameters.parameters.accountEmailEndpoint.value -notmatch '^https://[a-z0-9-]+(?:\.[a-z0-9-]+)?\.communication[s]?\.azure\.com/?$') { throw 'Use the approved ACS Email endpoint.' }
if ($parameters.parameters.accountEmailSender.value -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') { throw 'Use the approved ACS sender address.' }
if ($parameters.parameters.budgetStartDate.value -notmatch '^20\d{2}-(0[1-9]|1[0-2])-01T00:00:00Z$') { throw 'Budget start date must be the first UTC day of its deployment month.' }
$contacts = @($parameters.parameters.budgetContactEmails.value)
if ($contacts.Count -lt 1 -or @($contacts | Where-Object { $_ -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$' }).Count -gt 0) { throw 'Supply at least one valid billing-alert email.' }

$secureValues = [ordered]@{
  postgresAdministratorPassword = $env:SALES_ENABLER_POSTGRES_ADMIN_PASSWORD
  databaseUrl = $env:SALES_ENABLER_DATABASE_URL
  connectorEncryptionKey = $env:SALES_ENABLER_CONNECTOR_ENCRYPTION_KEY
  authLifecycleKey = $env:SALES_ENABLER_AUTH_LIFECYCLE_KEY
  publicSessionHashSecret = $env:SALES_ENABLER_PUBLIC_SESSION_HASH_SECRET
  azureOpenAiKey = $env:SALES_ENABLER_AZURE_OPENAI_KEY
  azureSpeechKey = $env:SALES_ENABLER_AZURE_SPEECH_KEY
  accountEmailAccessKey = $env:SALES_ENABLER_ACS_EMAIL_ACCESS_KEY
}
foreach ($entry in $secureValues.GetEnumerator()) {
  if (-not $entry.Value) { throw "Set $($entry.Key) through its documented private shell environment variable; no value is printed or stored by this script." }
}
if ($secureValues.postgresAdministratorPassword.Length -lt 8 -or $secureValues.postgresAdministratorPassword.Length -gt 128) { throw 'PostgreSQL administrator password must contain 8-128 characters.' }
if ($secureValues.connectorEncryptionKey -notmatch '^[a-fA-F0-9]{64}$' -or $secureValues.authLifecycleKey -notmatch '^[a-fA-F0-9]{64}$') { throw 'Application encryption keys must each be 64 hexadecimal characters.' }
if ($secureValues.publicSessionHashSecret.Length -lt 32) { throw 'Public session secret must contain at least 32 characters.' }
if ($secureValues.azureOpenAiKey.Length -lt 20 -or $secureValues.azureSpeechKey.Length -lt 20 -or $secureValues.accountEmailAccessKey.Length -lt 20) { throw 'Azure runtime credentials are missing or structurally too short.' }
try {
  $databaseUri = [Uri]$secureValues.databaseUrl
  if ($databaseUri.Scheme -notin @('postgres', 'postgresql') -or $databaseUri.Host -notmatch '\.postgres\.database\.azure\.com$' -or $databaseUri.Query -notmatch 'sslmode=(verify-full|verify-ca)') { throw 'invalid' }
} catch { throw 'DATABASE_URL must be a PostgreSQL URL with certificate-verifying TLS.' }
if ($parameters.parameters.azureDeploymentPricesJson.value) {
  try { $priceMap = $parameters.parameters.azureDeploymentPricesJson.value | ConvertFrom-Json -AsHashtable }
  catch { throw 'azureDeploymentPricesJson must be a reviewed JSON object.' }
  if ($priceMap -isnot [hashtable]) { throw 'azureDeploymentPricesJson must be a JSON object.' }
}

& az bicep build --file $template --stdout | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'App Service Bicep compilation failed. No deployment was attempted.' }
$secretArguments = $secureValues.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }
& az deployment group what-if --resource-group $ResourceGroup --template-file $template --parameters "@$parametersPath" $secretArguments --only-show-errors
if ($LASTEXITCODE -ne 0) { throw 'Native App Service what-if failed; no deployment was applied.' }
