$ErrorActionPreference = 'Continue'

$frontendRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$playwright = Join-Path $frontendRoot 'node_modules\.bin\playwright.cmd'
$resultDirectory = Join-Path $frontendRoot 'test-results'
$summaryPath = Join-Path $resultDirectory 'ui-audit-run-summary.json'

New-Item -ItemType Directory -Force $resultDirectory | Out-Null
Set-Location $frontendRoot

$runs = @(
  @{
    Name = 'source-inventory'
    Arguments = @(
      'test',
      'ui-source-inventory.spec.ts',
      '--config=playwright.source-audit.config.ts',
      '--project=chromium',
      '--output=test-results/source-inventory'
    )
  },
  @{
    Name = 'browser-capability-audit'
    Arguments = @(
      'test',
      'ui-public-capability-audit.spec.ts',
      'ui-admin-incomplete-audit.spec.ts',
      'ui-management-incomplete-audit.spec.ts',
      'ui-responsive-accessibility-audit.spec.ts',
      '--project=chromium',
      '--output=test-results/browser-capability',
      '--trace=retain-on-failure',
      '--reporter=line'
    )
  },
  @{
    Name = 'real-flow-audit'
    Arguments = @(
      'test',
      'real-environment-smoke.spec.ts',
      'ui-real-flow-audit.spec.ts',
      '--project=chromium',
      '--output=test-results/real-flow',
      '--trace=retain-on-failure',
      '--reporter=line'
    )
  }
)

$results = foreach ($run in $runs) {
  $startedAt = Get-Date
  & $playwright @($run.Arguments) 2>&1 | Out-Host
  $exitCode = $LASTEXITCODE
  [PSCustomObject]@{
    name = $run.Name
    exitCode = $exitCode
    durationSeconds = [Math]::Round(((Get-Date) - $startedAt).TotalSeconds, 2)
  }
}

$results | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 $summaryPath
$results | Format-Table -AutoSize
Write-Output "Summary: $summaryPath"

if (@($results | Where-Object { $_.exitCode -ne 0 }).Count -gt 0) { exit 1 }
exit 0
