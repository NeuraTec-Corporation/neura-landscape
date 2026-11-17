param([Parameter(Mandatory=$true)][string]$ProtectedConfig)
$ErrorActionPreference = 'Stop'
$secure = Get-Content -LiteralPath $ProtectedConfig -Raw | ConvertTo-SecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:NEURATEC_BACKUP_CONFIG = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  Push-Location (Split-Path -Parent $PSScriptRoot)
  try { & node (Join-Path $PSScriptRoot 'backup-local.mjs'); if ($LASTEXITCODE -ne 0) { throw 'Backup agent did not complete.' } }
  finally { Pop-Location }
} finally {
  $env:NEURATEC_BACKUP_CONFIG = $null
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
