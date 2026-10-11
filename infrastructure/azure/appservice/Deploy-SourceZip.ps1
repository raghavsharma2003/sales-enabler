param(
  [Parameter(Mandatory = $true)][string]$SubscriptionId,
  [Parameter(Mandatory = $true)][string]$TenantId,
  [Parameter(Mandatory = $true)][string]$ResourceGroup,
  [Parameter(Mandatory = $true)][string]$ExpectedPlanName,
  [Parameter(Mandatory = $true)][ValidateSet('westus3', 'centralindia')][string]$ExpectedLocation,
  [Parameter(Mandatory = $true)][string]$WebAppName,
  [Parameter(Mandatory = $true)][string]$GatewayAppName,
  [Parameter(Mandatory = $true)][string]$VoiceLiveAppName,
  [Parameter(Mandatory = $true)][string]$SourceUrl,
  [Parameter(Mandatory = $true)][string]$SourceCommit,
  [switch]$Execute
)

$ErrorActionPreference = 'Stop'
if (-not (Get-Command az -ErrorAction SilentlyContinue) -or -not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Azure CLI and Git are required in Azure Cloud Shell. No deployment was attempted.' }
if ($SubscriptionId -notmatch '^[a-fA-F0-9-]{36}$' -or $TenantId -notmatch '^[a-fA-F0-9-]{36}$') { throw 'Supply the exact reviewed subscription and tenant IDs privately.' }
if ($SourceUrl -notmatch '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?$') { throw 'Use the reviewed HTTPS GitHub repository URL without credentials or query parameters.' }
if ($SourceCommit -notmatch '^[a-f0-9]{40}$') { throw 'ZIP deployment requires the exact reviewed 40-character commit SHA.' }
if (@(@($WebAppName, $GatewayAppName, $VoiceLiveAppName) | Select-Object -Unique).Count -ne 3) { throw 'Three distinct App Service app names are required.' }
if (-not $Execute) {
  Write-Output 'Native App Service ZIP deployment plan validated. Re-run with -Execute only in Azure Cloud Shell after infrastructure what-if/apply and final commit verification. No clone, build or deployment was started.'
  exit 0
}

$account = & az account show --subscription $SubscriptionId --query '{subscription:id,tenant:tenantId}' --output json --only-show-errors | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $account.subscription -ne $SubscriptionId -or $account.tenant -ne $TenantId) { throw 'Azure CLI context does not match the reviewed startup subscription and tenant.' }
$plan = & az appservice plan show --subscription $SubscriptionId --resource-group $ResourceGroup --name $ExpectedPlanName --query '{id:id,location:location,reserved:reserved,sku:sku.name,tags:tags}' --output json --only-show-errors | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $plan.reserved -or $plan.sku -notin @('B2', 'B3') -or (($plan.location -replace '\s','').ToLowerInvariant() -ne $ExpectedLocation) -or
    $plan.tags.product -ne 'sales-enabler' -or $plan.tags.environment -ne 'private-beta' -or $plan.tags.architecture -ne 'native-app-service') { throw 'Expected dedicated native App Service plan failed the reviewed identity, region, SKU or tag checks.' }
foreach ($appName in @($WebAppName, $GatewayAppName, $VoiceLiveAppName)) {
  $app = & az webapp show --subscription $SubscriptionId --resource-group $ResourceGroup --name $appName --query '{plan:serverFarmId,kind:kind,tags:tags}' --output json --only-show-errors | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $app.plan -ne $plan.id -or $app.kind -notmatch 'linux' -or
      $app.tags.product -ne 'sales-enabler' -or $app.tags.environment -ne 'private-beta' -or $app.tags.architecture -ne 'native-app-service') { throw 'An App Service role failed the reviewed plan, platform or tag check. No source was uploaded.' }
}

$taskRoot = Join-Path ([IO.Path]::GetTempPath()) ("sales-enabler-appservice-" + [Guid]::NewGuid().ToString('N'))
$resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$resolvedTask = [IO.Path]::GetFullPath($taskRoot)
if (-not $resolvedTask.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) { throw 'Temporary workspace escaped the operating-system temp directory.' }
New-Item -ItemType Directory -Path $resolvedTask | Out-Null
try {
  $repo = Join-Path $resolvedTask 'repo'
  & git clone --filter=blob:none --no-checkout $SourceUrl $repo
  if ($LASTEXITCODE -ne 0) { throw 'Reviewed source clone failed.' }
  & git -C $repo checkout --detach $SourceCommit
  if ($LASTEXITCODE -ne 0 -or (& git -C $repo rev-parse HEAD).Trim() -ne $SourceCommit) { throw 'Exact reviewed commit checkout failed.' }
  $zip = Join-Path $resolvedTask 'source.zip'
  $paths = @('app', 'components', 'lib', 'public', 'scripts', 'infrastructure/azure/appservice', 'package.json', 'package-lock.json', 'next.config.ts', 'proxy.ts', 'tsconfig.json', 'next-env.d.ts')
  & git -C $repo cat-file -e "$SourceCommit`:proxy.ts"
  if ($LASTEXITCODE -ne 0) { throw 'The exact source commit is missing proxy.ts; public talk frame authority cannot be packaged.' }
  & git -C $repo archive --format=zip --output=$zip $SourceCommit -- $paths
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $zip)) { throw 'Source ZIP creation failed.' }
  foreach ($appName in @($WebAppName, $GatewayAppName, $VoiceLiveAppName)) {
    & az webapp deploy --subscription $SubscriptionId --resource-group $ResourceGroup --name $appName --src-path $zip --type zip --clean true --restart true --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw "ZIP deployment failed for one App Service role; no later role was deployed." }
  }
} finally {
  if (Test-Path -LiteralPath $resolvedTask) { Remove-Item -LiteralPath $resolvedTask -Recurse -Force }
}
