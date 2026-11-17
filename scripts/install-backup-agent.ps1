param([Parameter(Mandatory=$true)][string]$Config,[string]$At='02:00',[switch]$RegisterDaily)
$ErrorActionPreference = 'Stop'
$raw = Get-Content -LiteralPath $Config -Raw
$settings = $raw | ConvertFrom-Json
if (-not $settings.token -or -not $settings.key -or -not $settings.origin) { throw 'Incomplete backup agent configuration.' }
$configDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) '.data\backup-agent'
New-Item -ItemType Directory -Path $configDirectory -Force | Out-Null
$protectedPath = Join-Path $configDirectory 'config.dpapi'
$raw | ConvertTo-SecureString -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $protectedPath
if ($RegisterDaily) {
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "{0}" -ProtectedConfig "{1}"' -f (Join-Path $PSScriptRoot 'backup-agent.ps1'),$protectedPath) -WorkingDirectory (Split-Path -Parent $PSScriptRoot)
  $trigger = New-ScheduledTaskTrigger -Daily -At $At
  $options = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName 'NeuraTec Landscape Backup' -Action $action -Trigger $trigger -Settings $options -Description 'Encrypted platform recovery kit; current Windows user must be signed in.' -Force | Out-Null
}
Write-Output 'Configuration protected with Windows CurrentUser DPAPI. Keep the independent recovery key safe; remove the original plaintext configuration after verifying the agent.'
