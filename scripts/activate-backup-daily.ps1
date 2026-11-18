param([string]$DriveFolder,[string]$At='02:00')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$protectedConfig=Join-Path $repo '.data\backup-agent\config.dpapi'
$runner=Join-Path $PSScriptRoot 'backup-daily.ps1'
if (-not (Test-Path -LiteralPath $protectedConfig)) { throw 'No existe la configuracion cifrada del agente.' }
$null=ConvertTo-SecureString (Get-Content -LiteralPath $protectedConfig -Raw).Trim()
$taskName='NeuraTec Landscape Backup'
$existing=Get-ScheduledTask -ErrorAction Stop | Where-Object TaskName -eq $taskName
if ($existing -and ($existing.Actions.Arguments -notlike ('*'+$runner+'*'))) { throw 'Existe una tarea distinta con este nombre. No se modifica.' }
if (-not $DriveFolder) {
  $candidates=@(Get-PSDrive -PSProvider FileSystem | Where-Object Name -ne 'Temp' | ForEach-Object {
    $driveRoot=$_.Root
    foreach ($name in @('My Drive','Mi unidad')) {
      $candidate=Join-Path (Join-Path $driveRoot $name) 'Neura Landscape — Respaldos cifrados'
      if (Test-Path -LiteralPath $candidate -PathType Container) { $candidate }
    }
  })
  if ($candidates.Count -ne 1) { throw 'No se identifico una carpeta unica de respaldos. Ejecutar otra vez con -DriveFolder y la ruta exacta de la carpeta existente en Drive.' }
  $DriveFolder=$candidates[0]
}
if (-not (Test-Path -LiteralPath $DriveFolder -PathType Container)) { throw 'La carpeta de Drive no existe. No se crean carpetas duplicadas.' }
@{drive_folder=(Resolve-Path -LiteralPath $DriveFolder).Path} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $repo '.data\backup-agent\destination.json') -Encoding UTF8
# Verificar el circuito completo antes de registrar la tarea.
& $runner
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "{0}"' -f $runner) -WorkingDirectory $repo
$trigger=New-ScheduledTaskTrigger -Daily -At $At
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Neura Landscape: respaldo local cifrado y copia a Drive, diario a las 02:00; requiere sesion Windows iniciada y red.' -Force | Out-Null
Write-Output 'Circuito local y carpeta Drive verificados. Tarea diaria registrada. Falta comprobar la sincronizacion remota de Google Drive.'
Get-ScheduledTaskInfo -TaskName $taskName | Select-Object LastRunTime,LastTaskResult,NextRunTime
