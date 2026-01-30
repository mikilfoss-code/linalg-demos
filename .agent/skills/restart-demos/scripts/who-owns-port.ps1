param(
  [Parameter(Mandatory=$true)]
  [int]$Port
)

$ErrorActionPreference = 'Stop'

$rows = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
  Sort-Object -Property State |
  Select-Object -First 10

if (-not $rows) {
  Write-Host "No listeners found on port $Port"
  exit 0
}

foreach ($r in $rows) {
  $procID = $r.OwningProcess
  $proc = Get-Process -Id $procID -ErrorAction SilentlyContinue
  $cmd  = (Get-CimInstance Win32_Process -Filter "ProcessId=$procID" -ErrorAction SilentlyContinue).CommandLine

  [pscustomobject]@{
    Port      = $Port
    PID       = $procID
    Process   = $proc.ProcessName
    State     = $r.State
    LocalAddr = $r.LocalAddress
    CmdLine   = $cmd
  } | Format-Table -AutoSize
}
