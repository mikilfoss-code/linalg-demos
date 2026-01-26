param(
  [string]$NodeMajor = "25",
  [string]$PnpmMajor = "10",
  [string]$RepoRoot = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-LastExit([string]$what) {
  if ($LASTEXITCODE -ne 0) { throw "$what failed (exit $LASTEXITCODE)" }
}

function Has-Command([string]$name) {
  return @(Get-Command $name -ErrorAction SilentlyContinue).Count -gt 0
}

function Invoke-WingetUpgradeOrInstall([string]$id, [string]$commandName) {
  & winget upgrade -e --id $id
  $exit = $LASTEXITCODE

  $notInstalledCodes = @(-1978335189, -1978335212)
  if ($notInstalledCodes -contains $exit) {
    if (Has-Command $commandName) {
      Write-Host "winget has no record for $id, but $commandName is already available; skipping install." -ForegroundColor Yellow
      $global:LASTEXITCODE = 0
      return
    }

    Write-Host "Installing $id via winget..." -ForegroundColor Yellow
    & winget install -e --id $id
    $exit = $LASTEXITCODE
  }

  if ($exit -ne 0) { throw "winget update/install failed for $id (exit $exit)" }
}

function Resolve-NodeMajor([string]$ExplicitMajor, [string]$RepoRoot) {
  if (-not [string]::IsNullOrWhiteSpace($ExplicitMajor)) {
    return $ExplicitMajor
  }

  # Derive the major from .nvmrc so updates stay aligned with the repo pin.
  $nvmrc = Join-Path $RepoRoot ".nvmrc"
  if (-not (Test-Path -LiteralPath $nvmrc)) {
    throw "Node major not provided and .nvmrc not found at $nvmrc"
  }

  $raw = (Get-Content -LiteralPath $nvmrc -TotalCount 1).Trim()
  if (-not $raw) { throw ".nvmrc is empty; cannot resolve Node major." }

  $raw = $raw -replace '^v', ''
  $major = $raw.Split('.')[0]
  if (-not ($major -match '^\d+$')) {
    throw "Unable to parse Node major from .nvmrc value '$raw'"
  }

  return $major
}

Write-Host "== Updating uv + Volta (WinGet) =="

Invoke-WingetUpgradeOrInstall -id 'astral-sh.uv' -commandName 'uv'
Invoke-WingetUpgradeOrInstall -id 'Volta.Volta' -commandName 'volta'

Write-Host "`n== Volta toolchain =="
& volta --version

$resolvedNodeMajor = Resolve-NodeMajor -ExplicitMajor $NodeMajor -RepoRoot $RepoRoot
Write-Host ("Using Node major: {0}" -f $resolvedNodeMajor)
& volta install "node@$resolvedNodeMajor"
Assert-LastExit "volta install node"

if ($env:VOLTA_FEATURE_PNPM -eq "1") {
  & volta install "pnpm@$PnpmMajor"
  Assert-LastExit "volta install pnpm"
} else {
  & corepack enable pnpm
  & corepack prepare pnpm@latest --activate
  Assert-LastExit "corepack prepare pnpm"
}

Write-Host "`n== Versions =="
& uv --version
& node -v
& pnpm -v
