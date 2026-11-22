<#
.SYNOPSIS
  Installs the SystemScope device agent on a Windows computer.

.DESCRIPTION
  Builds the agent from this repository, saves its one-time device token, and
  registers a scheduled task that starts the agent at logon. Run this on the
  computer you want to monitor, from a PowerShell prompt in the project folder.

.EXAMPLE
  .\scripts\install-agent.ps1 -ServerUrl https://my-app.onrender.com -DeviceId "<id>" -DeviceToken "<token>" -Label "Office PC"
#>
param(
  [Parameter(Mandatory = $true)][string]$ServerUrl,
  [Parameter(Mandatory = $true)][string]$DeviceId,
  [Parameter(Mandatory = $true)][string]$DeviceToken,
  [string]$Label = $env:COMPUTERNAME,
  [ValidateRange(5000, 3600000)][int]$IntervalMs = 30000,
  [string]$RepoPath = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js is required. Install Node 20 or newer from https://nodejs.org and rerun.' }

$repo = (Resolve-Path -LiteralPath $RepoPath).Path
$agent = Join-Path $repo 'server\dist\agent\index.js'

Write-Host '[SystemScope] Installing dependencies and building the agent...' -ForegroundColor Cyan
Push-Location $repo
try {
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'npm run build failed.' }
} finally {
  Pop-Location
}

Write-Host '[SystemScope] Saving device configuration...' -ForegroundColor Cyan
& $node.Source $agent setup $ServerUrl $DeviceId $DeviceToken $Label $IntervalMs
if ($LASTEXITCODE -ne 0) { throw 'Agent setup failed.' }

Write-Host '[SystemScope] Registering the logon task...' -ForegroundColor Cyan
$argument = '"' + $agent + '" run'
$action = New-ScheduledTaskAction -Execute $node.Source -Argument $argument -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'SystemScopeAgent' -Action $action -Trigger $trigger -Settings $settings -Force -Description "Reports this computer's real SystemScope data to the dashboard." | Out-Null
Start-ScheduledTask -TaskName 'SystemScopeAgent'

Write-Host '[SystemScope] Installed. The agent is running and will report at logon.' -ForegroundColor Green
Write-Host ('[SystemScope] Config: ' + (Join-Path $env:APPDATA 'SystemScopeAgent\config.json'))
