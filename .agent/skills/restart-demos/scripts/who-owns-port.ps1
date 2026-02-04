param(
  [Parameter(Mandatory=$true)]
  [int]$Port
)

$ErrorActionPreference = 'Stop'

$rows = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
  Sort-Object -Property State

if (-not $rows) {
  Write-Host "No listeners found on port $Port"
  exit 0
}

$processIds = $rows |
  Where-Object { $_.OwningProcess -gt 0 } |
  Select-Object -ExpandProperty OwningProcess -Unique

if (-not $processIds) {
  Write-Host "No owning processes found on port $Port"
  exit 0
}

$result = foreach ($procID in $processIds) {
  $firstRow = $rows | Where-Object { $_.OwningProcess -eq $procID } | Select-Object -First 1
  $proc = Get-Process -Id $procID -ErrorAction SilentlyContinue
  $cmd  = (Get-CimInstance Win32_Process -Filter "ProcessId=$procID" -ErrorAction SilentlyContinue).CommandLine

  [pscustomobject]@{
    Port      = $Port
    PID       = $procID
    Process   = if ($proc) { $proc.ProcessName } else { "<exited>" }
    State     = $firstRow.State
    LocalAddr = $firstRow.LocalAddress
    CmdLine   = $cmd
  }
}

$result | Sort-Object PID | Format-Table -AutoSize
