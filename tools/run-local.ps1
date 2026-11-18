[CmdletBinding()]
param(
  [ValidateRange(1, 65535)]
  [int]$Port = 3080
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$node = Join-Path $env:ProgramFiles 'nodejs\node.exe'
$storePath = Join-Path (Join-Path $env:LOCALAPPDATA 'FutureScaping\DemoMonitoringSystem') 'access-users.json'
if (-not (Test-Path -LiteralPath $node)) { throw 'Node.js was not found at the expected local installation path.' }
if (-not (Test-Path -LiteralPath $storePath)) {
  throw "No local development account is configured. Run .\tools\register-local-development-admin.ps1 first."
}

$env:ACCESS_USERS_PATH = $storePath
$env:LOCAL_DEVELOPMENT_AUTH = '1'
$env:PORT = [string]$Port
Set-Location -LiteralPath $repoRoot
& $node '.\server.js'
