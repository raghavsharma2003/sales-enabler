param(
  [Parameter(Mandatory = $true)][string]$RegistryName,
  [Parameter(Mandatory = $true)][string]$SourceUrl,
  [Parameter(Mandatory = $true)][string]$SourceCommit,
  [string]$RepositoryPrefix = 'sales-enabler',
  [switch]$Execute
)

$ErrorActionPreference = 'Stop'
if (-not (Get-Command az -ErrorAction SilentlyContinue)) { throw 'Azure CLI is unavailable. No remote build was attempted.' }
if ($SourceUrl -notmatch '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?$') { throw 'Use the reviewed HTTPS GitHub repository URL without credentials or query parameters.' }
if ($SourceCommit -notmatch '^[a-f0-9]{40}$') { throw 'Remote builds require the exact reviewed 40-character commit SHA.' }
if ($RepositoryPrefix -notmatch '^[a-z0-9]+(?:[._/-][a-z0-9]+)*$') { throw 'Use a lowercase ACR repository prefix.' }
if (-not $Execute) {
  Write-Output 'Remote build plan validated. Re-run with -Execute only after the exact commit has passed final tests and is available at the reviewed remote. No build was started.'
  exit 0
}

$context = "$SourceUrl#$SourceCommit"
$targets = @(
  @{ Target = 'web'; Repository = "$RepositoryPrefix/web" },
  @{ Target = 'voice-gateway'; Repository = "$RepositoryPrefix/voice-gateway" },
  @{ Target = 'private-voice-supervisor'; Repository = "$RepositoryPrefix/private-voice-supervisor" }
)
foreach ($item in $targets) {
  & az acr build --registry $RegistryName --target $item.Target --image "$($item.Repository):$SourceCommit" $context --only-show-errors
  if ($LASTEXITCODE -ne 0) { throw "Remote ACR build failed for target $($item.Target). No later target was started." }
}
Write-Output 'Remote Azure builds completed. Resolve each tag to its immutable digest and use only repository@sha256 references in the private deployment parameter file.'
