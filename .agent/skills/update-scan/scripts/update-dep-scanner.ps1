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
  [string]$ReportsDir = "reports",
  [string]$BackendVenvActivate = "",
  [string]$BackendVenvPython = ""
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

function Get-ToolErrorText {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return "" }
  try { return (Get-Content -Path $Path -Raw -ErrorAction Stop) } catch { return "" }
}

function Test-ErrorLooksBlocked {
  param([string]$ErrorText)
  if ([string]::IsNullOrWhiteSpace($ErrorText)) { return $false }
  return ($ErrorText -match '(?i)\b(EPERM|EACCES|permission denied|operation not permitted|spawn EPERM|sandbox|blocked)\b')
}

function Get-RegistryUnreachableReason {
  param([string]$ErrorText)
  if ([string]::IsNullOrWhiteSpace($ErrorText)) { return "" }

  $service = ""
  if ($ErrorText -match 'https?://([^/\s`"]+)') {
    $service = $Matches[1]
  }

  if ($ErrorText -match '(?i)(Failed to fetch|error sending request|connection refused|No connection could be made|tunnel error|Could not resolve host|timed out|name or service not known|dns|proxy)') {
    if ([string]::IsNullOrWhiteSpace($service)) { return "registry unreachable" }
    return "registry unreachable ($service)"
  }

  return ""
}

function Get-ErrorSnippet {
  param(
    [string]$ErrorText,
    [int]$MaxLines = 2,
    [int]$MaxChars = 220
  )

  if ([string]::IsNullOrWhiteSpace($ErrorText)) { return "" }

  $lines = @($ErrorText -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($lines.Count -eq 0) { return "" }

  $snippet = (@($lines | Select-Object -First $MaxLines) -join " | ").Trim()
  if ($snippet.Length -gt $MaxChars) {
    $snippet = $snippet.Substring(0, $MaxChars - 3) + "..."
  }
  return $snippet
}

function Invoke-ToolCapture {
  param(
    [Parameter(Mandatory=$true)][string]$Exe,
    [Parameter(Mandatory=$true)][string[]]$Args,
    [Parameter(Mandatory=$true)][string]$WorkingDir,
    [Parameter(Mandatory=$true)][string]$StdoutPath,
    [Parameter(Mandatory=$true)][string]$StderrPath
)

  # Always reset outputs to avoid carrying stale logs between scan runs.
  Set-Content -Path $StdoutPath -Value "" -Encoding UTF8 -NoNewline
  Set-Content -Path $StderrPath -Value "" -Encoding UTF8 -NoNewline

  try {
    $p = Start-Process -FilePath $Exe -ArgumentList $Args -WorkingDirectory $WorkingDir -NoNewWindow `
      -PassThru -Wait -RedirectStandardOutput $StdoutPath -RedirectStandardError $StderrPath
    return $p.ExitCode
  } catch {
    # Preserve launch failures in stderr artifact and return a non-zero code.
    Add-Content -Path $StderrPath -Value ("Start-Process failed: {0}" -f $_.Exception.Message)
    return 126
  }
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

function Get-VersionTokenFromText {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) { return "" }
  if ($Text -match '(?i)\bv?(\d+\.\d+\.\d+)\b') { return $Matches[1] }
  if ($Text -match '(?i)\bv?(\d+\.\d+)\b') { return $Matches[1] }
  return ""
}

function Invoke-JsonRequest {
  param(
    [string]$Url,
    [int]$TimeoutSec = 20
  )

  try {
    return Invoke-RestMethod -Uri $Url -TimeoutSec $TimeoutSec -Headers @{ "User-Agent" = "update-scan-script" } -ErrorAction Stop
  } catch {
    return $null
  }
}

function Get-ToolUpgradeStatus {
  param(
    [string]$Current,
    [string]$Latest
  )

  if ([string]::IsNullOrWhiteSpace($Current)) { return "current_unknown" }
  if ([string]::IsNullOrWhiteSpace($Latest)) { return "latest_unknown" }

  $cmp = Compare-SemVer -A $Current -B $Latest
  if ($null -eq $cmp) { return "uncomparable" }
  if ($cmp -lt 0) { return "upgrade_available" }
  if ($cmp -eq 0) { return "up_to_date" }
  return "newer_than_reference"
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
    [int]$MaxWidth = 160,
    [int]$LongCellThreshold = 25,
    [int]$AggressiveRowWidth = 80,
    [int]$AggressiveLongCellThreshold = 20
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

    # Replace long data-cell values with short keys and emit a grouped legend after the table.
    $columnTitles = @()
    $columnPrefixes = @()
    $usedPrefixes = New-Object 'System.Collections.Generic.HashSet[string]'
    for ($c = 0; $c -lt $colCount; $c++) {
      $headerTitle = "$($norm[0][$c])".Trim()
      if ([string]::IsNullOrWhiteSpace($headerTitle)) { $headerTitle = "Column $($c + 1)" }
      $columnTitles += $headerTitle

      $prefix = "C$($c + 1)"
      $firstLetter = [regex]::Match($headerTitle, '[A-Za-z]')
      if ($firstLetter.Success) {
        $base = $firstLetter.Value.ToUpperInvariant()
        $candidate = $base
        if (-not $usedPrefixes.Add($candidate)) {
          $candidate = "$base$($c + 1)"
          [void]$usedPrefixes.Add($candidate)
        }
        $prefix = $candidate
      } else {
        [void]$usedPrefixes.Add($prefix)
      }
      $columnPrefixes += $prefix
    }

    $normOriginal = @()
    foreach ($row in $norm) {
      $copy = @()
      for ($c = 0; $c -lt $colCount; $c++) {
        $copy += "$($row[$c])"
      }
      $normOriginal += ,$copy
    }

    $applyKeyingPass = {
      param([int]$Threshold)

      $workNorm = @()
      foreach ($row in $normOriginal) {
        $copy = @()
        for ($c = 0; $c -lt $colCount; $c++) {
          $copy += "$($row[$c])"
        }
        $workNorm += ,$copy
      }

      $longValueToKeyByColumn = @()
      $legendRowsByColumnLocal = @()
      $nextKeyByColumn = @()
      for ($c = 0; $c -lt $colCount; $c++) {
        $longValueToKeyByColumn += ,@{}
        $legendRowsByColumnLocal += ,(New-Object 'System.Collections.Generic.List[object]')
        $nextKeyByColumn += 1
      }

      for ($r = 0; $r -lt $workNorm.Count; $r++) {
        # row 0 = header, row 1 = separator; keep as-is for readability
        if ($r -lt 2) { continue }
        if (Test-MarkdownSeparatorRow -Cells $workNorm[$r]) { continue }
        for ($c = 0; $c -lt $colCount; $c++) {
          $cellText = $workNorm[$r][$c]
          if ([string]::IsNullOrWhiteSpace($cellText)) { continue }
          if ($cellText.Length -le $Threshold) { continue }

          $columnMap = $longValueToKeyByColumn[$c]
          if (-not $columnMap.ContainsKey($cellText)) {
            $key = ("{0}{1}" -f $columnPrefixes[$c], $nextKeyByColumn[$c])
            $nextKeyByColumn[$c]++
            $columnMap[$cellText] = $key
            $legendRowsByColumnLocal[$c].Add([pscustomobject]@{
              Key = $key
              Value = $cellText
            }) | Out-Null
          }

          $workNorm[$r][$c] = $columnMap[$cellText]
        }
      }

      $maxDataRowWidth = 0
      for ($r = 2; $r -lt $workNorm.Count; $r++) {
        if (Test-MarkdownSeparatorRow -Cells $workNorm[$r]) { continue }
        $rowWidth = 1
        for ($c = 0; $c -lt $colCount; $c++) {
          $rowWidth += ($workNorm[$r][$c].Length + 3)
        }
        if ($rowWidth -gt $maxDataRowWidth) { $maxDataRowWidth = $rowWidth }
      }

      return [pscustomobject]@{
        Norm = $workNorm
        LegendRowsByColumn = $legendRowsByColumnLocal
        MaxDataRowWidth = $maxDataRowWidth
      }
    }

    $keyPass = & $applyKeyingPass $LongCellThreshold
    if ($keyPass.MaxDataRowWidth -gt $AggressiveRowWidth -and $AggressiveLongCellThreshold -lt $LongCellThreshold) {
      $keyPass = & $applyKeyingPass $AggressiveLongCellThreshold
    }
    $norm = $keyPass.Norm
    $legendRowsByColumn = $keyPass.LegendRowsByColumn

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

    $hasLegend = $false
    for ($c = 0; $c -lt $colCount; $c++) {
      if ($legendRowsByColumn[$c].Count -gt 0) { $hasLegend = $true; break }
    }
    if ($hasLegend) {
      $out.Add("")
      $out.Add("Legend:")
      for ($c = 0; $c -lt $colCount; $c++) {
        if ($legendRowsByColumn[$c].Count -eq 0) { continue }
        $out.Add("$($columnTitles[$c]) keys:")
        foreach ($entry in $legendRowsByColumn[$c]) {
          $out.Add("- $($entry.Key): $($entry.Value)")
        }
      }
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
    return [pscustomobject]@{ Recommendation = "NCE"; Reason = "No version delta detected." }
  }
  if ($Delta -eq "unknown") {
    return [pscustomobject]@{ Recommendation = "RR"; Reason = "Could not classify semantic version delta." }
  }
  if ($Delta -eq "major") {
    return [pscustomobject]@{ Recommendation = "LCR"; Reason = "Major version upgrade often includes breaking changes." }
  }

  if ($Ecosystem -eq "node") {
    if ($DependencyType -eq "devDependencies") {
      return [pscustomobject]@{ Recommendation = "LNC"; Reason = "Dev-dependency patch/minor upgrades are usually tooling/type updates." }
    }
    if ($Delta -eq "patch") {
      return [pscustomobject]@{ Recommendation = "LNC"; Reason = "Runtime dependency patch upgrade is usually backward compatible." }
    }
    return [pscustomobject]@{ Recommendation = "RR"; Reason = "Runtime dependency minor upgrade may change behavior." }
  }

  if ($Ecosystem -eq "python") {
    if ($Package -in @("fastapi","starlette")) {
      if ($Delta -eq "patch") {
        return [pscustomobject]@{ Recommendation = "LNC"; Reason = "Framework patch upgrade is typically backward compatible." }
      }
      return [pscustomobject]@{ Recommendation = "RR"; Reason = "Framework minor upgrade can affect behavior/contracts." }
    }
    if ($Delta -eq "patch") {
      return [pscustomobject]@{ Recommendation = "LNC"; Reason = "Package patch upgrade is typically backward compatible." }
    }
    return [pscustomobject]@{ Recommendation = "RR"; Reason = "Package minor upgrade may require validation." }
  }

  return [pscustomobject]@{ Recommendation = "RR"; Reason = "No ecosystem-specific rule matched." }
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
Set-Location $RepoRoot
$ReportsPath = Join-Path $RepoRoot $ReportsDir
$OutdatedDir = Join-Path $ReportsPath "outdated"
New-DirectoryIfMissing $ReportsPath
New-DirectoryIfMissing $OutdatedDir
if ([string]::IsNullOrWhiteSpace($BackendVenvActivate)) {
  $BackendVenvActivate = '& "$env:USERPROFILE\.venvs\linalg-demos\Scripts\Activate.ps1"'
}
if ([string]::IsNullOrWhiteSpace($BackendVenvPython)) {
  $BackendVenvPython = "$env:USERPROFILE\.venvs\linalg-demos\Scripts\python.exe"
}

# Toolchain upgrade checks (read-only)
$toolchainUpgradeRows = @()

# Keep toolchain definitions in one place so adding new checks is straightforward.
$toolchainDefs = @(
  [pscustomobject]@{
    Tool = "git"
    CurrentKind = "toolInfo"
    LatestKind = "github_tag"
    LatestUrl = "https://api.github.com/repos/git-for-windows/git/releases/latest"
    FallbackLatestUrl = ""
    MissingCurrentNote = "git not found on PATH"
  },
  [pscustomobject]@{
    Tool = "pip-system"
    CurrentKind = "python_pip_system"
    LatestKind = "pypi_info_version"
    LatestUrl = "https://pypi.org/pypi/pip/json"
    FallbackLatestUrl = ""
    MissingCurrentNote = "pip not available via py/python -m pip"
  },
  [pscustomobject]@{
    Tool = "pip-venv"
    CurrentKind = "python_pip_venv"
    LatestKind = "pypi_info_version"
    LatestUrl = "https://pypi.org/pypi/pip/json"
    FallbackLatestUrl = ""
    MissingCurrentNote = "pip not available via backend venv python"
  },
  [pscustomobject]@{
    Tool = "pnpm"
    CurrentKind = "toolInfo"
    LatestKind = "json_version"
    LatestUrl = "https://registry.npmjs.org/pnpm/latest"
    FallbackLatestUrl = ""
    MissingCurrentNote = "pnpm not found on PATH"
  },
  [pscustomobject]@{
    Tool = "python"
    CurrentKind = "toolInfo"
    LatestKind = "python_release_or_tags"
    LatestUrl = "https://api.github.com/repos/python/cpython/releases?per_page=100"
    FallbackLatestUrl = "https://api.github.com/repos/python/cpython/tags?per_page=200"
    MissingCurrentNote = "python not found on PATH"
  },
  [pscustomobject]@{
    Tool = "uv"
    CurrentKind = "toolInfo"
    LatestKind = "github_tag"
    LatestUrl = "https://api.github.com/repos/astral-sh/uv/releases/latest"
    FallbackLatestUrl = ""
    MissingCurrentNote = "uv not found on PATH"
  },
  [pscustomobject]@{
    Tool = "volta"
    CurrentKind = "toolInfo"
    LatestKind = "github_tag"
    LatestUrl = "https://api.github.com/repos/volta-cli/volta/releases/latest"
    FallbackLatestUrl = ""
    MissingCurrentNote = "volta not found on PATH"
  }
)

# Tool versions (derived from toolchain defs, plus node for runtime checks).
$toolInfo = [ordered]@{}
$toolVersionCommands = @("node")
foreach ($d in $toolchainDefs) {
  if ($d.CurrentKind -eq "toolInfo" -and -not [string]::IsNullOrWhiteSpace("$($d.Tool)")) {
    $toolVersionCommands += "$($d.Tool)"
  }
}
$toolVersionCommands = @($toolVersionCommands | Sort-Object -Unique)
foreach ($t in $toolVersionCommands) {
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

function Get-ToolchainCurrentVersion {
  param(
    [pscustomobject]$Def,
    [System.Collections.IDictionary]$ToolInfo
  )

  switch ($Def.CurrentKind) {
    "toolInfo" {
      if ($ToolInfo.Contains($Def.Tool)) {
        return (Get-VersionTokenFromText -Text "$($ToolInfo[$Def.Tool])")
      }
      return ""
    }
    "python_pip_system" {
      $pipRaw = ""
      if ($null -ne (Get-Command py -ErrorAction SilentlyContinue)) {
        try { $pipRaw = (& py -m pip --version 2>$null | Out-String).Trim() } catch {}
      }
      if ([string]::IsNullOrWhiteSpace($pipRaw) -and $null -ne (Get-Command python -ErrorAction SilentlyContinue)) {
        try { $pipRaw = (& python -m pip --version 2>$null | Out-String).Trim() } catch {}
      }
      return (Get-VersionTokenFromText -Text $pipRaw)
    }
    "python_pip_venv" {
      $pipRaw = ""
      if (-not [string]::IsNullOrWhiteSpace($BackendVenvPython) -and (Test-Path $BackendVenvPython)) {
        try { $pipRaw = (& $BackendVenvPython -m pip --version 2>$null | Out-String).Trim() } catch {}
      }
      return (Get-VersionTokenFromText -Text $pipRaw)
    }
    default {
      return ""
    }
  }
}

function Get-ToolchainLatestInfo {
  param([pscustomobject]$Def)

  $latest = ""
  $notes = ""
  $sourceUsed = $Def.LatestUrl

  switch ($Def.LatestKind) {
    "github_tag" {
      $json = Invoke-JsonRequest -Url $Def.LatestUrl
      if ($null -ne $json -and -not [string]::IsNullOrWhiteSpace("$($json.tag_name)")) {
        $latest = Get-VersionTokenFromText -Text "$($json.tag_name)"
      }
    }
    "pypi_info_version" {
      $json = Invoke-JsonRequest -Url $Def.LatestUrl
      if ($null -ne $json -and $null -ne $json.info -and -not [string]::IsNullOrWhiteSpace("$($json.info.version)")) {
        $latest = Get-VersionTokenFromText -Text "$($json.info.version)"
      }
    }
    "json_version" {
      $json = Invoke-JsonRequest -Url $Def.LatestUrl
      if ($null -ne $json -and -not [string]::IsNullOrWhiteSpace("$($json.version)")) {
        $latest = Get-VersionTokenFromText -Text "$($json.version)"
      }
    }
    "python_release_or_tags" {
      $rels = Invoke-JsonRequest -Url $Def.LatestUrl
      if ($null -ne $rels) {
        foreach ($rel in @($rels)) {
          if ($null -eq $rel) { continue }
          if ($rel.prerelease -or $rel.draft) { continue }
          $candidate = Get-VersionTokenFromText -Text "$($rel.tag_name)"
          if (-not [string]::IsNullOrWhiteSpace($candidate)) {
            $latest = $candidate
            break
          }
        }
      }

      if ([string]::IsNullOrWhiteSpace($latest) -and -not [string]::IsNullOrWhiteSpace($Def.FallbackLatestUrl)) {
        $tags = Invoke-JsonRequest -Url $Def.FallbackLatestUrl
        if ($null -ne $tags) {
          foreach ($tag in @($tags)) {
            if ($null -eq $tag) { continue }
            $name = "$($tag.name)"
            # Accept only stable X.Y.Z tags (for example: v3.14.3), skip rc/a/b/dev tags.
            if ($name -match '^\s*v?(\d+)\.(\d+)\.(\d+)\s*$') {
              $latest = ("{0}.{1}.{2}" -f $Matches[1], $Matches[2], $Matches[3])
              break
            }
          }
          if (-not [string]::IsNullOrWhiteSpace($latest)) {
            $sourceUsed = ("{0}; {1}" -f $Def.LatestUrl, $Def.FallbackLatestUrl)
            $notes = "used tags fallback"
          }
        }
      }
    }
  }

  if ([string]::IsNullOrWhiteSpace($latest) -and [string]::IsNullOrWhiteSpace($notes)) {
    $notes = "latest lookup failed or blocked"
  }

  return [pscustomobject]@{
    Latest = $latest
    Notes  = $notes
    Source = $sourceUsed
  }
}

foreach ($def in $toolchainDefs) {
  $current = Get-ToolchainCurrentVersion -Def $def -ToolInfo $toolInfo
  $latestInfo = Get-ToolchainLatestInfo -Def $def
  $notes = "$($latestInfo.Notes)"

  if ([string]::IsNullOrWhiteSpace($current)) {
    if ([string]::IsNullOrWhiteSpace($notes)) { $notes = $def.MissingCurrentNote }
    else { $notes += "; $($def.MissingCurrentNote)" }
  }

  $toolchainUpgradeRows += [pscustomobject]@{
    Tool = $def.Tool
    Current = $current
    Latest = $latestInfo.Latest
    Status = Get-ToolUpgradeStatus -Current $current -Latest $latestInfo.Latest
    Source = $latestInfo.Source
    Notes = $notes
  }
}

# Discover other python manifests (informational)
$otherPy = @(Find-OtherPythonManifests -RepoRoot $RepoRoot)

# ---------- Node scan ----------
$nodeErrors  = @()
$nodeNotes   = @()
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

  $latestErrText = Get-ToolErrorText -Path $r.LatestErrPath
  $compatErrText = Get-ToolErrorText -Path $r.CompatErrPath

  if (-not $latestOk) {
    $latestSnippet = Get-ErrorSnippet -ErrorText $latestErrText
    $msg = "Could not parse latest JSON for $scope (exit=$($r.LatestExitCode)); continuing with partial report. See $($r.LatestErrPath)."
    if (-not [string]::IsNullOrWhiteSpace($latestSnippet)) { $msg += " stderr: $latestSnippet" }
    $nodeErrors += $msg
  } elseif ($r.LatestExitCode -ne 0) {
    $latestSnippet = Get-ErrorSnippet -ErrorText $latestErrText
    $msg = "pnpm latest scan for $scope returned non-zero exit code $($r.LatestExitCode), but JSON parsed successfully (informational)."
    if (-not [string]::IsNullOrWhiteSpace($latestSnippet)) { $msg += " stderr: $latestSnippet" }
    $nodeNotes += $msg
  }
  if (-not $compatOk) {
    $compatSnippet = Get-ErrorSnippet -ErrorText $compatErrText
    $msg = "Could not parse compatible JSON for $scope (exit=$($r.CompatExitCode)); continuing with partial report. See $($r.CompatErrPath)."
    if (-not [string]::IsNullOrWhiteSpace($compatSnippet)) { $msg += " stderr: $compatSnippet" }
    $nodeErrors += $msg
  } elseif ($r.CompatExitCode -ne 0) {
    $compatSnippet = Get-ErrorSnippet -ErrorText $compatErrText
    $msg = "pnpm compatible scan for $scope returned non-zero exit code $($r.CompatExitCode), but JSON parsed successfully (informational)."
    if (-not [string]::IsNullOrWhiteSpace($compatSnippet)) { $msg += " stderr: $compatSnippet" }
    $nodeNotes += $msg
  }
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

$uvUpgradeExit = $null
$uvFallbackExit = $null
$uvEffectiveExit = $null
$uvCompileMode = "not_run"
$upgradedPath = Join-Path $ReportsPath "requirements.upgraded.txt"
$uvErrPath    = Join-Path $ReportsPath "uv_compile.stderr.txt"
$uvFallbackErrPath = Join-Path $ReportsPath "uv_compile.fallback.stderr.txt"
$uvCacheDir   = Join-Path $ReportsPath ".uv-cache"
New-DirectoryIfMissing $uvCacheDir

$diffCount = 0
$addCount  = 0
$remCount  = 0

if (-not $foundIn) {
  $pyErrors += "backend/requirements.in not found; skipping Python upgrade preview."
} elseif ($null -eq (Get-Command uv -ErrorAction SilentlyContinue)) {
  $pyErrors += "uv not found on PATH; skipping Python upgrade preview."
} else {
  $uvCompileMode = "upgrade"
  $uvUpgradeExit = Invoke-ToolCapture -Exe "uv" -Args @("pip","compile",$backendReqIn,"--upgrade","--cache-dir",$uvCacheDir) `
    -WorkingDir $RepoRoot -StdoutPath $upgradedPath -StderrPath $uvErrPath

  if ($uvUpgradeExit -eq 0) {
    $uvEffectiveExit = 0
  } else {
    $uvErrText = Get-ToolErrorText -Path $uvErrPath
    $uvFallbackExit = Invoke-ToolCapture -Exe "uv" -Args @("pip","compile",$backendReqIn,"--cache-dir",$uvCacheDir) `
      -WorkingDir $RepoRoot -StdoutPath $upgradedPath -StderrPath $uvFallbackErrPath

    if ($uvFallbackExit -eq 0) {
      $uvCompileMode = "fallback_without_upgrade"
      $uvEffectiveExit = 0

      $registryHint = Get-RegistryUnreachableReason -ErrorText $uvErrText
      $uvSnippet = Get-ErrorSnippet -ErrorText $uvErrText
      $msg = "uv pip compile --upgrade exited with code ${uvUpgradeExit}; fallback compile without --upgrade succeeded. Upgrade detection may be incomplete for latest-available packages."
      if (-not [string]::IsNullOrWhiteSpace($registryHint)) { $msg += " Detected during --upgrade: $registryHint." }
      if (-not [string]::IsNullOrWhiteSpace($uvSnippet)) { $msg += " stderr: $uvSnippet" }
      $pyErrors += $msg
    } else {
      $uvCompileMode = "failed"
      $uvEffectiveExit = $uvFallbackExit

      $blockedHint = if (Test-ErrorLooksBlocked -ErrorText $uvErrText) {
        "likely blocked by permissions/sandbox; continuing with partial report."
      } else {
        "continuing with partial report."
      }
      $registryHint = Get-RegistryUnreachableReason -ErrorText $uvErrText
      if (-not [string]::IsNullOrWhiteSpace($registryHint)) {
        $blockedHint = "$blockedHint Detected: $registryHint."
      }
      $uvSnippet = Get-ErrorSnippet -ErrorText $uvErrText
      $msg = "uv pip compile --upgrade exited with code ${uvUpgradeExit}: $blockedHint See $uvErrPath."
      if (-not [string]::IsNullOrWhiteSpace($uvSnippet)) { $msg += " stderr: $uvSnippet" }
      $pyErrors += $msg

      $uvFallbackErrText = Get-ToolErrorText -Path $uvFallbackErrPath
      $fallbackBlockedHint = if (Test-ErrorLooksBlocked -ErrorText $uvFallbackErrText) {
        "likely blocked by permissions/sandbox; continuing with partial report."
      } else {
        "continuing with partial report."
      }
      $fallbackRegistryHint = Get-RegistryUnreachableReason -ErrorText $uvFallbackErrText
      if (-not [string]::IsNullOrWhiteSpace($fallbackRegistryHint)) {
        $fallbackBlockedHint = "$fallbackBlockedHint Detected: $fallbackRegistryHint."
      }
      $uvFallbackSnippet = Get-ErrorSnippet -ErrorText $uvFallbackErrText
      $fallbackMsg = "uv pip compile fallback (without --upgrade) exited with code ${uvFallbackExit}: $fallbackBlockedHint See $uvFallbackErrPath."
      if (-not [string]::IsNullOrWhiteSpace($uvFallbackSnippet)) { $fallbackMsg += " stderr: $uvFallbackSnippet" }
      $pyErrors += $fallbackMsg
    }
  }

  if (($null -ne $uvEffectiveExit -and $uvEffectiveExit -eq 0) -and -not $foundTxt) {
    $pyErrors += "backend/requirements.txt not found; cannot diff pinned versions."
  } elseif ($null -ne $uvEffectiveExit -and $uvEffectiveExit -eq 0) {
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

$impactRequiresChanges = @($impactRows | Where-Object { $_.Recommendation -eq "LCR" }).Count -gt 0
$impactNeedsReview = @($impactRows | Where-Object { $_.Recommendation -eq "RR" }).Count -gt 0

$impactFileRows = @()
foreach ($row in ($impactRows | Where-Object { $_.Recommendation -eq "RR" -or $_.Recommendation -eq "LCR" })) {
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

[void]$sb.AppendLine("## Toolchain upgrade availability (read-only)")
[void]$sb.AppendLine("")
if ($toolchainUpgradeRows.Count -gt 0) {
  [void]$sb.AppendLine("| Tool | Current | Latest | Status | Source | Notes |")
  [void]$sb.AppendLine("|---|---|---|---|---|---|")
  foreach ($row in ($toolchainUpgradeRows | Sort-Object Tool)) {
    [void]$sb.AppendLine("| $($row.Tool) | $($row.Current) | $($row.Latest) | $($row.Status) | $($row.Source) | $($row.Notes) |")
  }
} else {
  [void]$sb.AppendLine("_No toolchain checks were produced._")
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

if ($nodeNotes.Count -gt 0) {
  [void]$sb.AppendLine("### Node scan notes")
  [void]$sb.AppendLine("")
  foreach ($e in ($nodeNotes | Select-Object -Unique)) {
    [void]$sb.AppendLine("- $e")
  }
  [void]$sb.AppendLine("")
}

if ($nodeErrors.Count -gt 0) {
  [void]$sb.AppendLine("### Node scan errors")
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
if ($uvCompileMode -ne "not_run") { [void]$sb.AppendLine(("- compile mode: **{0}**" -f $uvCompileMode)) }
if ($null -ne $uvUpgradeExit) { [void]$sb.AppendLine(("- uv upgrade exit code: **{0}**" -f $uvUpgradeExit)) }
if ($null -ne $uvFallbackExit) { [void]$sb.AppendLine(("- uv fallback exit code: **{0}**" -f $uvFallbackExit)) }
if ($null -ne $uvEffectiveExit) { [void]$sb.AppendLine(("- uv effective exit code: **{0}**" -f $uvEffectiveExit)) }
[void]$sb.AppendLine("- upgraded preview: " + '`' + (Get-RelPath $RepoRoot $upgradedPath) + '`')
[void]$sb.AppendLine("- uv stderr (upgrade): " + '`' + (Get-RelPath $RepoRoot $uvErrPath) + '`')
if ($null -ne $uvFallbackExit) {
  [void]$sb.AppendLine("- uv stderr (fallback): " + '`' + (Get-RelPath $RepoRoot $uvFallbackErrPath) + '`')
}
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
  [void]$sb.AppendLine("| Ecosystem | Scope | Package | Type | Current | Target | Delta | Rec | Reason |")
  [void]$sb.AppendLine("|---|---|---|---|---|---|---|---|---|")
  foreach ($row in ($impactRows | Sort-Object Ecosystem, Scope, Package)) {
    $recDisplay = "$($row.Recommendation)"
    [void]$sb.AppendLine("| $($row.Ecosystem) | $($row.Scope) | $($row.Package) | $($row.DependencyType) | $($row.Current) | $($row.Target) | $($row.Delta) | $recDisplay | $($row.Reason) |")
  }
  [void]$sb.AppendLine("")
  [void]$sb.AppendLine("Rec legend:")
  [void]$sb.AppendLine("- `NCE`: no_changes_expected")
  [void]$sb.AppendLine("- `LNC`: likely_no_changes")
  [void]$sb.AppendLine("- `RR`: review_recommended")
  [void]$sb.AppendLine("- `LCR`: likely_changes_required")
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
[void]$sb.AppendLine("1. Update toolchain components with available upgrades (read-only checks above).")
[void]$sb.AppendLine("   - For Python/pip/backend commands, activate backend venv:")
[void]$sb.AppendLine("   - " + '`' + $BackendVenvActivate + '`')
[void]$sb.AppendLine("   - Verify interpreter:")
[void]$sb.AppendLine("   - " + '`' + 'python -c "import sys,os; print(sys.executable); print(os.environ.get(''VIRTUAL_ENV''))"' + '`')
[void]$sb.AppendLine("   - Verify pip in both contexts:")
[void]$sb.AppendLine("   - " + '`' + "py -m pip --version" + '`')
[void]$sb.AppendLine("   - " + '`' + ('& "{0}" -m pip --version' -f $BackendVenvPython) + '`')
$pnpmToolRow = @($toolchainUpgradeRows | Where-Object { $_.Tool -eq "pnpm" } | Select-Object -First 1)
$pnpmPinVersion = if ($pnpmToolRow.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace("$($pnpmToolRow.Latest)")) { "$($pnpmToolRow.Latest)" } else { "latest" }
$pnpmPinExplicitCmd = "volta pin pnpm@{0}" -f $pnpmPinVersion
[void]$sb.AppendLine("   - Optional Volta project pinning (run once per demo project):")
[void]$sb.AppendLine("   - " + '`' + "volta pin node@lts" + '`' + " or " + '`' + "volta pin node@latest" + '`')
[void]$sb.AppendLine("   - " + '`' + $pnpmPinExplicitCmd + '`' + " or " + '`' + "volta pin pnpm@latest" + '`')
[void]$sb.AppendLine("   - Verify active/runtime tool versions:")
[void]$sb.AppendLine("   - " + '`' + "node -v" + '`')
[void]$sb.AppendLine("   - " + '`' + "pnpm -v" + '`')
[void]$sb.AppendLine("   - " + '`' + "volta list node" + '`')
[void]$sb.AppendLine("   - " + '`' + "volta list pnpm" + '`')
[void]$sb.AppendLine("   - Check demo project pin declarations (run from repo root " + '`' + "linalg" + '`' + "):")
[void]$sb.AppendLine("   - " + '`' + 'Get-ChildItem demos -Recurse -Filter package.json | Where-Object { $_.FullName -notmatch ''\\node_modules\\'' } | Select-String -Pattern ''"volta"|"packageManager"'' | ForEach-Object { "{0}:{1}: {2}" -f $_.Path, $_.LineNumber, $_.Line.Trim() }' + '`')
[void]$sb.AppendLine("   - Output format: " + '`' + "<path>:<line>: <matched text>" + '`' + ".")
[void]$sb.AppendLine("   - Optional cleanup: " + '`' + "volta uninstall pnpm@<unused-version>" + '`' + " (Volta does not currently support uninstalling Node runtimes).")
$toolchainUpgradeCandidates = @($toolchainUpgradeRows | Where-Object { $_.Status -eq "upgrade_available" } | Sort-Object Tool)
if ($toolchainUpgradeCandidates.Count -gt 0) {
  foreach ($row in $toolchainUpgradeCandidates) {
    $fromTo = if (-not [string]::IsNullOrWhiteSpace("$($row.Current)") -and -not [string]::IsNullOrWhiteSpace("$($row.Latest)")) {
      "$($row.Current) -> $($row.Latest)"
    } else {
      "version change available"
    }

    if ($row.Tool -eq "pip-system") {
      [void]$sb.AppendLine("   - " + '`' + "pip-system" + '`' + " ($fromTo): " + '`' + "py -m pip install --upgrade pip" + '`')
      [void]$sb.AppendLine("   - Verify: " + '`' + "py -m pip --version" + '`')
    } elseif ($row.Tool -eq "pip-venv") {
      [void]$sb.AppendLine("   - " + '`' + "pip-venv" + '`' + " ($fromTo): " + '`' + ('& "{0}" -m pip install --upgrade pip' -f $BackendVenvPython) + '`')
      [void]$sb.AppendLine("   - Verify: " + '`' + ('& "{0}" -m pip --version' -f $BackendVenvPython) + '`')
    } elseif ($row.Tool -eq "pnpm") {
      [void]$sb.AppendLine("   - " + '`' + "pnpm" + '`' + " ($fromTo): " + '`' + "volta install pnpm@latest" + '`')
      [void]$sb.AppendLine("   - Verify: " + '`' + "pnpm -v" + '`')
    } elseif ($row.Tool -eq "uv") {
      [void]$sb.AppendLine("   - " + '`' + "uv" + '`' + " ($fromTo): " + '`' + "uv self update" + '`')
      [void]$sb.AppendLine("   - Verify: " + '`' + "uv --version" + '`')
    } elseif ($row.Tool -eq "git") {
      [void]$sb.AppendLine("   - " + '`' + "git" + '`' + " ($fromTo): " + '`' + "winget upgrade --id Git.Git -e" + '`')
      [void]$sb.AppendLine("   - Verify: " + '`' + "git --version" + '`')
    } elseif ($row.Tool -eq "python") {
      [void]$sb.AppendLine("   - " + '`' + "python" + '`' + " ($fromTo): update via installer/package manager for your platform.")
      [void]$sb.AppendLine("   - Verify: " + '`' + "python --version" + '`')
    } elseif ($row.Tool -eq "volta") {
      [void]$sb.AppendLine("   - " + '`' + "volta" + '`' + " ($fromTo): update via installer/package manager channel.")
      [void]$sb.AppendLine("   - Verify: " + '`' + "volta --version" + '`')
    } else {
      [void]$sb.AppendLine("   - " + '`' + "$($row.Tool)" + '`' + " ($fromTo): update using the tool's official channel.")
    }
  }
} else {
  [void]$sb.AppendLine("   - No toolchain upgrades flagged as available.")
}
[void]$sb.AppendLine("")

[void]$sb.AppendLine("2. Upgrade frontend runtime dependencies to latest (if any).")
$runtimeInstallRows = @($nodeRuntimeRows | Where-Object { $_.Type -eq "dependencies" -or $_.Type -eq "optionalDependencies" })
if ($runtimeInstallRows.Count -gt 0) {
  $runtimeByScope = @{}
  foreach ($row in $runtimeInstallRows) {
    if (-not $runtimeByScope.ContainsKey($row.Scope)) { $runtimeByScope[$row.Scope] = [ordered]@{ Dir = $row.Dir; Pkgs = @(); Names = @() } }
    $runtimeByScope[$row.Scope].Pkgs += ("{0}@latest" -f $row.Package)
    $runtimeByScope[$row.Scope].Names += $row.Package
  }
  foreach ($scope in ($runtimeByScope.Keys | Sort-Object)) {
    $dir = $runtimeByScope[$scope].Dir
    $pkgs = @($runtimeByScope[$scope].Pkgs | Sort-Object -Unique) -join " "
    $names = @($runtimeByScope[$scope].Names | Sort-Object -Unique) -join " "
    [void]$sb.AppendLine("   - " + '`' + ("pnpm --dir " + $dir + " add " + $pkgs) + '`')
    [void]$sb.AppendLine("   - Verify: " + '`' + ("pnpm --dir " + $dir + " list --depth -1 " + $names) + '`')
  }
} else {
  [void]$sb.AppendLine("   - No outdated frontend runtime dependencies found.")
}
[void]$sb.AppendLine("")

[void]$sb.AppendLine("3. Upgrade frontend dev dependencies to latest (if any).")
if ($nodeDevRows.Count -gt 0) {
  $devByScope = @{}
  foreach ($row in $nodeDevRows) {
    if (-not $devByScope.ContainsKey($row.Scope)) { $devByScope[$row.Scope] = [ordered]@{ Dir = $row.Dir; Pkgs = @(); Names = @() } }
    $devByScope[$row.Scope].Pkgs += ("{0}@latest" -f $row.Package)
    $devByScope[$row.Scope].Names += $row.Package
  }
  foreach ($scope in ($devByScope.Keys | Sort-Object)) {
    $dir = $devByScope[$scope].Dir
    $pkgs = @($devByScope[$scope].Pkgs | Sort-Object -Unique) -join " "
    $names = @($devByScope[$scope].Names | Sort-Object -Unique) -join " "
    [void]$sb.AppendLine("   - " + '`' + ("pnpm --dir " + $dir + " add -D " + $pkgs) + '`')
    [void]$sb.AppendLine("   - Verify: " + '`' + ("pnpm --dir " + $dir + " list --depth -1 " + $names) + '`')
  }
} else {
  [void]$sb.AppendLine("   - No outdated frontend dev dependencies found.")
}
[void]$sb.AppendLine("")

[void]$sb.AppendLine("4. Rebuild affected frontends.")
$affectedDirs = @($nodeRows | Select-Object -ExpandProperty Dir -Unique | Sort-Object)
if ($affectedDirs.Count -gt 0) {
  foreach ($dir in $affectedDirs) {
    [void]$sb.AppendLine("   - " + '`' + ("pnpm --dir " + $dir + " build") + '`')
    [void]$sb.AppendLine("   - Verify: " + '`' + '$LASTEXITCODE' + '`' + " (expect 0)")
  }
} else {
  if ($nodeSummary.Count -eq 0) {
    [void]$sb.AppendLine("   - No frontend scopes were scanned.")
  } else {
    [void]$sb.AppendLine("   - No frontend scopes have outdated packages; no rebuild targets identified.")
  }
}
[void]$sb.AppendLine("")

[void]$sb.AppendLine("5. Apply backend Python upgrades from the requirements.in workflow.")
[void]$sb.AppendLine("   - Run from repo root (" + '`' + "linalg" + '`' + ") so " + '`' + "backend/..." + '`' + " paths resolve.")
[void]$sb.AppendLine("   - Activate shared backend venv:")
[void]$sb.AppendLine("   - " + '`' + $BackendVenvActivate + '`')
[void]$sb.AppendLine("   - Verify interpreter is the shared venv:")
[void]$sb.AppendLine("   - " + '`' + 'python -c "import sys,os; print(sys.executable); print(os.environ.get(''VIRTUAL_ENV''))"' + '`')
[void]$sb.AppendLine("   - Compile + sync:")
[void]$sb.AppendLine("   - " + '`' + "uv pip compile --upgrade backend/requirements.in -o backend/requirements.txt" + '`')
[void]$sb.AppendLine("   - Verify: " + '`' + "git diff -- backend/requirements.txt" + '`')
[void]$sb.AppendLine("   - " + '`' + "uv pip sync backend/requirements.txt" + '`')
[void]$sb.AppendLine("   - Verify: " + '`' + "uv pip check" + '`')
$pyUpgradeRows = @($pyRows | Where-Object { $_.Status -eq "update" -or $_.Status -eq "added" -or $_.Status -eq "removed" })
if ($pyUpgradeRows.Count -gt 0) {
  [void]$sb.AppendLine("   - Packages identified by scan:")
  foreach ($row in ($pyUpgradeRows | Sort-Object Package)) {
    [void]$sb.AppendLine("   - " + '`' + $row.Package + '`' + ": " + '`' + $row.Current + '`' + " -> " + '`' + $row.Upgraded + '`' + " (" + $row.Status + ")")
  }
  [void]$sb.AppendLine("   - Verify expected pins in " + '`' + "backend/requirements.txt" + '`' + ":")
  foreach ($row in ($pyUpgradeRows | Sort-Object Package)) {
    $pkgPattern = [regex]::Escape("$($row.Package)")
    if ($row.Status -eq "removed") {
      $cmd = "Select-String -Path backend/requirements.txt -Pattern '^{0}=='" -f $pkgPattern
      [void]$sb.AppendLine("   - " + '`' + $cmd + '`' + " (expect no matches)")
    } else {
      $verPattern = [regex]::Escape("$($row.Upgraded)")
      $cmd = "Select-String -Path backend/requirements.txt -Pattern '^{0}=={1}$'" -f $pkgPattern, $verPattern
      [void]$sb.AppendLine("   - " + '`' + $cmd + '`')
    }
  }
} else {
  if ($null -ne $uvEffectiveExit -and $uvEffectiveExit -ne 0) {
    [void]$sb.AppendLine("   - Backend upgrade preview failed; no reliable backend diff is available from this run.")
  } else {
    [void]$sb.AppendLine("   - No backend package changes detected in preview.")
  }
}
[void]$sb.AppendLine("")

[void]$sb.AppendLine("6. Re-run scan to confirm upgrades are complete.")
[void]$sb.AppendLine("   - " + '`' + "pwsh -NoProfile -File .agent/skills/update-scan/scripts/update-dep-scanner.ps1" + '`')
$reportBody = Format-MarkdownTables -Markdown $sb.ToString()
$reportBody = $reportBody.TrimEnd("`r","`n") + "`r`n"
Set-Content -Path $reportPath -Value $reportBody -Encoding UTF8 -NoNewline

Write-Verbose ("Wrote report: {0}" -f $reportPath)
