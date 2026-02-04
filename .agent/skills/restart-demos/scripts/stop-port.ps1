param(
  [Parameter(Mandatory=$true)]
  [int]$Port,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$rows = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue

if (-not $rows) {
  Write-Host "No listeners found on port $Port"
  exit 0
}

$processIds = $rows |
  Where-Object { $_.OwningProcess -gt 0 } |
  Select-Object -ExpandProperty OwningProcess -Unique

if (-not $processIds) {
  Write-Host "No processes found on port $Port"
  exit 0
}

$processIds | ForEach-Object {
  $procID = $_
  $proc = Get-Process -Id $procID -ErrorAction SilentlyContinue

  if ($null -eq $proc) {
    Write-Host ("Port {0} -> PID {1} (process exited)" -f $Port, $procID)
    return
  }

  Write-Host ("Port {0} -> PID {1} ({2})" -f $Port, $procID, $proc.ProcessName)

  if ($Force) {
    try {
      Stop-Process -Id $procID -Force -ErrorAction Stop
      Write-Host "Stopped PID $procID"
    } catch {
      Write-Warning ("Failed to stop PID {0}: {1}" -f $procID, $_.Exception.Message)
    }
  } else {
    Write-Host "Dry run. Re-run with -Force to stop PID $procID."
  }
}
