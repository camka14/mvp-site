param(
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$rootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$lockFile = Join-Path $rootDir ".next\dev\lock"

function Convert-ToMatchPath {
  param([string]$Path)
  return $Path.Replace("\", "/")
}

$rootMatchPaths = @($rootDir, (Convert-ToMatchPath $rootDir)) | Select-Object -Unique
$devCommandMarkers = @(
  "scripts/dev-with-ngrok.mjs",
  "next dev",
  "next\dist\bin\next",
  "next/dist/bin/next",
  "next-server (v",
  "npm run dev",
  "run dev:plain"
)

function Get-NodeProcessInfo {
  try {
    return @(
      Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
        ForEach-Object {
          [pscustomobject]@{
            Id = [int]$_.ProcessId
            ParentId = if ($null -eq $_.ParentProcessId) { $null } else { [int]$_.ParentProcessId }
            Name = $_.Name
            CommandLine = [string]$_.CommandLine
          }
        }
    )
  } catch {
    Write-Host "[dev-cleanup] Node command-line inspection unavailable: $($_.Exception.Message)"
    return @(
      Get-Process -Name node -ErrorAction SilentlyContinue |
        ForEach-Object {
          [pscustomobject]@{
            Id = [int]$_.Id
            ParentId = $null
            Name = $_.ProcessName
            CommandLine = ""
          }
        }
    )
  }
}

function Test-DevCommand {
  param([string]$CommandLine)

  if ([string]::IsNullOrWhiteSpace($CommandLine)) {
    return $false
  }

  $normalizedCommand = Convert-ToMatchPath $CommandLine
  $matchesRoot = $false
  foreach ($path in $rootMatchPaths) {
    if ($normalizedCommand.Contains((Convert-ToMatchPath $path))) {
      $matchesRoot = $true
      break
    }
  }

  $matchesDevMarker = $false
  foreach ($marker in $devCommandMarkers) {
    if ($normalizedCommand.Contains((Convert-ToMatchPath $marker))) {
      $matchesDevMarker = $true
      break
    }
  }

  return ($matchesRoot -and $matchesDevMarker)
}

function Get-Port3000NodePids {
  $listeners = @(
    Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique
  )

  if ($listeners.Count -eq 0) {
    return @()
  }

  $nodeIds = @(Get-Process -Name node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
  return @($listeners | Where-Object { $nodeIds -contains $_ })
}

function Expand-NodeChildren {
  param(
    [int[]]$ProcessIds,
    [object[]]$NodeProcesses
  )

  $seen = @{}
  $queue = New-Object System.Collections.Queue
  foreach ($id in $ProcessIds) {
    if ($null -ne $id -and -not $seen.ContainsKey($id)) {
      $seen[$id] = $true
      $queue.Enqueue($id)
    }
  }

  while ($queue.Count -gt 0) {
    $current = [int]$queue.Dequeue()
    foreach ($child in $NodeProcesses | Where-Object { $_.ParentId -eq $current }) {
      if (-not $seen.ContainsKey($child.Id)) {
        $seen[$child.Id] = $true
        $queue.Enqueue($child.Id)
      }
    }
  }

  return @($seen.Keys | ForEach-Object { [int]$_ } | Sort-Object -Unique)
}

function Stop-DevProcesses {
  param([int[]]$ProcessIds)

  foreach ($processId in ($ProcessIds | Sort-Object -Unique)) {
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($null -eq $process) {
      continue
    }

    if ($DryRun) {
      Write-Host "[dev-cleanup] Would stop node process $processId"
      continue
    }

    Write-Host "[dev-cleanup] Stopping node process $processId"
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
}

$nodeProcesses = @(Get-NodeProcessInfo)
$commandLinePids = @(
  $nodeProcesses |
    Where-Object { Test-DevCommand $_.CommandLine } |
    Select-Object -ExpandProperty Id
)
$portPids = @(Get-Port3000NodePids)
$targetPids = @(Expand-NodeChildren -ProcessIds @($commandLinePids + $portPids) -NodeProcesses $nodeProcesses)

if ($targetPids.Count -gt 0) {
  Stop-DevProcesses -ProcessIds $targetPids
  if (-not $DryRun) {
    Start-Sleep -Seconds 1
  }
} else {
  Write-Host "[dev-cleanup] No stale Next dev node processes found."
}

$remainingPortPids = @(Get-Port3000NodePids)
$remainingDevPids = @(
  Get-NodeProcessInfo |
    Where-Object { Test-DevCommand $_.CommandLine } |
    Select-Object -ExpandProperty Id
)

if ((Test-Path -LiteralPath $lockFile) -and $remainingPortPids.Count -eq 0 -and $remainingDevPids.Count -eq 0) {
  if ($DryRun) {
    Write-Host "[dev-cleanup] Would remove stale lock $lockFile"
  } else {
    Remove-Item -LiteralPath $lockFile -Force
    Write-Host "[dev-cleanup] Removed stale lock $lockFile"
  }
} elseif (Test-Path -LiteralPath $lockFile) {
  Write-Host "[dev-cleanup] Lock retained because a dev process still appears active."
}
