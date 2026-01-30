param(
  [Parameter(Mandatory=$true)]
  [int]$Port,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$rows = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
  Select-Object -First 10

if (-not $rows) {
  Write-Host "No listeners found on port $Port"
  exit 0
}

$rows | ForEach-Object {
  $procID = $_.OwningProcess
  $proc = Get-Process -Id $procID -ErrorAction SilentlyContinue

  Write-Host ("Port {0} -> PID {1} ({2})" -f $Port, $procID, $proc.ProcessName)

  if ($Force) {
    Stop-Process -Id $procID -Force
    Write-Host "Stopped PID $procID"
  } else {
    Write-Host "Dry run. Re-run with -Force to stop PID $procID."
  }
}
