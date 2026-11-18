[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [ValidatePattern('^[a-zA-Z0-9._-]{3,80}$')]
  [string]$Username
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$node = Join-Path $env:ProgramFiles 'nodejs\node.exe'
if (-not (Test-Path -LiteralPath $node)) { throw 'Node.js was not found at the expected local installation path.' }
if (-not $Username) { $Username = Read-Host 'Local development administrator username' }

$password = Read-Host 'Local development administrator password (12+ characters)' -AsSecureString
$confirmation = Read-Host 'Confirm password' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
$confirmationPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmation)
try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $plainConfirmation = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmationPointer)
  if ($plainPassword -cne $plainConfirmation) { throw 'Passwords do not match. No account was created.' }

  $storeDirectory = Join-Path $env:LOCALAPPDATA 'FutureScaping\DemoMonitoringSystem'
  $storePath = Join-Path $storeDirectory 'access-users.json'
  $plainPassword | & $node (Join-Path $PSScriptRoot 'write-local-development-admin.mjs') --store $storePath --username $Username --label 'Local development administrator'
  if ($LASTEXITCODE -ne 0) { throw 'The local development administrator could not be saved.' }
} finally {
  if ($null -ne $passwordPointer) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }
  if ($null -ne $confirmationPointer) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmationPointer) }
  Remove-Variable plainPassword, plainConfirmation -ErrorAction SilentlyContinue
}
