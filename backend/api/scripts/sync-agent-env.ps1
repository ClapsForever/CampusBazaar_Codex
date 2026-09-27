param(
  [string] $AgentDirectory = ''
)

$ErrorActionPreference = 'Stop'
if (-not $AgentDirectory) {
  $backendDirectory = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
  $AgentDirectory = Join-Path $backendDirectory 'agent'
}
$apiEnvPath = Join-Path (Split-Path -Parent $PSScriptRoot) '.env'
$agentEnvPath = Join-Path $AgentDirectory '.env'
if (-not (Test-Path -LiteralPath $apiEnvPath)) { throw 'Business API .env does not exist.' }
if (-not (Test-Path -LiteralPath $agentEnvPath)) { throw 'Agent .env does not exist.' }

$apiValues = @{}
foreach ($line in Get-Content -LiteralPath $apiEnvPath) {
  if ($line -match '^([A-Z_]+)=(.*)$') { $apiValues[$Matches[1]] = $Matches[2] }
}
foreach ($key in @('AGENT_SERVICE_TOKEN', 'INTERNAL_AGENT_TOKEN')) {
  if (-not $apiValues[$key]) { throw "Business API $key is missing." }
}

$updates = [ordered]@{
  SERVICE_AUTH_TOKEN = $apiValues['AGENT_SERVICE_TOKEN']
  BUSINESS_BACKEND_TOKEN = $apiValues['INTERNAL_AGENT_TOKEN']
  BUSINESS_BACKEND_URL = 'http://127.0.0.1:8080'
  MOCK_BACKEND = 'false'
}

$backupPath = "$agentEnvPath.before-campusbazaar"
if (Test-Path -LiteralPath $backupPath) { throw 'Agent .env backup already exists; review it before syncing again.' }
Copy-Item -LiteralPath $agentEnvPath -Destination $backupPath

$lines = [System.Collections.Generic.List[string]]::new()
$seen = [System.Collections.Generic.HashSet[string]]::new()
foreach ($line in Get-Content -LiteralPath $agentEnvPath) {
  if ($line -match '^([A-Z_]+)=') {
    $key = $Matches[1]
    if ($updates.Contains($key)) {
      $lines.Add("$key=$($updates[$key])")
      [void] $seen.Add($key)
      continue
    }
  }
  $lines.Add($line)
}
foreach ($key in $updates.Keys) {
  if (-not $seen.Contains($key)) { $lines.Add("$key=$($updates[$key])") }
}
Set-Content -LiteralPath $agentEnvPath -Value $lines -Encoding utf8
Write-Output 'Agent .env synchronized for local business API. Existing DeepSeek settings were preserved.'
