<#
update-dep-scanner.ps1 (report-only)

Scans:
  Node:
    - demos/*/frontend/package.json
    - ./package.json (if present)
    - backend/package.json (if present)
    Runs:
      pnpm outdated --long --format json
      pnpm outdated --long --format json --compatible
    Saves:
      reports/outdated/<scope>-latest.json
      reports/outdated/<scope>-compatible.json
      reports/outdated/<scope>-latest.stderr.txt
      reports/outdated/<scope>-compatible.stderr.txt

  Python (backend requirements workflow):
    - backend/requirements.in + backend/requirements.txt
    Runs:
      uv pip compile backend/requirements.in --upgrade   (stdout redirected)
    Writes:
      reports/requirements.upgraded.txt
      reports/uv_compile.stderr.txt
    Diffs pinned versions vs backend/requirements.txt

Also discovers (discovery-only) any:
  pyproject.toml, setup.cfg, setup.py

Outputs:
  reports/dependency-updates.md

Does NOT:
  - install deps
  - update lockfiles/manifests
  - require elevated privileges

Default behavior: quiet (no output). Use -Verbose for progress messages.
#>

[CmdletBinding()]
param(
  [string]$ReportsDir = "reports"
)

Set-StrictMode -Version Latest

function Get-RepoRoot {
  try {
    $root = (& git rev-parse --show-toplevel 2>$null).Trim()
    if ([string]::IsNullOrWhiteSpace($root)) { throw "git returned empty repo root" }
    return $root
  } catch {
    throw "Could not determine repo root. Run this inside a git repo with git on PATH."
  }
}

function New-DirectoryIfMissing([string]$Path) {
  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function ConvertTo-FileStem([string]$s) {
  $stem = $s -replace '[:\\\/\s]+','_'
  $stem = $stem -replace '[^A-Za-z0-9_\-\.]',''
  if ($stem.Length -gt 120) { $stem = $stem.Substring(0,120) }
  if ([string]::IsNullOrWhiteSpace($stem)) { $stem = "unknown" }
  return $stem
}

function Get-RelPath([string]$Root, [string]$Path) {
  try {
    return [System.IO.Path]::GetRelativePath($Root, $Path)
  } catch {
    $rp = $Path
    if ($Path.StartsWith($Root)) {
      $rp = $Path.Substring($Root.Length).TrimStart('\','/')
    }
    return $rp
  }
}

function Invoke-ToolCapture {
  param(
    [Parameter(Mandatory=$true)][string]$Exe,
    [Parameter(Mandatory=$true)][string[]]$Args,
    [Parameter(Mandatory=$true)][string]$WorkingDir,
    [Parameter(Mandatory=$true)][string]$StdoutPath,
    [Parameter(Mandatory=$true)][string]$StderrPath
  )

  $p = Start-Process -FilePath $Exe -ArgumentList $Args -WorkingDirectory $WorkingDir -NoNewWindow `
    -PassThru -Wait -RedirectStandardOutput $StdoutPath -RedirectStandardError $StderrPath
  return $p.ExitCode
}

function ConvertFrom-PnpmOutdatedJson {
  param([object]$Json)

  $items = @()
  if ($null -eq $Json) { return $items }

  if ($Json -is [System.Collections.IEnumerable] -and -not ($Json -is [string])) {
    foreach ($x in $Json) { if ($null -ne $x) { $items += $x } }
    return $items
  }

  if ($Json -is [pscustomobject]) {
    foreach ($p in $Json.PSObject.Properties) {
      if ($null -eq $p.Value) { continue }
      $v = $p.Value
      if (-not ($v | Get-Member -Name name -ErrorAction SilentlyContinue)) {
        try { $v | Add-Member -NotePropertyName name -NotePropertyValue $p.Name -Force } catch {}
      } elseif ([string]::IsNullOrWhiteSpace($v.name)) {
        $v.name = $p.Name
      }
      $items += $v
    }
  }

  return $items
}

function ConvertFrom-RequirementsPinned {
  param([string]$Path)

  $map = @{}
  if (-not (Test-Path $Path)) { return $map }

  Get-Content $Path -ErrorAction Stop | ForEach-Object {
    $line = $_.Trim()
    if ($line.Length -eq 0) { return }
    if ($line.StartsWith("#")) { return }
    if ($line.StartsWith("-r") -or $line.StartsWith("--requirement")) { return }
    if ($line.StartsWith("-c") -or $line.StartsWith("--constraint")) { return }

    if ($line -match '^\s*([A-Za-z0-9_.\-]+)==([^\s;]+)') {
      $name = $Matches[1].ToLowerInvariant()
      $ver  = $Matches[2]
      $map[$name] = $ver
    }
  }

  return $map
}

function Get-VersionMajorFromText {
  param([string]$VersionText)

  if ([string]::IsNullOrWhiteSpace($VersionText)) { return $null }
  if ($VersionText -match '(\d+)') { return [int]$Matches[1] }
  return $null
}

function Get-SemVerParts {
  param([string]$VersionText)

  if ([string]::IsNullOrWhiteSpace($VersionText)) {
    return [pscustomobject]@{ Parsed = $false; Major = $null; Minor = $null; Patch = $null }
  }

  if ($VersionText -match '^\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?') {
    return [pscustomobject]@{
      Parsed = $true
      Major  = [int]$Matches[1]
      Minor  = if ($Matches[2]) { [int]$Matches[2] } else { 0 }
      Patch  = if ($Matches[3]) { [int]$Matches[3] } else { 0 }
    }
  }

  return [pscustomobject]@{ Parsed = $false; Major = $null; Minor = $null; Patch = $null }
}

function Get-VersionDeltaKind {
  param(
    [string]$Current,
    [string]$Target
  )

  $cur = Get-SemVerParts -VersionText $Current
  $tgt = Get-SemVerParts -VersionText $Target

  if (-not $cur.Parsed -or -not $tgt.Parsed) { return "unknown" }
  if ($cur.Major -ne $tgt.Major) { return "major" }
  if ($cur.Minor -ne $tgt.Minor) { return "minor" }
  if ($cur.Patch -ne $tgt.Patch) { return "patch" }
  return "none"
}

function Compare-SemVer {
  param(
    [string]$A,
    [string]$B
  )

  $av = Get-SemVerParts -VersionText $A
  $bv = Get-SemVerParts -VersionText $B
  if (-not $av.Parsed -or -not $bv.Parsed) { return $null }

  foreach ($k in @("Major","Minor","Patch")) {
    if ($av.$k -lt $bv.$k) { return -1 }
    if ($av.$k -gt $bv.$k) { return 1 }
  }
  return 0
}

function Get-NodeRuntimeTargetVersion {
  param([string]$RepoRoot)

  $nvmrc = Join-Path $RepoRoot ".nvmrc"
  if (-not (Test-Path $nvmrc)) { return "" }
  try {
    $raw = (Get-Content -Path $nvmrc -Raw -ErrorAction Stop).Trim()
    if ([string]::IsNullOrWhiteSpace($raw)) { return "" }
    return ($raw -replace '^\s*v', '').Trim()
  } catch {
    return ""
  }
}

function ConvertTo-ReportCell {
  param([object]$Value)
  $s = if ($null -eq $Value) { "" } else { "$Value" }
  $s = $s -replace '\r?\n', ' '
  $s = $s -replace '\|', '\|'
  return $s
}

function Get-TruncatedReportCell {
  param(
    [string]$Text,
    [int]$Width
  )

  if ($null -eq $Text) { $Text = "" }
  if ($Width -le 0) { return "" }
  if ($Text.Length -le $Width) { return $Text }
  if ($Width -le 3) { return ("." * $Width) }
  return ($Text.Substring(0, $Width - 3) + "...")
}

function Get-MarkdownRowCells {
  param([string]$Line)
  $trim = $Line.Trim()
  if (-not $trim.StartsWith("|")) { return @() }
  if ($trim.EndsWith("|")) { $trim = $trim.Substring(0, $trim.Length - 1) }
  $trim = $trim.TrimStart('|')
  return @($trim.Split('|') | ForEach-Object { $_.Trim() })
}

function Test-MarkdownSeparatorRow {
  param([string[]]$Cells)
  if ($Cells.Count -eq 0) { return $false }
  foreach ($c in $Cells) {
    if (-not ($c -match '^:?-{3,}:?$')) { return $false }
  }
  return $true
}

function Format-MarkdownTables {
  param(
    [string]$Markdown,
    [int]$MaxWidth = 90
  )

  $lines = @($Markdown -split "`r?`n")
  $out = New-Object 'System.Collections.Generic.List[string]'
  $i = 0
  while ($i -lt $lines.Count) {
    $line = $lines[$i]
    if (-not $line.Trim().StartsWith("|")) {
      $out.Add($line)
      $i++
      continue
    }

    $block = @()
    while ($i -lt $lines.Count -and $lines[$i].Trim().StartsWith("|")) {
      $block += $lines[$i]
      $i++
    }

    if ($block.Count -lt 2) {
      foreach ($b in $block) { $out.Add($b) }
      continue
    }

    $rowCells = @()
    foreach ($b in $block) { $rowCells += ,(Get-MarkdownRowCells -Line $b) }
    if ($rowCells.Count -lt 2 -or -not (Test-MarkdownSeparatorRow -Cells $rowCells[1])) {
      foreach ($b in $block) { $out.Add($b) }
      continue
    }

    $colCount = 0
    foreach ($cells in $rowCells) { if ($cells.Count -gt $colCount) { $colCount = $cells.Count } }
    if ($colCount -eq 0) {
      foreach ($b in $block) { $out.Add($b) }
      continue
    }

    $norm = @()
    foreach ($cells in $rowCells) {
      $arr = @()
      for ($c = 0; $c -lt $colCount; $c++) {
        $arr += if ($c -lt $cells.Count) { ConvertTo-ReportCell $cells[$c] } else { "" }
      }
      $norm += ,$arr
    }

    $widths = New-Object int[] $colCount
    for ($r = 0; $r -lt $norm.Count; $r++) {
      if (Test-MarkdownSeparatorRow -Cells $norm[$r]) { continue }
      for ($c = 0; $c -lt $colCount; $c++) {
        if ($norm[$r][$c].Length -gt $widths[$c]) { $widths[$c] = $norm[$r][$c].Length }
      }
    }
    for ($c = 0; $c -lt $colCount; $c++) { if ($widths[$c] -lt 3) { $widths[$c] = 3 } }

    $getTableLineWidth = {
      param([int[]]$w)
      $sum = 0
      foreach ($x in $w) { $sum += $x }
      return ($sum + (3 * $w.Length) + 1)
    }

    while ((& $getTableLineWidth $widths) -gt $MaxWidth) {
      $maxIdx = -1
      $maxVal = -1
      for ($c = 0; $c -lt $colCount; $c++) {
        if ($widths[$c] -gt 3 -and $widths[$c] -gt $maxVal) {
          $maxVal = $widths[$c]
          $maxIdx = $c
        }
      }
      if ($maxIdx -lt 0) { break }
      $widths[$maxIdx]--
    }

    for ($r = 0; $r -lt $norm.Count; $r++) {
      $cells = $norm[$r]
      $pieces = @()
      if (Test-MarkdownSeparatorRow -Cells $cells) {
        for ($c = 0; $c -lt $colCount; $c++) { $pieces += ('-' * $widths[$c]) }
      } else {
        for ($c = 0; $c -lt $colCount; $c++) {
          $cell = Get-TruncatedReportCell -Text $cells[$c] -Width $widths[$c]
          $pieces += $cell.PadRight($widths[$c])
        }
      }
      $out.Add("| " + ($pieces -join " | ") + " |")
    }
  }

  return ($out -join "`r`n")
}

function Get-ImpactRecommendation {
  param(
    [string]$Ecosystem,
    [string]$DependencyType,
    [string]$Package,
    [string]$Delta
  )

  if ($Delta -eq "none") {
    return [pscustomobject]@{ Recommendation = "no_changes_expected"; Reason = "No version delta detected." }
  }
  if ($Delta -eq "unknown") {
    return [pscustomobject]@{ Recommendation = "review_recommended"; Reason = "Could not classify semantic version delta." }
  }
  if ($Delta -eq "major") {
    return [pscustomobject]@{ Recommendation = "likely_changes_required"; Reason = "Major version upgrade often includes breaking changes." }
  }

  if ($Ecosystem -eq "node") {
    if ($DependencyType -eq "devDependencies") {
      return [pscustomobject]@{ Recommendation = "likely_no_changes"; Reason = "Dev-dependency patch/minor upgrades are usually tooling/type updates." }
    }
    if ($Delta -eq "patch") {
      return [pscustomobject]@{ Recommendation = "likely_no_changes"; Reason = "Runtime dependency patch upgrade is usually backward compatible." }
    }
    return [pscustomobject]@{ Recommendation = "review_recommended"; Reason = "Runtime dependency minor upgrade may change behavior." }
  }

  if ($Ecosystem -eq "python") {
    if ($Package -in @("fastapi","starlette")) {
      if ($Delta -eq "patch") {
        return [pscustomobject]@{ Recommendation = "likely_no_changes"; Reason = "Framework patch upgrade is typically backward compatible." }
      }
      return [pscustomobject]@{ Recommendation = "review_recommended"; Reason = "Framework minor upgrade can affect behavior/contracts." }
    }
    if ($Delta -eq "patch") {
      return [pscustomobject]@{ Recommendation = "likely_no_changes"; Reason = "Package patch upgrade is typically backward compatible." }
    }
    return [pscustomobject]@{ Recommendation = "review_recommended"; Reason = "Package minor upgrade may require validation." }
  }

  return [pscustomobject]@{ Recommendation = "review_recommended"; Reason = "No ecosystem-specific rule matched." }
}

function Test-NodeRuntimeAgainstRange {
  param(
    [int]$RuntimeMajor,
    [string]$EngineRange
  )

  if ($RuntimeMajor -lt 0) {
    return [pscustomobject]@{ Evaluated = $false; Match = $false; Note = "Runtime major version unavailable." }
  }
  if ([string]::IsNullOrWhiteSpace($EngineRange)) {
    return [pscustomobject]@{ Evaluated = $false; Match = $false; Note = "No engines.node range declared." }
  }

  $r = $EngineRange.Trim()
  if ($r -match '^\s*>=\s*(\d+)\s*<\s*(\d+)\s*$') {
    $min = [int]$Matches[1]
    $max = [int]$Matches[2]
    $ok = ($RuntimeMajor -ge $min) -and ($RuntimeMajor -lt $max)
    return [pscustomobject]@{ Evaluated = $true; Match = $ok; Note = "Evaluated as >=$min and <$max by major version." }
  }
  if ($r -match '^\s*\^(\d+)(?:\.\d+)?(?:\.\d+)?\s*$') {
    $major = [int]$Matches[1]
    return [pscustomobject]@{ Evaluated = $true; Match = ($RuntimeMajor -eq $major); Note = "Evaluated as major == $major for caret range." }
  }
  if ($r -match '^\s*~(\d+)(?:\.\d+)?(?:\.\d+)?\s*$') {
    $major = [int]$Matches[1]
    return [pscustomobject]@{ Evaluated = $true; Match = ($RuntimeMajor -eq $major); Note = "Evaluated as major == $major for tilde range." }
  }
  if ($r -match '^\s*(\d+)(?:\.\d+)?(?:\.\d+)?\s*$') {
    $major = [int]$Matches[1]
    return [pscustomobject]@{ Evaluated = $true; Match = ($RuntimeMajor -eq $major); Note = "Evaluated as exact major == $major." }
  }

  return [pscustomobject]@{ Evaluated = $false; Match = $false; Note = "Could not evaluate engines.node range format." }
}

function Get-NodeScopes {
  param([string]$RepoRoot)

  $scopes = @()

  $rootPkg = Join-Path $RepoRoot "package.json"
  if (Test-Path $rootPkg) {
    $scopes += [pscustomobject]@{ Scope="node:root"; Dir=$RepoRoot; Pkg=$rootPkg }
  }

  $backendPkg = Join-Path $RepoRoot "backend\package.json"
  if (Test-Path $backendPkg) {
    $scopes += [pscustomobject]@{ Scope="node:backend"; Dir=(Join-Path $RepoRoot "backend"); Pkg=$backendPkg }
  }

  $demosDir = Join-Path $RepoRoot "demos"
  if (Test-Path $demosDir) {
    $frontendPkgs = Get-ChildItem -Path $demosDir -Recurse -Filter "package.json" -File -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match '[\\\/]demos[\\\/][^\\\/]+[\\\/]frontend[\\\/]package\.json$' }

    foreach ($f in $frontendPkgs) {
      $dir = Split-Path -Parent $f.FullName
      $rel = Get-RelPath $RepoRoot $dir
      $demoName = ""
      if ($rel -match '^demos[\\\/]([^\\\/]+)[\\\/]frontend$') { $demoName = $Matches[1] }
      $scope = if ($demoName) { "node:frontend:$demoName" } else { "node:frontend:$rel" }

      $scopes += [pscustomobject]@{ Scope=$scope; Dir=$dir; Pkg=$f.FullName }
    }
  }

  # Deduplicate by directory
  $seen = New-Object 'System.Collections.Generic.HashSet[string]'
  $uniq = @()
  foreach ($s in $scopes) {
    $k = $s.Dir.ToLowerInvariant()
    if ($seen.Add($k)) { $uniq += $s }
  }
  return $uniq
}

function Find-OtherPythonManifests {
  param([string]$RepoRoot)

  $hits = @()
  $candidates = Get-ChildItem -Path $RepoRoot -Recurse -Force -File -Include "pyproject.toml","setup.cfg","setup.py" -ErrorAction SilentlyContinue
  foreach ($f in $candidates) {
    $p = $f.FullName
    if ($p -match '[\\\/](\.git|node_modules|\.pnpm-store|dist|build|out|coverage|\.venv|\.uv|\.mypy_cache|\.pytest_cache)[\\\/]') { continue }
    $hits += $p
  }
  return ($hits | Sort-Object -Unique)
}

# ---------------- Main ----------------

$RepoRoot = Get-RepoRoot
$ReportsPath = Join-Path $RepoRoot $ReportsDir
$OutdatedDir = Join-Path $ReportsPath "outdated"
New-DirectoryIfMissing $ReportsPath
New-DirectoryIfMissing $OutdatedDir

# Tool versions
$toolInfo = [ordered]@{}
foreach ($t in @("git","node","pnpm","uv","python")) {
  $cmd = Get-Command $t -ErrorAction SilentlyContinue
  if ($null -eq $cmd) { $toolInfo[$t] = "not found"; continue }
  try {
    $ver = & $t --version 2>$null
    if ([string]::IsNullOrWhiteSpace($ver)) { $ver = & $t -v 2>$null }
    $toolInfo[$t] = ($ver | Out-String).Trim()
  } catch {
    $toolInfo[$t] = "found, version query failed"
  }
}

# Discover other python manifests (informational)
$otherPy = @(Find-OtherPythonManifests -RepoRoot $RepoRoot)

# ---------- Node scan ----------
$nodeErrors  = @()
$nodeResults = @()
$nodeRows    = @()
$nodeSummary = @()

$nodeScopes = @(Get-NodeScopes -RepoRoot $RepoRoot)

if ($nodeScopes.Count -eq 0) {
  $nodeErrors += "No Node scopes found (no root/backend package.json and no demos/*/frontend/package.json)."
} elseif ($null -eq (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  $nodeErrors += "pnpm not found on PATH; skipping Node scan."
} else {
  foreach ($s in $nodeScopes) {
    $scope = $s.Scope
    $dir   = $s.Dir
    $rel   = Get-RelPath $RepoRoot $dir
    $stem  = ConvertTo-FileStem($scope)

    $latestOut = Join-Path $OutdatedDir "$stem-latest.json"
    $latestErr = Join-Path $OutdatedDir "$stem-latest.stderr.txt"
    $compOut   = Join-Path $OutdatedDir "$stem-compatible.json"
    $compErr   = Join-Path $OutdatedDir "$stem-compatible.stderr.txt"

    $ec1 = Invoke-ToolCapture -Exe "pnpm" -Args @("outdated","--long","--format","json") `
      -WorkingDir $dir -StdoutPath $latestOut -StderrPath $latestErr

    $ec2 = Invoke-ToolCapture -Exe "pnpm" -Args @("outdated","--long","--format","json","--compatible") `
      -WorkingDir $dir -StdoutPath $compOut -StderrPath $compErr

    $nodeResults += [pscustomobject]@{
      Scope          = $scope
      Dir            = $dir
      RelDir         = $rel
      PackageJson    = $s.Pkg
      LatestJsonPath = $latestOut
      LatestErrPath  = $latestErr
      LatestExitCode = $ec1
      CompatJsonPath = $compOut
      CompatErrPath  = $compErr
      CompatExitCode = $ec2
    }
  }
}

foreach ($r in $nodeResults) {
  $scope = $r.Scope

  $latestItems = @()
  $compatItems = @()
  $latestOk = $false
  $compatOk = $false

  if (Test-Path $r.LatestJsonPath) {
    try {
      $raw = Get-Content $r.LatestJsonPath -Raw -ErrorAction Stop
      if ([string]::IsNullOrWhiteSpace($raw)) { $latestOk = $true }
      else {
        $json = $raw | ConvertFrom-Json -ErrorAction Stop
        $latestItems = ConvertFrom-PnpmOutdatedJson $json
        $latestOk = $true
      }
    } catch {}
  }

  if (Test-Path $r.CompatJsonPath) {
    try {
      $raw = Get-Content $r.CompatJsonPath -Raw -ErrorAction Stop
      if ([string]::IsNullOrWhiteSpace($raw)) { $compatOk = $true }
      else {
        $json = $raw | ConvertFrom-Json -ErrorAction Stop
        $compatItems = ConvertFrom-PnpmOutdatedJson $json
        $compatOk = $true
      }
    } catch {}
  }

  $latestMap = @{}
  foreach ($it in $latestItems) {
    $name = $it.name; if ([string]::IsNullOrWhiteSpace($name)) { continue }
    $dtype = $it.dependencyType; if ([string]::IsNullOrWhiteSpace($dtype)) { $dtype = "unknown" }
    $latestMap["$name|$dtype"] = $it
  }

  $compatMap = @{}
  foreach ($it in $compatItems) {
    $name = $it.name; if ([string]::IsNullOrWhiteSpace($name)) { continue }
    $dtype = $it.dependencyType; if ([string]::IsNullOrWhiteSpace($dtype)) { $dtype = "unknown" }
    $compatMap["$name|$dtype"] = $it
  }

  $nodeSummary += [pscustomobject]@{
    Scope           = $scope
    Dir             = $r.RelDir
    LatestCount     = $latestMap.Count
    CompatibleCount = $compatMap.Count
    LatestOk        = $latestOk
    CompatibleOk    = $compatOk
    LatestExitCode  = $r.LatestExitCode
    CompatExitCode  = $r.CompatExitCode
  }

  $keys = New-Object System.Collections.Generic.HashSet[string]
  foreach ($k in $latestMap.Keys) { [void]$keys.Add($k) }
  foreach ($k in $compatMap.Keys) { [void]$keys.Add($k) }

  foreach ($k in ($keys | Sort-Object)) {
    $parts = $k.Split("|",2)
    $name = $parts[0]
    $dtype = $parts[1]

    $cur = ""
    $want = ""
    $lat = ""
    $compWant = ""

    if ($latestMap.ContainsKey($k)) {
      $it = $latestMap[$k]
      $cur = $it.current
      $want = $it.wanted
      $lat = $it.latest
    }
    if ($compatMap.ContainsKey($k)) {
      $it = $compatMap[$k]
      $compWant = $it.wanted
      if ([string]::IsNullOrWhiteSpace($cur)) { $cur = $it.current }
      if ([string]::IsNullOrWhiteSpace($lat)) { $lat = $it.latest }
    }

    $nodeRows += [pscustomobject]@{
      Scope            = $scope
      Dir              = $r.RelDir
      Package          = $name
      Type             = $dtype
      Current          = $cur
      CompatibleWanted = $compWant
      Wanted           = $want
      Latest           = $lat
    }
  }

  if (-not $latestOk) { $nodeErrors += "Could not parse latest JSON for $scope. See $($r.LatestErrPath)." }
  if (-not $compatOk) { $nodeErrors += "Could not parse compatible JSON for $scope. See $($r.CompatErrPath)." }
}

$runtimeTypes = @("dependencies","optionalDependencies","peerDependencies")
$devTypes = @("devDependencies")
$nodeRuntimeRows = @($nodeRows | Where-Object { $runtimeTypes -contains $_.Type })
$nodeDevRows = @($nodeRows | Where-Object { $devTypes -contains $_.Type })
$nodeDiscrepancies = @()

$nodeRuntimeVersion = ""
if ($toolInfo.Contains("node")) { $nodeRuntimeVersion = "$($toolInfo["node"])" }
$nodeRuntimeMajor = Get-VersionMajorFromText -VersionText $nodeRuntimeVersion
if ($null -eq $nodeRuntimeMajor) { $nodeRuntimeMajor = -1 }
$nodeRuntimeTarget = Get-NodeRuntimeTargetVersion -RepoRoot $RepoRoot
$nodeRuntimeCmp = Compare-SemVer -A $nodeRuntimeVersion -B $nodeRuntimeTarget
$nodeRuntimeUpgradeAvailable = ($null -ne $nodeRuntimeCmp -and $nodeRuntimeCmp -lt 0)

foreach ($scopeResult in $nodeResults) {
  $scope = $scopeResult.Scope
  $scopeRows = @($nodeRows | Where-Object { $_.Scope -eq $scope })

  $typesRow = @($scopeRows | Where-Object { $_.Type -eq "devDependencies" -and $_.Package -ieq "@types/node" } | Select-Object -First 1)
  if ($typesRow.Count -gt 0 -and $nodeRuntimeMajor -ge 0) {
    $typesCurrent = "$($typesRow[0].Current)"
    $typesMajor = Get-VersionMajorFromText -VersionText $typesCurrent
    if ($null -ne $typesMajor -and $typesMajor -ne $nodeRuntimeMajor) {
      $nodeDiscrepancies += [pscustomobject]@{
        Scope    = $scope
        Check    = "@types/node major vs runtime"
        Runtime  = $nodeRuntimeVersion
        Declared = "@types/node $typesCurrent"
        Observed = "runtime major=$nodeRuntimeMajor, @types/node major=$typesMajor"
        Note     = "Type package major does not match runtime major."
      }
    }
  }

  $engineRange = ""
  if (Test-Path $scopeResult.PackageJson) {
    try {
      $pkg = Get-Content -Path $scopeResult.PackageJson -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
      if ($null -ne $pkg.engines -and $null -ne $pkg.engines.node) {
        $engineRange = "$($pkg.engines.node)"
      }
    } catch {}
  }

  if (-not [string]::IsNullOrWhiteSpace($engineRange)) {
    $rangeEval = Test-NodeRuntimeAgainstRange -RuntimeMajor $nodeRuntimeMajor -EngineRange $engineRange
    if ($rangeEval.Evaluated -and -not $rangeEval.Match) {
      $nodeDiscrepancies += [pscustomobject]@{
        Scope    = $scope
        Check    = "engines.node vs runtime"
        Runtime  = $nodeRuntimeVersion
        Declared = $engineRange
        Observed = "runtime major=$nodeRuntimeMajor"
        Note     = $rangeEval.Note
      }
    } elseif (-not $rangeEval.Evaluated) {
      $nodeDiscrepancies += [pscustomobject]@{
        Scope    = $scope
        Check    = "engines.node parseability"
        Runtime  = $nodeRuntimeVersion
        Declared = $engineRange
        Observed = "runtime major=$nodeRuntimeMajor"
        Note     = $rangeEval.Note
      }
    }
  }
}

# ---------- Python backend scan ----------
$pyErrors = @()
$pyRows = @()

$backendReqIn  = Join-Path $RepoRoot "backend\requirements.in"
$backendReqTxt = Join-Path $RepoRoot "backend\requirements.txt"

$foundIn  = Test-Path $backendReqIn
$foundTxt = Test-Path $backendReqTxt

$uvExit = $null
$upgradedPath = Join-Path $ReportsPath "requirements.upgraded.txt"
$uvErrPath    = Join-Path $ReportsPath "uv_compile.stderr.txt"

$diffCount = 0
$addCount  = 0
$remCount  = 0

if (-not $foundIn) {
  $pyErrors += "backend/requirements.in not found; skipping Python upgrade preview."
} elseif ($null -eq (Get-Command uv -ErrorAction SilentlyContinue)) {
  $pyErrors += "uv not found on PATH; skipping Python upgrade preview."
} else {
  $uvExit = Invoke-ToolCapture -Exe "uv" -Args @("pip","compile",$backendReqIn,"--upgrade") `
    -WorkingDir $RepoRoot -StdoutPath $upgradedPath -StderrPath $uvErrPath

  if ($uvExit -ne 0) {
    $pyErrors += "uv pip compile --upgrade exited with code $uvExit. See $uvErrPath."
  } elseif (-not $foundTxt) {
    $pyErrors += "backend/requirements.txt not found; cannot diff pinned versions."
  } else {
    $curMap = ConvertFrom-RequirementsPinned $backendReqTxt
    $upgMap = ConvertFrom-RequirementsPinned $upgradedPath

    $all = New-Object System.Collections.Generic.HashSet[string]
    foreach ($k in $curMap.Keys) { [void]$all.Add($k) }
    foreach ($k in $upgMap.Keys) { [void]$all.Add($k) }

    foreach ($name in ($all | Sort-Object)) {
      $inCur = $curMap.ContainsKey($name)
      $inUpg = $upgMap.ContainsKey($name)
      $cur = if ($inCur) { $curMap[$name] } else { $null }
      $upg = if ($inUpg) { $upgMap[$name] } else { $null }

      $status = ""
      if ($inCur -and $inUpg) {
        if ($cur -ne $upg) { $status = "update"; $diffCount++ } else { $status = "same" }
      } elseif ($inCur -and -not $inUpg) {
        $status = "removed"; $remCount++
      } elseif (-not $inCur -and $inUpg) {
        $status = "added"; $addCount++
      }

      $pyRows += [pscustomobject]@{
        Package = $name
        Current = $cur
        Upgraded= $upg
        Status  = $status
      }
    }
  }
}

# ---------- Code change impact (heuristic) ----------
$impactRows = @()

foreach ($row in $nodeRows) {
  $target = ""
  if (-not [string]::IsNullOrWhiteSpace($row.Latest)) { $target = "$($row.Latest)" }
  elseif (-not [string]::IsNullOrWhiteSpace($row.Wanted)) { $target = "$($row.Wanted)" }
  elseif (-not [string]::IsNullOrWhiteSpace($row.CompatibleWanted)) { $target = "$($row.CompatibleWanted)" }

  if ([string]::IsNullOrWhiteSpace($target)) { continue }

  $delta = Get-VersionDeltaKind -Current "$($row.Current)" -Target $target
  $rec = Get-ImpactRecommendation -Ecosystem "node" -DependencyType "$($row.Type)" -Package "$($row.Package)" -Delta $delta
  $impactRows += [pscustomobject]@{
    Ecosystem       = "node"
    Scope           = "$($row.Scope)"
    Package         = "$($row.Package)"
    DependencyType  = "$($row.Type)"
    Current         = "$($row.Current)"
    Target          = $target
    Delta           = $delta
    Recommendation  = "$($rec.Recommendation)"
    Reason          = "$($rec.Reason)"
  }
}

foreach ($row in ($pyRows | Where-Object { $_.Status -eq "update" -or $_.Status -eq "added" -or $_.Status -eq "removed" })) {
  $delta = Get-VersionDeltaKind -Current "$($row.Current)" -Target "$($row.Upgraded)"
  $rec = Get-ImpactRecommendation -Ecosystem "python" -DependencyType "runtime" -Package "$($row.Package)" -Delta $delta
  $impactRows += [pscustomobject]@{
    Ecosystem       = "python"
    Scope           = "backend"
    Package         = "$($row.Package)"
    DependencyType  = "runtime"
    Current         = "$($row.Current)"
    Target          = "$($row.Upgraded)"
    Delta           = $delta
    Recommendation  = "$($rec.Recommendation)"
    Reason          = "$($rec.Reason)"
  }
}

$impactRequiresChanges = @($impactRows | Where-Object { $_.Recommendation -eq "likely_changes_required" }).Count -gt 0
$impactNeedsReview = @($impactRows | Where-Object { $_.Recommendation -eq "review_recommended" }).Count -gt 0

$impactFileRows = @()
foreach ($row in ($impactRows | Where-Object { $_.Recommendation -eq "review_recommended" -or $_.Recommendation -eq "likely_changes_required" })) {
  $files = @()
  if ($row.Ecosystem -eq "python") {
    $files += "backend/main.py"
    $files += "backend/datasets.py"
  } elseif ($row.Ecosystem -eq "node") {
    if ($row.Scope -match '^node:frontend:(.+)$') {
      $demo = $Matches[1]
      $files += ("demos/{0}/frontend/package.json" -f $demo)
      $files += ("demos/{0}/frontend/src/main.ts" -f $demo)
      $files += ("demos/{0}/frontend/src/lib/api.ts" -f $demo)
      $files += ("demos/{0}/frontend/src/lib/types.ts" -f $demo)
    } elseif ($row.Scope -eq "node:root") {
      $files += "package.json"
    } elseif ($row.Scope -eq "node:backend") {
      $files += "backend/package.json"
      $files += "backend/main.py"
    }
  }

  $impactFileRows += [pscustomobject]@{
    Ecosystem      = $row.Ecosystem
    Scope          = $row.Scope
    Package        = $row.Package
    Recommendation = $row.Recommendation
    Files          = if ($files.Count -gt 0) { ($files | Sort-Object -Unique) -join "; " } else { "manual review" }
    Reason         = $row.Reason
  }
}

# ---------- Write Markdown report ----------
$reportPath = Join-Path $ReportsPath "dependency-updates.md"

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("# Dependency update report")
[void]$sb.AppendLine("")
[void]$sb.AppendLine(("Generated: {0}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss")))
[void]$sb.AppendLine("")

[void]$sb.AppendLine("## Toolchain")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("| Tool | Version |")
[void]$sb.AppendLine("|---|---|")
foreach ($k in $toolInfo.Keys) {
  $v = $toolInfo[$k]
  if ($null -eq $v) { $v = "" }
  $v = $v -replace '\|','\\|'
  [void]$sb.AppendLine("| $k | $v |")
}
[void]$sb.AppendLine("")

[void]$sb.AppendLine("## Other Python manifests (discovery only)")
[void]$sb.AppendLine("")
if ($otherPy.Count -gt 0) {
  foreach ($p in $otherPy) {
    [void]$sb.AppendLine(("- {0}" -f (Get-RelPath $RepoRoot $p)))
  }
} else {
  [void]$sb.AppendLine("_None found._")
}
[void]$sb.AppendLine("")

# Node section
[void]$sb.AppendLine("## Node/JS (pnpm outdated)")
[void]$sb.AppendLine("")
[void]$sb.AppendLine(("Scopes scanned: **{0}**" -f $nodeSummary.Count))
[void]$sb.AppendLine("")
[void]$sb.AppendLine("- Note: `@types/node` is a TypeScript package and is separate from the Node runtime.")
if (-not [string]::IsNullOrWhiteSpace($nodeRuntimeTarget)) {
  [void]$sb.AppendLine(("- Node runtime target from `.nvmrc`: **{0}**" -f $nodeRuntimeTarget))
  [void]$sb.AppendLine(("- Node runtime upgrade available (current -> target): **{0}**" -f $(if ($nodeRuntimeUpgradeAvailable) { "yes" } else { "no" })))
} else {
  [void]$sb.AppendLine("- Node runtime target from `.nvmrc`: _not set_")
}
[void]$sb.AppendLine("")

if ($nodeSummary.Count -gt 0) {
  [void]$sb.AppendLine("| Scope | Dir | Outdated (latest) | Outdated (compatible) |")
  [void]$sb.AppendLine("|---|---|---:|---:|")
  foreach ($s in ($nodeSummary | Sort-Object Scope)) {
    [void]$sb.AppendLine("| $($s.Scope) | $($s.Dir) | $($s.LatestCount) | $($s.CompatibleCount) |")
  }
  [void]$sb.AppendLine("")
}

$runtimeUpgradeCount = $nodeRuntimeRows.Count
$devUpgradeCount = $nodeDevRows.Count
$matchStatus = if ($nodeDiscrepancies.Count -eq 0) { "match" } else { "mismatch detected" }
[void]$sb.AppendLine(("- Runtime dependency upgrades available: **{0}**" -f $runtimeUpgradeCount))
[void]$sb.AppendLine(("- Dev dependency upgrades available: **{0}**" -f $devUpgradeCount))
[void]$sb.AppendLine(("- Runtime/dev relationship status: **{0}**" -f $matchStatus))
[void]$sb.AppendLine("")

if ($nodeRows.Count -gt 0) {
  [void]$sb.AppendLine("### Outdated packages (merged)")
  [void]$sb.AppendLine("")
  [void]$sb.AppendLine("| Scope | Package | Type | Current | Compatible | Wanted | Latest |")
  [void]$sb.AppendLine("|---|---|---|---|---|---|---|")
  foreach ($row in ($nodeRows | Sort-Object Scope, Package, Type)) {
    $scope = ($row.Scope); $pkg = ($row.Package); $type = ($row.Type)
    $cur = ($row.Current); $comp = ($row.CompatibleWanted); $want = ($row.Wanted); $lat = ($row.Latest)
    foreach ($x in @("scope","pkg","type","cur","comp","want","lat")) { }
    if ($null -eq $cur) { $cur = "" }
    if ($null -eq $comp) { $comp = "" }
    if ($null -eq $want) { $want = "" }
    if ($null -eq $lat) { $lat = "" }
    [void]$sb.AppendLine("| $scope | $pkg | $type | $cur | $comp | $want | $lat |")
  }
  [void]$sb.AppendLine("")
} else {
  [void]$sb.AppendLine("_No parsed Node outdated results._")
  [void]$sb.AppendLine("")
}

[void]$sb.AppendLine("### Outdated runtime dependencies")
[void]$sb.AppendLine("")
if ($nodeRuntimeRows.Count -gt 0) {
  [void]$sb.AppendLine("| Scope | Package | Type | Current | Compatible | Wanted | Latest |")
  [void]$sb.AppendLine("|---|---|---|---|---|---|---|")
  foreach ($row in ($nodeRuntimeRows | Sort-Object Scope, Package, Type)) {
    [void]$sb.AppendLine("| $($row.Scope) | $($row.Package) | $($row.Type) | $($row.Current) | $($row.CompatibleWanted) | $($row.Wanted) | $($row.Latest) |")
  }
} else {
  [void]$sb.AppendLine("_No outdated runtime dependencies found._")
}
[void]$sb.AppendLine("")

[void]$sb.AppendLine("### Outdated dev dependencies")
[void]$sb.AppendLine("")
if ($nodeDevRows.Count -gt 0) {
  [void]$sb.AppendLine("| Scope | Package | Type | Current | Compatible | Wanted | Latest |")
  [void]$sb.AppendLine("|---|---|---|---|---|---|---|")
  foreach ($row in ($nodeDevRows | Sort-Object Scope, Package, Type)) {
    [void]$sb.AppendLine("| $($row.Scope) | $($row.Package) | $($row.Type) | $($row.Current) | $($row.CompatibleWanted) | $($row.Wanted) | $($row.Latest) |")
  }
} else {
  [void]$sb.AppendLine("_No outdated dev dependencies found._")
}
[void]$sb.AppendLine("")

[void]$sb.AppendLine("### Runtime/Dev discrepancies")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("- Detected Node runtime: " + '`' + $nodeRuntimeVersion + '`')
[void]$sb.AppendLine("")
if ($nodeDiscrepancies.Count -gt 0) {
  [void]$sb.AppendLine("| Scope | Check | Runtime | Declared | Observed | Note |")
  [void]$sb.AppendLine("|---|---|---|---|---|---|")
  foreach ($d in ($nodeDiscrepancies | Sort-Object Scope, Check)) {
    [void]$sb.AppendLine("| $($d.Scope) | $($d.Check) | $($d.Runtime) | $($d.Declared) | $($d.Observed) | $($d.Note) |")
  }
} else {
  [void]$sb.AppendLine("_No runtime/dev discrepancies detected._")
}
[void]$sb.AppendLine("")

if ($nodeErrors.Count -gt 0) {
  [void]$sb.AppendLine("### Node scan notes / errors")
  [void]$sb.AppendLine("")
  foreach ($e in ($nodeErrors | Select-Object -Unique)) {
    [void]$sb.AppendLine("- $e")
  }
  [void]$sb.AppendLine("")
}

# Python section
[void]$sb.AppendLine("## Python backend (uv pip compile --upgrade preview)")
[void]$sb.AppendLine("")
[void]$sb.AppendLine(("- backend/requirements.in found: **{0}**" -f $foundIn))
[void]$sb.AppendLine(("- backend/requirements.txt found: **{0}**" -f $foundTxt))
if ($null -ne $uvExit) { [void]$sb.AppendLine(("- uv exit code: **{0}**" -f $uvExit)) }
[void]$sb.AppendLine("- upgraded preview: " + '`' + (Get-RelPath $RepoRoot $upgradedPath) + '`')
[void]$sb.AppendLine("- uv stderr: " + '`' + (Get-RelPath $RepoRoot $uvErrPath) + '`')
[void]$sb.AppendLine("")

if ($pyRows.Count -gt 0) {
  [void]$sb.AppendLine(("Counts: update={0}, added={1}, removed={2}" -f $diffCount,$addCount,$remCount))
  [void]$sb.AppendLine("")
  [void]$sb.AppendLine("| Package | Current | Upgraded | Status |")
  [void]$sb.AppendLine("|---|---|---|---|")
  foreach ($row in ($pyRows | Where-Object { $_.Status -ne "same" } | Sort-Object Status, Package)) {
    [void]$sb.AppendLine("| $($row.Package) | $($row.Current) | $($row.Upgraded) | $($row.Status) |")
  }
  [void]$sb.AppendLine("")
} else {
  [void]$sb.AppendLine("_No Python diffs reported (or preview not run)._")
  [void]$sb.AppendLine("")
}

if ($pyErrors.Count -gt 0) {
  [void]$sb.AppendLine("### Python scan notes / errors")
  [void]$sb.AppendLine("")
  foreach ($e in ($pyErrors | Select-Object -Unique)) {
    [void]$sb.AppendLine("- $e")
  }
  [void]$sb.AppendLine("")
}

[void]$sb.AppendLine("## Code Change Impact (Heuristic)")
[void]$sb.AppendLine("")
[void]$sb.AppendLine(("- Any likely code changes required if upgrades are installed: **{0}**" -f $(if ($impactRequiresChanges) { "yes" } else { "no" })))
[void]$sb.AppendLine(("- Any upgrades that should be reviewed manually: **{0}**" -f $(if ($impactNeedsReview) { "yes" } else { "no" })))
[void]$sb.AppendLine("- Note: this is a heuristic based on semantic version deltas and dependency category.")
[void]$sb.AppendLine("")
if ($impactRows.Count -gt 0) {
  [void]$sb.AppendLine("| Ecosystem | Scope | Package | Type | Current | Target | Delta | Recommendation | Reason |")
  [void]$sb.AppendLine("|---|---|---|---|---|---|---|---|---|")
  foreach ($row in ($impactRows | Sort-Object Ecosystem, Scope, Package)) {
    [void]$sb.AppendLine("| $($row.Ecosystem) | $($row.Scope) | $($row.Package) | $($row.DependencyType) | $($row.Current) | $($row.Target) | $($row.Delta) | $($row.Recommendation) | $($row.Reason) |")
  }
  [void]$sb.AppendLine("")
} else {
  [void]$sb.AppendLine("_No upgrade candidates to assess._")
  [void]$sb.AppendLine("")
}

[void]$sb.AppendLine("### Files to review if code changes are needed")
[void]$sb.AppendLine("")
if ($impactFileRows.Count -gt 0) {
  [void]$sb.AppendLine("| Ecosystem | Scope | Package | Recommendation | Files | Reason |")
  [void]$sb.AppendLine("|---|---|---|---|---|---|")
  foreach ($row in ($impactFileRows | Sort-Object Ecosystem, Scope, Package)) {
    [void]$sb.AppendLine("| $($row.Ecosystem) | $($row.Scope) | $($row.Package) | $($row.Recommendation) | $($row.Files) | $($row.Reason) |")
  }
  [void]$sb.AppendLine("")
} else {
  [void]$sb.AppendLine("_No likely code-change file targets identified._")
  [void]$sb.AppendLine("")
}

[void]$sb.AppendLine("## Upgrade Steps (Step-by-Step)")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("1. Upgrade frontend runtime dependencies to latest.")
$runtimeInstallRows = @($nodeRuntimeRows | Where-Object { $_.Type -eq "dependencies" -or $_.Type -eq "optionalDependencies" })
if ($runtimeInstallRows.Count -gt 0) {
  $runtimeByScope = @{}
  foreach ($row in $runtimeInstallRows) {
    if (-not $runtimeByScope.ContainsKey($row.Scope)) { $runtimeByScope[$row.Scope] = [ordered]@{ Dir = $row.Dir; Pkgs = @() } }
    $runtimeByScope[$row.Scope].Pkgs += ("{0}@latest" -f $row.Package)
  }
  foreach ($scope in ($runtimeByScope.Keys | Sort-Object)) {
    $dir = $runtimeByScope[$scope].Dir
    $pkgs = @($runtimeByScope[$scope].Pkgs | Sort-Object -Unique) -join " "
    [void]$sb.AppendLine("   - " + '`' + ("pnpm --dir " + $dir + " add " + $pkgs) + '`')
  }
} else {
  [void]$sb.AppendLine("   - No outdated frontend runtime dependencies found.")
}
[void]$sb.AppendLine("")

[void]$sb.AppendLine("2. Upgrade frontend dev dependencies to latest.")
if ($nodeDevRows.Count -gt 0) {
  $devByScope = @{}
  foreach ($row in $nodeDevRows) {
    if (-not $devByScope.ContainsKey($row.Scope)) { $devByScope[$row.Scope] = [ordered]@{ Dir = $row.Dir; Pkgs = @() } }
    $devByScope[$row.Scope].Pkgs += ("{0}@latest" -f $row.Package)
  }
  foreach ($scope in ($devByScope.Keys | Sort-Object)) {
    $dir = $devByScope[$scope].Dir
    $pkgs = @($devByScope[$scope].Pkgs | Sort-Object -Unique) -join " "
    [void]$sb.AppendLine("   - " + '`' + ("pnpm --dir " + $dir + " add -D " + $pkgs) + '`')
  }
} else {
  [void]$sb.AppendLine("   - No outdated frontend dev dependencies found.")
}
[void]$sb.AppendLine("")

[void]$sb.AppendLine("3. Rebuild affected frontends.")
$affectedDirs = @($nodeRows | Select-Object -ExpandProperty Dir -Unique | Sort-Object)
if ($affectedDirs.Count -gt 0) {
  foreach ($dir in $affectedDirs) {
    [void]$sb.AppendLine("   - " + '`' + ("pnpm --dir " + $dir + " build") + '`')
  }
} else {
  [void]$sb.AppendLine("   - No frontend scopes were scanned.")
}
[void]$sb.AppendLine("")

[void]$sb.AppendLine("4. Apply backend Python upgrades from the requirements.in workflow.")
[void]$sb.AppendLine("   - Verify interpreter is the shared venv:")
[void]$sb.AppendLine("   - " + '`' + 'python -c "import sys,os; print(sys.executable); print(os.environ.get(''VIRTUAL_ENV''))"' + '`')
[void]$sb.AppendLine("   - Compile + sync:")
[void]$sb.AppendLine("   - " + '`' + "uv pip compile backend/requirements.in -o backend/requirements.txt" + '`')
[void]$sb.AppendLine("   - " + '`' + "uv pip sync backend/requirements.txt" + '`')
$pyUpgradeRows = @($pyRows | Where-Object { $_.Status -eq "update" -or $_.Status -eq "added" -or $_.Status -eq "removed" })
if ($pyUpgradeRows.Count -gt 0) {
  [void]$sb.AppendLine("   - Packages identified by scan:")
  foreach ($row in ($pyUpgradeRows | Sort-Object Package)) {
    [void]$sb.AppendLine("   - " + '`' + $row.Package + '`' + ": " + '`' + $row.Current + '`' + " -> " + '`' + $row.Upgraded + '`' + " (" + $row.Status + ")")
  }
} else {
  [void]$sb.AppendLine("   - No backend package changes detected in preview.")
}
[void]$sb.AppendLine("")

[void]$sb.AppendLine("5. Re-run scan to confirm upgrades are complete.")
[void]$sb.AppendLine("   - " + '`' + "pwsh -NoProfile -File .agent/skills/update-scan/scripts/update-dep-scanner.ps1" + '`')

$reportBody = Format-MarkdownTables -Markdown $sb.ToString()
$reportBody = $reportBody.TrimEnd("`r","`n") + "`r`n"
Set-Content -Path $reportPath -Value $reportBody -Encoding UTF8 -NoNewline

Write-Verbose ("Wrote report: {0}" -f $reportPath)
