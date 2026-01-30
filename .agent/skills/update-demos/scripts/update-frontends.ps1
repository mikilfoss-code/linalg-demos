param(
  [switch]$Latest,
  [string]$RepoRoot = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-LastExit([string]$what) {
  if ($LASTEXITCODE -ne 0) { throw "$what failed (exit $LASTEXITCODE)" }
}

$demosRoot = Join-Path $RepoRoot "demos"
if (-not (Test-Path -LiteralPath $demosRoot)) { throw "No demos/ folder found at $demosRoot" }

$frontends = Get-ChildItem -LiteralPath $demosRoot -Directory |
  ForEach-Object {
    $p = Join-Path $_.FullName "frontend"
    if (Test-Path -LiteralPath $p) { $p }
  }

if (-not $frontends) { throw "No demos/*/frontend folders found." }

foreach ($dir in $frontends) {
  Write-Host "`n=== Frontend: $dir ===" -ForegroundColor Cyan

  & pnpm -C "$dir" install
  Assert-LastExit "pnpm install ($dir)"

  if ($Latest) { & pnpm -C "$dir" up --latest } else { & pnpm -C "$dir" up }
  Assert-LastExit "pnpm up ($dir)"

  & pnpm -C "$dir" build
  Assert-LastExit "pnpm build ($dir)"
}

Write-Host "`nAll frontends updated + built OK." -ForegroundColor Green
