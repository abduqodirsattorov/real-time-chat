# Nova Chat & Call Platform — Integration Test Runner
# Usage:
#   .\tests\run-tests.ps1               # all tests
#   .\tests\run-tests.ps1 -Suite operator
#   .\tests\run-tests.ps1 -Suite multitenancy
#   .\tests\run-tests.ps1 -Suite transactions
#   .\tests\run-tests.ps1 -Suite auth
#   .\tests\run-tests.ps1 -Suite chat
#   .\tests\run-tests.ps1 -Suite call
#
# Requirements: docker compose up -d && operator-panel not required (HTTP only)

param(
    [string]$Suite = "all",
    [string]$BaseUrl = "http://localhost:80/api/v1",
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"
$ProjectDir = "C:\Users\abduq\OneDrive\Documents\real-time-chat"
$IntegrationDir = "$ProjectDir\tests\integration"

function Write-Color($msg, $color) { Write-Host $msg -ForegroundColor $color }
function Write-Section($msg) { Write-Color "`n=== $msg ===" "Cyan" }
function Write-Ok($msg)      { Write-Color "  [PASS] $msg" "Green" }
function Write-Fail($msg)    { Write-Color "  [FAIL] $msg" "Red" }
function Write-Info($msg)    { Write-Color "  [INFO] $msg" "Yellow" }

# ── Pre-flight: check services ────────────────────────────────────────────────

Write-Section "Pre-flight checks"

# Check docker
try {
    $null = docker compose ps --quiet 2>$null
} catch {
    Write-Fail "docker compose is not available. Make sure Docker Desktop is running."
    exit 1
}

# Check HTTP gateway
try {
    $resp = Invoke-WebRequest -Uri "http://localhost:80/api/v1/auth/me" -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
    Write-Ok "Gateway reachable"
} catch {
    Write-Fail "Cannot reach http://localhost:80 — run: docker compose up -d"
    exit 1
}

# Check npm in integration dir
if (-not (Test-Path "$IntegrationDir\node_modules")) {
    Write-Info "Installing test dependencies..."
    Push-Location $IntegrationDir
    npm install --silent
    Pop-Location
}

Write-Ok "Pre-flight OK"

# ── Map suite names to test file patterns ─────────────────────────────────────

$suiteMap = @{
    "all"          = "*.test.ts"
    "auth"         = "auth.test.ts"
    "chat"         = "chat.test.ts"
    "call"         = "call.test.ts"
    "operator"     = "operator.test.ts"
    "multitenancy" = "multitenancy.test.ts"
    "transactions" = "transactions.test.ts"
    "nova"         = "nova.test.ts"
    "security"     = "security.test.ts"
}

if (-not $suiteMap.ContainsKey($Suite)) {
    Write-Fail "Unknown suite '$Suite'. Valid: $($suiteMap.Keys -join ', ')"
    exit 1
}

$testPattern = $suiteMap[$Suite]
Write-Section "Running suite: $Suite  ($testPattern)"

# ── Run Jest ──────────────────────────────────────────────────────────────────

$env:BASE_URL    = $BaseUrl
$env:PROJECT_DIR = $ProjectDir

Push-Location $IntegrationDir

$jestArgs = @(
    "--testPathPattern", $testPattern.Replace("*", ".*"),
    "--testTimeout", "30000",
    "--forceExit"
)

if ($Verbose) {
    $jestArgs += "--verbose"
}

Write-Color "`nRunning: npx jest $($jestArgs -join ' ')`n" "DarkGray"

npx jest @jestArgs
$exitCode = $LASTEXITCODE

Pop-Location

# ── Summary ───────────────────────────────────────────────────────────────────

Write-Section "Result"
if ($exitCode -eq 0) {
    Write-Ok "ALL TESTS PASSED"
} else {
    Write-Fail "SOME TESTS FAILED (exit code $exitCode)"
    Write-Color "`nHints:" "Yellow"
    Write-Color "  1. docker compose up -d  (services must be running)" "Yellow"
    Write-Color '  2. Admin email must exist: admin@pusher.uz / Admin12345' "Yellow"
    Write-Color '     Create: docker compose exec postgres psql -U nova nova_chat -c "INSERT INTO users (id,email,password_hash,full_name,role,status,locale,metadata) VALUES (uuid_generate_v4(),''admin@pusher.uz'',crypt(''Admin12345'',gen_salt(''bf'',10)),''Super Admin'',''admin'',''active'',''uz'',''{}\'') ON CONFLICT (email) DO NOTHING;"' "Yellow"
    Write-Color "  3. DB migrations must be applied (see docs/TESTING.md)" "Yellow"
}

exit $exitCode
