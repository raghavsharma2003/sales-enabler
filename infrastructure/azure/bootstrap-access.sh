#!/usr/bin/env bash
set -Eeuo pipefail
set -o noclobber
umask 077

readonly RESOURCE_GROUP="sales-enabler-prod"
readonly CONTRIBUTOR_ROLE_ID="b24988ac-6180-42a0-ab88-20f7382dd24c"
readonly OWNER_ROLE_ID="8e3af657-a8ff-443c-a75c-2fe8c4bcb635"
readonly RBAC_ADMIN_ROLE_ID="f58310d9-a9f6-439a-9e8d-f62e7b41a168"
readonly UAA_ROLE_ID="18d7d88d-d35e-4fb5-a5c3-7773c20a72d9"
readonly FOUNDRY_OWNER_ROLE_ID="c883944f-8b7b-4483-af10-35834be79c4a"

work_dir="$(pwd -P)"
output_file="${work_dir}/.env.azure-management.local"
receipt_file="${work_dir}/.sales-enabler-bootstrap-receipt"
mutations_started=false

failure_notice() {
  local status=$?
  set +x
  printf '\nBootstrap stopped before completion.\n' >&2
  if [[ "$mutations_started" == true ]]; then
    printf 'Partial Azure state may exist. Do not blindly rerun this script.\n' >&2
    printf 'Use the nonsecret recovery receipt if it exists: %s\n' "$receipt_file" >&2
  else
    printf 'No Azure changes were started by this script.\n' >&2
  fi
  printf 'No client secret is printed by this error handler.\n' >&2
  exit "$status"
}
trap failure_notice ERR
die() { printf 'ERROR: %s\n' "$*" >&2; return 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"; }

need az
need python3
[[ ! -e "$output_file" ]] || die "$output_file already exists. This script will not overwrite it."
[[ ! -e "$receipt_file" ]] || die "$receipt_file already exists. Review it before starting another bootstrap."

printf '%s\n' \
  'Sales Enabler Azure access bootstrap' \
  'Run this only in Azure Cloud Shell while signed into the personal/startup tenant.' \
  'This creates one new, uniquely named identity. It never resets an existing app.' ''

read -r -p 'Paste the exact Founders Hub grant subscription ID: ' subscription_id
[[ "$subscription_id" =~ ^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$ ]] \
  || die 'Subscription ID is not a GUID.'
az account set --subscription "$subscription_id"
account_id="$(az account show --query id -o tsv)"
[[ "${account_id,,}" == "${subscription_id,,}" ]] || die 'Azure CLI selected a different subscription.'
subscription_name="$(az account show --query name -o tsv)"
tenant_id="$(az account show --query tenantId -o tsv)"
user_name="$(az account show --query user.name -o tsv)"
printf '\nSelected Azure context (verify this is your startup account):\n'
printf '  Signed in as: %s\n  Subscription: %s\n  Subscription ID: %s\n  Tenant ID: %s\n' \
  "$user_name" "$subscription_name" "$account_id" "$tenant_id"

accounts_json="$(az resource list --resource-type Microsoft.CognitiveServices/accounts \
  --query "[?kind=='AIServices'].{name:name,resourceGroup:resourceGroup,location:location,id:id}" -o json)"
account_count="$(printf '%s' "$accounts_json" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')"
[[ "$account_count" =~ ^[0-9]+$ ]] || die 'Could not read the Foundry account list.'
(( account_count > 0 )) || die 'No existing kind=AIServices Foundry account was found in this subscription.'
printf '\nExisting Foundry accounts (kind AIServices):\n'
printf '%s' "$accounts_json" | python3 -c '
import json, sys
for number, item in enumerate(json.load(sys.stdin), 1):
    print("  {}) {}  |  group: {}  |  region: {}".format(
        number, item["name"], item["resourceGroup"], item["location"]))
'
printf '\n'
read -r -p "Choose one account by number (1-${account_count}): " account_choice
[[ "$account_choice" =~ ^[0-9]+$ ]] || die 'Selection must be a number.'
(( account_choice >= 1 && account_choice <= account_count )) || die 'Selection is outside the displayed range.'
selected_fields="$(printf '%s' "$accounts_json" | python3 -c '
import json, sys
item = json.load(sys.stdin)[int(sys.argv[1]) - 1]
values = []
for key in ("id", "name", "resourceGroup", "location"):
    value = item.get(key, "")
    if not isinstance(value, str) or not value or any(c in value for c in "\t\n\r"):
        raise SystemExit("invalid account data")
    values.append(value)
print("\t".join(values))
' "$account_choice")"
selected_fields="${selected_fields%$'\r'}"
IFS=$'\t' read -r foundry_id foundry_name foundry_group foundry_location <<< "$selected_fields"
[[ -n "$foundry_id" && -n "$foundry_name" && -n "$foundry_group" && -n "$foundry_location" ]] \
  || die 'Could not read the selected Foundry account.'
[[ "${foundry_id,,}" == "/subscriptions/${subscription_id,,}/"* ]] || die 'Selected account is outside this subscription.'

if [[ "$(az group exists --name "$RESOURCE_GROUP" -o tsv)" == true ]]; then
  location="$(az group show --name "$RESOURCE_GROUP" --query location -o tsv)"
  group_action='Use existing resource group'
else
  location="$foundry_location"
  group_action='Create resource group'
fi
[[ -n "$location" ]] || die 'Could not determine the resource-group location.'

unique_suffix="$(date -u +%Y%m%d%H%M%S)-$(printf '%04x' "$((RANDOM % 65536))")"
app_name="sales-enabler-deployer-${unique_suffix}"
subscription_scope="/subscriptions/${subscription_id}"
resource_group_scope="${subscription_scope}/resourceGroups/${RESOURCE_GROUP}"
printf '\nNo changes have been made yet. Planned changes:\n'
printf '  %s: %s (%s)\n' "$group_action" "$resource_group_scope" "$location"
printf '  Selected Foundry account: %s (group: %s, region: %s)\n' "$foundry_name" "$foundry_group" "$foundry_location"
printf '  Create new app + service principal: %s\n' "$app_name"
printf '  Contributor: %s\n' "$subscription_scope"
printf '  Owner with delegation exclusions (Owner, UAA, RBAC Admin): %s\n' "$resource_group_scope"
printf '  Foundry Owner: %s\n' "$foundry_id"
printf '  After all grants succeed, create one 30-day secret in: %s\n' "$output_file"
printf '  No subscription Owner or Entra directory administrator role will be granted.\n\n'
read -r -p 'Type APPLY SALES ENABLER ACCESS to continue: ' confirmation
[[ "$confirmation" == 'APPLY SALES ENABLER ACCESS' ]] || die 'Confirmation did not match.'

mutations_started=true
printf '\nCreating the resource group and unique application identity...\n'
az group create --name "$RESOURCE_GROUP" --location "$location" --output none
app_id="$(az ad app create --display-name "$app_name" --sign-in-audience AzureADMyOrg --query appId -o tsv)"
[[ "$app_id" =~ ^[0-9A-Fa-f-]{36}$ ]] || die 'Application creation did not return an application ID.'
{
  printf 'AZURE_APPLICATION_NAME=%s\n' "$app_name"
  printf 'AZURE_CLIENT_ID=%s\n' "$app_id"
  printf 'AZURE_TENANT_ID=%s\n' "$tenant_id"
  printf 'AZURE_SUBSCRIPTION_ID=%s\n' "$subscription_id"
} > "$receipt_file"

sp_object_id=''
for attempt in {1..12}; do
  if created_id="$(az ad sp create --id "$app_id" --query id -o tsv 2>/dev/null)" \
    && [[ "$created_id" =~ ^[0-9A-Fa-f-]{36}$ ]]; then
    sp_object_id="$created_id"; break
  fi
  if visible_id="$(az ad sp show --id "$app_id" --query id -o tsv 2>/dev/null)" \
    && [[ "$visible_id" =~ ^[0-9A-Fa-f-]{36}$ ]]; then
    sp_object_id="$visible_id"; break
  fi
  if (( attempt < 12 )); then
    sleep 5
  fi
done
[[ "$sp_object_id" =~ ^[0-9A-Fa-f-]{36}$ ]] || die 'The new service principal did not become readable within one minute.'
printf 'AZURE_SERVICE_PRINCIPAL_OBJECT_ID=%s\n' "$sp_object_id" >> "$receipt_file"

readonly OWNER_DELEGATION_CONDITION="((!(ActionMatches{'Microsoft.Authorization/roleAssignments/write'})) OR (@Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAllValues:GuidNotEquals {${OWNER_ROLE_ID}, ${RBAC_ADMIN_ROLE_ID}, ${UAA_ROLE_ID}})) AND ((!(ActionMatches{'Microsoft.Authorization/roleAssignments/delete'})) OR (@Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAllValues:GuidNotEquals {${OWNER_ROLE_ID}, ${RBAC_ADMIN_ROLE_ID}, ${UAA_ROLE_ID}}))"
printf 'Granting the three confirmed, bounded Azure roles...\n'
az role assignment create --assignee-object-id "$sp_object_id" --assignee-principal-type ServicePrincipal \
  --role "$CONTRIBUTOR_ROLE_ID" --scope "$subscription_scope" --output none
az role assignment create --assignee-object-id "$sp_object_id" --assignee-principal-type ServicePrincipal \
  --role "$OWNER_ROLE_ID" --scope "$resource_group_scope" \
  --condition "$OWNER_DELEGATION_CONDITION" --condition-version '2.0' --output none
az role assignment create --assignee-object-id "$sp_object_id" --assignee-principal-type ServicePrincipal \
  --role "$FOUNDRY_OWNER_ROLE_ID" --scope "$foundry_id" --output none

# Disable inherited shell tracing before any command can receive secret material.
set +x
secret_expiry="$(date -u -d '+30 days' '+%Y-%m-%dT%H:%M:%SZ')"
client_secret="$(az ad app credential reset --id "$app_id" --append \
  --display-name 'sales-enabler-bootstrap-30d' --end-date "$secret_expiry" \
  --query password -o tsv 2>/dev/null)"
[[ -n "$client_secret" ]] || die 'Credential creation returned no secret.'
# Keep the dotenv representation narrow and round-trippable by Node; reject rather than guess.
printf '%s' "$client_secret" | python3 -c '
import sys
s = sys.stdin.read()
if not s or any(ord(c) < 32 or ord(c) > 126 for c in s) or any(c in s for c in "\\\""):
    raise SystemExit(1)
' || die 'The generated secret contains characters unsafe for this dotenv file; the credential file was not written.'
{
  printf 'AZURE_TENANT_ID="%s"\n' "$tenant_id"
  printf 'AZURE_CLIENT_ID="%s"\n' "$app_id"
  printf 'AZURE_CLIENT_SECRET="%s"\n' "$client_secret"
  printf 'AZURE_SUBSCRIPTION_ID="%s"\n' "$subscription_id"
  printf 'AZURE_RESOURCE_GROUP="%s"\n' "$RESOURCE_GROUP"
} > "$output_file"
unset client_secret

printf '\nBootstrap complete.\n'
printf '  Application: %s\n  Client ID: %s\n  Secret expiry (UTC): %s\n' "$app_name" "$app_id" "$secret_expiry"
printf '  Download this private credential file: %s\n' "$output_file"
printf '  Nonsecret recovery receipt: %s\n' "$receipt_file"
printf 'Place the downloaded credential file at the sales-enabler repository root. Do not paste its contents into chat.\n'
