[CmdletBinding()]
param(
  [int]$BackendPort = 5122,
  [int]$FrontendPort = 4420,
  [string]$SqlServer = 'localhost'
)

$ErrorActionPreference = 'Stop'

$frontendRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repositoryRoot = (Resolve-Path (Join-Path $frontendRoot '..')).Path
$backendProject = Join-Path $repositoryRoot 'backend\src\HotelSaas.WebApi\HotelSaas.WebApi.csproj'
$playwright = Join-Path $frontendRoot 'node_modules\.bin\playwright.cmd'
$outputDirectory = 'test-results/real-flow-authenticated'

function New-RandomHex([int]$ByteCount) {
  $bytes = New-Object byte[] $ByteCount
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

function Invoke-Login([string]$ApiRoot, [string]$Username, [string]$Password) {
  $body = @{ usernameOrEmail = $Username; password = $Password } | ConvertTo-Json
  return Invoke-RestMethod -Uri "$ApiRoot/auth/login" -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 5
}

if ($BackendPort -ne 5122) {
  throw 'The Angular development proxy currently targets port 5122. Use -BackendPort 5122 for authenticated UI tests.'
}
if (Get-NetTCPConnection -State Listen -LocalPort $BackendPort -ErrorAction SilentlyContinue) {
  throw "Backend port $BackendPort is already in use; refusing to stop or reuse an unrelated process."
}
if (Get-NetTCPConnection -State Listen -LocalPort $FrontendPort -ErrorAction SilentlyContinue) {
  throw "Frontend port $FrontendPort is already in use; refusing to reuse an unrelated application."
}
if (-not (Test-Path -LiteralPath $backendProject)) {
  throw "The .NET WebApi project was not found at $backendProject."
}
if (-not (Test-Path -LiteralPath $playwright)) {
  throw 'Playwright is not installed. Run npm install in the frontend directory first.'
}

$databaseName = "HotelSaasE2E_$([Guid]::NewGuid().ToString('N'))"
$connectionString = "Server=$SqlServer;Database=$databaseName;Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=true"
$apiRoot = "http://127.0.0.1:$BackendPort/api"

$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ASPNETCORE_URLS = "http://127.0.0.1:$BackendPort"
$env:ConnectionStrings__DefaultConnection = $connectionString
$env:JwtSettings__Secret = New-RandomHex 48
$env:LUXESTAY_E2E_CUSTOMER_USERNAME = 'customer'
$env:LUXESTAY_E2E_CUSTOMER_PASSWORD = 'Customer@123'
$env:LUXESTAY_E2E_ADMIN_USERNAME = 'superadmin'
$env:LUXESTAY_E2E_ADMIN_PASSWORD = 'SuperAdmin@123'
$env:LUXESTAY_E2E_OWNER_USERNAME = 'manager_hotel_a'
$env:LUXESTAY_E2E_OWNER_PASSWORD = 'Owner@123'
$env:LUXESTAY_E2E_API_URL = $apiRoot
$env:LUXESTAY_E2E_WEB_URL = "http://127.0.0.1:$FrontendPort"

$standardOutput = [IO.Path]::GetTempFileName()
$standardError = [IO.Path]::GetTempFileName()
$backendProcess = $null
$testExitCode = 2

try {
  $backendProcess = Start-Process `
    -FilePath 'dotnet' `
    -ArgumentList @('run', '--no-launch-profile', '--project', $backendProject, '--urls', "http://127.0.0.1:$BackendPort") `
    -WorkingDirectory $repositoryRoot `
    -RedirectStandardOutput $standardOutput `
    -RedirectStandardError $standardError `
    -WindowStyle Hidden `
    -PassThru

  $ownerAuth = $null
  for ($attempt = 0; $attempt -lt 90; $attempt++) {
    if ($backendProcess.HasExited) { break }
    try {
      $ownerAuth = Invoke-Login $apiRoot $env:LUXESTAY_E2E_OWNER_USERNAME $env:LUXESTAY_E2E_OWNER_PASSWORD
      if ($ownerAuth.accessToken) { break }
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  if (-not $ownerAuth.accessToken) {
    Write-Output 'BACKEND_START_FAILED'
    if (Test-Path $standardOutput) { Get-Content -Tail 100 $standardOutput }
    if (Test-Path $standardError) { Get-Content -Tail 100 $standardError }
  } else {
    Write-Output "BACKEND_READY=True DATABASE=$databaseName"
    try {
      $headers = @{ Authorization = "Bearer $($ownerAuth.accessToken)" }
      $context = Invoke-RestMethod -Uri "$apiRoot/management/context" -Headers $headers -TimeoutSec 10
      if ($context.activePropertyId) {
        $env:LUXESTAY_E2E_PROPERTY_ID = $context.activePropertyId.ToString()
      }

      $adminAuth = Invoke-Login $apiRoot $env:LUXESTAY_E2E_ADMIN_USERNAME $env:LUXESTAY_E2E_ADMIN_PASSWORD
      $adminHeaders = @{ Authorization = "Bearer $($adminAuth.accessToken)" }
      $allProperties = @(Invoke-RestMethod -Uri "$apiRoot/v1/hotels" -Headers $adminHeaders -TimeoutSec 10)
      $assignedIds = @($context.properties | ForEach-Object { $_.id.ToString() })
      $foreignProperty = $allProperties | Where-Object { $assignedIds -notcontains $_.id.ToString() } | Select-Object -First 1
      if ($foreignProperty) {
        $env:LUXESTAY_E2E_OTHER_PROPERTY_ID = $foreignProperty.id.ToString()
      }
    } catch {
      Write-Output "PROPERTY_SCOPE_FIXTURE=PARTIAL MESSAGE=$($_.Exception.Message)"
    }

    Push-Location $frontendRoot
    try {
      & $playwright `
        test `
        integrated-stay-lifecycle.spec.ts `
        real-environment-smoke.spec.ts `
        ui-real-flow-audit.spec.ts `
        --config=playwright.authenticated-audit.config.ts `
        --project=chromium `
        "--output=$outputDirectory" `
        --trace=off `
        --retries=0 `
        --workers=1 `
        --reporter=line
      $testExitCode = $LASTEXITCODE
    } finally {
      Pop-Location
    }
  }
} finally {
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
