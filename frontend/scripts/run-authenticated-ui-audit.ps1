[CmdletBinding()]
param(
  [int]$BackendPort = 8082,
  [int]$FrontendPort = 4420
)

$ErrorActionPreference = 'Stop'

$frontendRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repositoryRoot = (Resolve-Path (Join-Path $frontendRoot '..')).Path
$backendRoot = Join-Path $repositoryRoot 'backend'
$fixturePath = Join-Path $backendRoot 'src\main\java\com\hotel\services\impl\E2eFixtureInitializer.java'
$playwright = Join-Path $frontendRoot 'node_modules\.bin\playwright.cmd'
$outputDirectory = 'test-results/real-flow-authenticated'

function New-RandomHex([int]$ByteCount) {
  $bytes = New-Object byte[] $ByteCount
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

function Invoke-Login([string]$ApiRoot, [string]$Username, [string]$Password) {
  $body = @{ username = $Username; password = $Password } | ConvertTo-Json
  return Invoke-RestMethod -Uri "$ApiRoot/auth/login" -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 5
}

if (Get-NetTCPConnection -State Listen -LocalPort $BackendPort -ErrorAction SilentlyContinue) {
  throw "Backend port $BackendPort is already in use; refusing to stop or reuse an unrelated process."
}
if (Get-NetTCPConnection -State Listen -LocalPort $FrontendPort -ErrorAction SilentlyContinue) {
  throw "Frontend port $FrontendPort is already in use; refusing to reuse an unrelated application."
}

$fixtureSource = Get-Content -Raw -LiteralPath $fixturePath
$usernamePattern = '@Value\("\$\{(LUXESTAY_E2E_(?:CUSTOMER|ADMIN|OWNER)_USERNAME):([^}]*)\}"\)'
$usernames = @{}
foreach ($match in [regex]::Matches($fixtureSource, $usernamePattern)) {
  $usernames[$match.Groups[1].Value] = $match.Groups[2].Value
}
if ($usernames.Count -ne 3) {
  throw 'Could not resolve all E2E fixture usernames.'
}

$temporaryPassword = "E2e!$(New-RandomHex 18)"
$temporaryJwtSecret = New-RandomHex 48
$temporaryProviderSecret = New-RandomHex 32
$apiRoot = "http://localhost:$BackendPort/api"

$env:LUXESTAY_E2E_CUSTOMER_USERNAME = $usernames['LUXESTAY_E2E_CUSTOMER_USERNAME']
$env:LUXESTAY_E2E_ADMIN_USERNAME = $usernames['LUXESTAY_E2E_ADMIN_USERNAME']
$env:LUXESTAY_E2E_OWNER_USERNAME = $usernames['LUXESTAY_E2E_OWNER_USERNAME']
$env:LUXESTAY_E2E_CUSTOMER_PASSWORD = $temporaryPassword
$env:LUXESTAY_E2E_ADMIN_PASSWORD = $temporaryPassword
$env:LUXESTAY_E2E_OWNER_PASSWORD = $temporaryPassword
$env:LUXESTAY_E2E_API_URL = $apiRoot
$env:LUXESTAY_E2E_WEB_URL = "http://localhost:$FrontendPort"
$env:CORS_ALLOWED_ORIGINS = $env:LUXESTAY_E2E_WEB_URL
$env:WEBSOCKET_ALLOWED_ORIGINS = $env:LUXESTAY_E2E_WEB_URL
$env:SPRING_PROFILES_ACTIVE = 'e2e'
$env:SERVER_PORT = $BackendPort.ToString()
$env:JWT_SECRET = $temporaryJwtSecret
$env:VNPAY_TMN_CODE = 'E2E'
$env:VNPAY_HASH_SECRET = $temporaryProviderSecret

$standardOutput = [IO.Path]::GetTempFileName()
$standardError = [IO.Path]::GetTempFileName()
$backendProcess = $null
$testExitCode = 2

try {
  $backendProcess = Start-Process `
    -FilePath (Join-Path $backendRoot 'mvnw.cmd') `
    -ArgumentList @('-Dmaven.test.skip=true', 'spring-boot:run') `
    -WorkingDirectory $backendRoot `
    -RedirectStandardOutput $standardOutput `
    -RedirectStandardError $standardError `
    -WindowStyle Hidden `
    -PassThru

  $ownerAuth = $null
  for ($attempt = 0; $attempt -lt 90; $attempt++) {
    if ($backendProcess.HasExited) {
      break
    }
    try {
      $ownerAuth = Invoke-Login $apiRoot $env:LUXESTAY_E2E_OWNER_USERNAME $temporaryPassword
      if ($ownerAuth.accessToken) {
        break
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  if (-not $ownerAuth.accessToken) {
    $backendLog = @()
    if (Test-Path $standardOutput) { $backendLog += Get-Content -Tail 100 $standardOutput }
    if (Test-Path $standardError) { $backendLog += Get-Content -Tail 100 $standardError }
    $safeLog = ($backendLog -join [Environment]::NewLine)
    foreach ($secret in @($temporaryPassword, $temporaryJwtSecret, $temporaryProviderSecret)) {
      $safeLog = $safeLog.Replace($secret, '<redacted>')
    }
    Write-Output 'BACKEND_START_FAILED'
    Write-Output $safeLog
  } else {
    Write-Output 'BACKEND_READY=True'

    try {
      $headers = @{ Authorization = "Bearer $($ownerAuth.accessToken)" }
      $context = Invoke-RestMethod -Uri "$apiRoot/management/context" -Headers $headers -TimeoutSec 10
      if ($context.activePropertyId) {
        $env:LUXESTAY_E2E_PROPERTY_ID = $context.activePropertyId.ToString()
      }

      $adminAuth = Invoke-Login $apiRoot $env:LUXESTAY_E2E_ADMIN_USERNAME $temporaryPassword
      $adminHeaders = @{ Authorization = "Bearer $($adminAuth.accessToken)" }
      $allProperties = @(Invoke-RestMethod -Uri "$apiRoot/v1/hotels" -Headers $adminHeaders -TimeoutSec 10)
      $assignedIds = @($context.properties | ForEach-Object { [long]$_.id })
      $foreignProperty = $allProperties | Where-Object { $assignedIds -notcontains [long]$_.id } | Select-Object -First 1
      if ($foreignProperty) {
        $env:LUXESTAY_E2E_OTHER_PROPERTY_ID = $foreignProperty.id.ToString()
      }
    } catch {
      Write-Output 'PROPERTY_SCOPE_FIXTURE=PARTIAL'
    }

    Push-Location $frontendRoot
    try {
      & $playwright `
        test `
        real-environment-smoke.spec.ts `
        ui-real-flow-audit.spec.ts `
        subscription-entitlements.spec.ts `
        property-payment-configuration.spec.ts `
        --config=playwright.authenticated-audit.config.ts `
        --project=chromium `
        "--output=$outputDirectory" `
        --trace=off `
        --retries=0 `
        --workers=1 `
        --reporter=line
      $testExitCode = $LASTEXITCODE

      $authenticatedOutputPath = Join-Path $frontendRoot $outputDirectory
      if (Test-Path $authenticatedOutputPath) {
        Get-ChildItem -Recurse -File $authenticatedOutputPath |
          Where-Object { $_.Extension -in @('.json', '.log', '.md', '.txt') } |
          ForEach-Object {
            $content = Get-Content -Raw -LiteralPath $_.FullName
            if ($null -ne $content) {
              $redacted = $content.Replace($temporaryPassword, '<redacted>')
              if ($redacted -ne $content) {
                Set-Content -Encoding utf8 -LiteralPath $_.FullName -Value $redacted
              }
            }
          }
      }
    } finally {
      Pop-Location
    }
  }
} finally {
  $listenerProcessIds = @(
    Get-NetTCPConnection -State Listen -LocalPort $BackendPort -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique
  )
  foreach ($listenerProcessId in $listenerProcessIds) {
    if ($listenerProcessId -gt 0) {
      Stop-Process -Id $listenerProcessId -Force -ErrorAction SilentlyContinue
    }
  }
  if ($backendProcess -and -not $backendProcess.HasExited) {
    Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
  }
  foreach ($temporaryFile in @($standardOutput, $standardError)) {
    if (Test-Path $temporaryFile) {
      Remove-Item -LiteralPath $temporaryFile -Force -ErrorAction SilentlyContinue
    }
  }
}

Write-Output "AUTH_REAL_FLOW_EXIT=$testExitCode"
exit $testExitCode
