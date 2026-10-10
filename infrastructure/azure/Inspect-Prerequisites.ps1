param(
  [Parameter(Mandatory = $true)][string]$ResourceGroup,
  [Parameter(Mandatory = $true)][string]$ParametersFile
)

$ErrorActionPreference = 'Stop'
if (-not (Get-Command az -ErrorAction SilentlyContinue)) { throw 'Azure CLI is unavailable. No validation or deployment was attempted.' }
$template = Join-Path $PSScriptRoot 'prerequisites.bicep'
$parametersPath = (Resolve-Path -LiteralPath $ParametersFile).Path
$parameters = Get-Content -LiteralPath $parametersPath -Raw | ConvertFrom-Json
$serialized = $parameters | ConvertTo-Json -Depth 20
if ($serialized -match 'REPLACE_WITH') { throw 'Replace every example placeholder in a private ignored parameter file.' }

$requiredNames = @('namePrefix', 'registryName', 'logAnalyticsWorkspaceName', 'keyVaultName', 'postgresServerName', 'postgresAdministratorLogin')
foreach ($name in $requiredNames) {
  if (-not $parameters.parameters.$name.value) { throw "Missing prerequisite parameter: $name." }
}
if ($parameters.parameters.location.value -ne 'eastus2') { throw 'The reviewed private-beta region is eastus2. Re-review quota, prices and data location before changing it.' }
if ($parameters.parameters.postgresSkuName.value -notin @('Standard_B1ms', 'Standard_B2s')) { throw 'Use only the reviewed burstable PostgreSQL beta SKUs.' }
if ([int]$parameters.parameters.postgresStorageGiB.value -lt 32 -or [int]$parameters.parameters.postgresStorageGiB.value -gt 128) { throw 'PostgreSQL storage must remain between 32 and 128 GiB for this beta plan.' }
if ([int]$parameters.parameters.postgresBackupRetentionDays.value -lt 7 -or [int]$parameters.parameters.postgresBackupRetentionDays.value -gt 35) { throw 'PostgreSQL backup retention must stay within the managed 7-35 day window.' }
if ($parameters.parameters.postgresPrivateDnsZoneName.value -notmatch '^[a-z0-9.-]+\.postgres\.database\.azure\.com$') { throw 'Use a private DNS zone ending in postgres.database.azure.com.' }
if ([int]$parameters.parameters.monthlyBudgetUsd.value -lt 25 -or [int]$parameters.parameters.monthlyBudgetUsd.value -gt 500) { throw 'Monthly budget must remain within the reviewed private-beta alert range.' }
if ($parameters.parameters.budgetStartDate.value -notmatch '^20\d{2}-(0[1-9]|1[0-2])-01T00:00:00Z$') { throw 'Budget start date must be the first UTC day of its deployment month.' }
$contacts = @($parameters.parameters.budgetContactEmails.value)
if ($contacts.Count -lt 1 -or @($contacts | Where-Object { $_ -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$' }).Count -gt 0) { throw 'Supply at least one valid private billing-alert email.' }

$password = $env:SALES_ENABLER_POSTGRES_ADMIN_PASSWORD
if (-not $password -or $password.Length -lt 8 -or $password.Length -gt 128) { throw 'Set SALES_ENABLER_POSTGRES_ADMIN_PASSWORD privately for what-if; it is never printed or stored by this script.' }

# Build catches Bicep type/schema errors. What-if is planning only and never applies resources.
& az bicep build --file $template --stdout | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Prerequisite Bicep compilation failed. No deployment was attempted.' }
& az deployment group what-if --resource-group $ResourceGroup --template-file $template --parameters "@$parametersPath" "postgresAdministratorPassword=$password" --only-show-errors
if ($LASTEXITCODE -ne 0) { throw 'Azure prerequisite what-if failed; no deployment was applied.' }
