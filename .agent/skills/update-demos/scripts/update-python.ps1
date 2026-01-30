param(
  # Shared venv root. Use Join-Path to avoid parsing issues.
  [string]$Venv = (Join-Path $env:USERPROFILE '.venvs\linalg-demos'),

  # If set, refresh pins (upgrade within your allowed constraints)
  [switch]$Upgrade
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Ensure we are running from repo root (must contain backend/)
if (-not (Test-Path -LiteralPath '.\backend')) {
  throw "Run this script from the repo root (expected .\backend\). Current dir: $(Get-Location)"
}

$activate = Join-Path $Venv 'Scripts\Activate.ps1'
if (-not (Test-Path -LiteralPath $activate)) {
  throw "Shared venv activation script not found: $activate"
}

Write-Host "== Activating shared venv =="
. $activate

if (-not $env:VIRTUAL_ENV) {
  throw "Venv activation did not set VIRTUAL_ENV. Activation may have failed."
}

$pyExe = python -c 'import sys; print(sys.executable)'
Write-Host ("Python: {0}" -f $pyExe)

$uvVer = uv --version
Write-Host ("uv:     {0}" -f $uvVer)

$reqIn  = 'backend\requirements.in'
$reqTxt = 'backend\requirements.txt'

if (-not (Test-Path -LiteralPath $reqIn)) {
  throw "Missing $reqIn. Create it with direct deps only."
}

Write-Host "`n== Compile lockfile =="

# Build args as an array to avoid quoting problems
$compileArgs = @('pip','compile', $reqIn, '-o', $reqTxt)
if ($Upgrade) { $compileArgs += '--upgrade' }

& uv @compileArgs
if ($LASTEXITCODE -ne 0) { throw "uv pip compile failed (exit $LASTEXITCODE)" }

Write-Host "`n== Sync shared venv exactly to lockfile =="
& uv 'pip' 'sync' $reqTxt
if ($LASTEXITCODE -ne 0) { throw "uv pip sync failed (exit $LASTEXITCODE)" }

Write-Host "`n== Backend compile check =="
python -m compileall .\backend
if ($LASTEXITCODE -ne 0) { throw "python -m compileall failed (exit $LASTEXITCODE)" }

Write-Host "`nPython dependency update complete." -ForegroundColor Green
