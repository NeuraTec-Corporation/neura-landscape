$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$state=Join-Path $repo '.data\backup-agent'
$statusPath=Join-Path $state 'daily-status.json'
$result=@{started_at=[DateTime]::UtcNow.ToString('o');completed=$false;drive_upload_confirmed=$false}
try {
  $destination=(Get-Content -LiteralPath (Join-Path $state 'destination.json') -Raw | ConvertFrom-Json).drive_folder
  if (-not (Test-Path -LiteralPath $destination -PathType Container)) { throw 'La carpeta de Drive no esta disponible.' }
  $output=& (Join-Path $repo 'scripts\backup-agent.ps1') -ProtectedConfig (Join-Path $state 'config.dpapi')
  $kit=($output -join "`n") | ConvertFrom-Json
  if (-not $kit.saved -or -not $kit.file -or -not $kit.sha256) { throw 'El agente no confirmo el respaldo.' }
  $hash=(Get-FileHash -LiteralPath $kit.file -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $kit.sha256) { throw 'No coincide la huella del respaldo local.' }
  $target=Join-Path $destination ([IO.Path]::GetFileName($kit.file))
  if (Test-Path -LiteralPath $target) { throw 'El archivo de destino ya existe; no se sobrescribe.' }
  Copy-Item -LiteralPath $kit.file -Destination $target -ErrorAction Stop
  if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) { throw 'No coincide la copia de Drive.' }
  $result.completed=$true
  $result.local_file=$kit.file
  $result.drive_file=$target
  $result.sha256=$hash
  $result.source=$kit.source
  $result.note='Copia local y carpeta de Drive verificadas. La confirmacion en Google Drive requiere comprobar la subida remota; no se deduce de la unidad montada.'
} catch {
  $result.error='El respaldo diario no termino. Revisar disponibilidad de Drive, red, agente, fuente publicada y permisos.'
  throw
} finally {
  $result.finished_at=[DateTime]::UtcNow.ToString('o')
  $result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $statusPath -Encoding UTF8
}
& node (Join-Path $repo 'scripts\backup-health.mjs') | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'La comprobacion de salud del respaldo requiere revision.' }
$result | ConvertTo-Json -Depth 4
