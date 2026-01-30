param(
  [string]$HealthUrl = "http://127.0.0.1:8000/health",
  [string]$RepoRoot = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-LastExit([string]$what) {
  if ($LASTEXITCODE -ne 0) { throw "$what failed (exit $LASTEXITCODE)" }
}

Write-Host "== Backend health check =="
Invoke-RestMethod $HealthUrl | Out-Host

Write-Host "`n== Git status =="
git status -sb | Out-Host

# Discover demo frontends
$demosRoot = Join-Path $RepoRoot "demos"
if (-not (Test-Path -LiteralPath $demosRoot)) {
  throw "No demos/ folder found at $demosRoot (run from repo root or pass -RepoRoot)."
}

$frontends = Get-ChildItem -LiteralPath $demosRoot -Directory |
  ForEach-Object {
    $p = Join-Path $_.FullName "frontend"
    if (Test-Path -LiteralPath $p) { $p }
  }

if (-not $frontends) {
  Write-Host "`nNo demos/*/frontend folders found; skipping frontend builds." -ForegroundColor Yellow
  exit 0
}

Write-Host "`n== Frontend build checks =="
foreach ($dir in $frontends) {
  Write-Host "`n=== Frontend: $dir ===" -ForegroundColor Cyan
  & pnpm -C "$dir" build
  Assert-LastExit "pnpm build ($dir)"
}

Write-Host "`nVerify complete." -ForegroundColor Green
