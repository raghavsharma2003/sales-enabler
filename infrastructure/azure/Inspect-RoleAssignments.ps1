param(
  [Parameter(Mandatory = $true)][string]$ResourceGroup,
  [Parameter(Mandatory = $true)][string]$ParametersFile
)

$ErrorActionPreference = 'Stop'
if (-not (Get-Command az -ErrorAction SilentlyContinue)) { throw 'Azure CLI is unavailable. No role what-if or assignment was attempted.' }
$template = Join-Path $PSScriptRoot 'role-assignments.bicep'
$parametersPath = (Resolve-Path -LiteralPath $ParametersFile).Path
$parameters = Get-Content -LiteralPath $parametersPath -Raw | ConvertFrom-Json
if (($parameters | ConvertTo-Json -Depth 20) -match 'REPLACE_WITH') { throw 'Replace every role-assignment placeholder in a private ignored parameter file.' }
foreach ($name in @('registryName', 'keyVaultName', 'runtimeIdentityName', 'deployerPrincipalId', 'postgresServerName')) {
  if (-not $parameters.parameters.$name.value) { throw "Missing role-assignment parameter: $name." }
}
if ($parameters.parameters.enableDeleteLocks.value -ne $true) { throw 'The reviewed beta governance pass requires database and vault delete locks.' }
& az bicep build --file $template --stdout | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Role-assignment Bicep compilation failed. No assignment was attempted.' }
# What-if is read-only. Run this script with a human Owner (or equivalent role and lock permissions) at the approved resource-group scope.
& az deployment group what-if --resource-group $ResourceGroup --template-file $template --parameters "@$parametersPath" --only-show-errors
if ($LASTEXITCODE -ne 0) { throw 'Role-assignment what-if failed; no assignment was applied.' }
