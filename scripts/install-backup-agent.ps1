param([Parameter(Mandatory=$true)][string]$Config,[string]$At='02:00',[switch]$RegisterDaily)
$ErrorActionPreference = 'Stop'
$raw = Get-Content -LiteralPath $Config -Raw
$settings = $raw | ConvertFrom-Json
if (-not $settings.token -or -not $settings.key -or -not $settings.origin) { throw 'Incomplete backup agent configuration.' }
$configDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) '.data\backup-agent'
New-Item -ItemType Directory -Path $configDirectory -Force | Out-Null
$protectedPath = Join-Path $configDirectory 'config.dpapi'
$raw | ConvertTo-SecureString -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $protectedPath -NoNewline
if ($RegisterDaily) {
  & (Join-Path $PSScriptRoot 'activate-backup-daily.ps1') -At $At
}
Write-Output 'Configuration protected with Windows CurrentUser DPAPI. Keep the independent recovery key safe; remove the original plaintext configuration after verifying the agent.'
