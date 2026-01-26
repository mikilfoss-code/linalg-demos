param(
  [switch]$LatestFrontends,
  [switch]$UpgradePython,
  [string]$NodeMajor = "25",
  [string]$PnpmMajor = "10"
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# Use the current PowerShell host (pwsh if you're in pwsh; powershell if you're in Windows PowerShell)
$psExe = (Get-Process -Id $PID).Path
if (-not $psExe) { $psExe = "powershell" }

& $psExe -ExecutionPolicy Bypass -File (Join-Path $here "update-tools.ps1") `
  -NodeMajor $NodeMajor -PnpmMajor $PnpmMajor

$pythonArgs = @('-ExecutionPolicy','Bypass','-File', (Join-Path $here "update-python.ps1"))
if ($UpgradePython) { $pythonArgs += '-Upgrade' }
& $psExe @pythonArgs

$frontendArgs = @('-ExecutionPolicy','Bypass','-File', (Join-Path $here "update-frontends.ps1"))
if ($LatestFrontends) { $frontendArgs += '-Latest' }
& $psExe @frontendArgs

Write-Host "`nDone. Start backend separately to verify /health if it's not already running." -ForegroundColor Yellow
