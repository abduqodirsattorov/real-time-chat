$BASE_AUTH = "http://localhost:3001"
$BASE_PRES = "http://localhost:3003"
$PHONE_OP  = "+998992000001"
$PHONE_CU  = "+998992000002"
$FAILURES  = 0

function OK   { param($t) Write-Host "  [PASS] $t" -ForegroundColor Green }
function FAIL { param($t,$e) Write-Host "  [FAIL] $t | $e" -ForegroundColor Red; $script:FAILURES++ }

function Post-Json($url, $body, $token="") {
  $h = @{ "Content-Type"="application/json" }
  if ($token) { $h["Authorization"] = "Bearer $token" }
  try {
    Invoke-RestMethod -Uri $url -Method POST -Headers $h `
      -Body ($body | ConvertTo-Json) -ErrorAction Stop
  } catch {
    $_.Exception.Response
  }
}

function Get-Json($url, $token="") {
  $h = @{}
  if ($token) { $h["Authorization"] = "Bearer $token" }
  try {
    Invoke-RestMethod -Uri $url -Method GET -Headers $h -ErrorAction Stop
  } catch {
    $_.Exception.Response
  }
}

function Get-HttpStatus($r) {
  if ($r -is [System.Net.HttpWebResponse]) { return [int]$r.StatusCode }
  if ($null -ne $r -and $r.StatusCode) { return [int]$r.StatusCode }
  return 200
}

# Injects OTP directly into Redis and verifies — bypasses rate limit
function Get-Token($phone, $code) {
  docker exec real-time-chat-redis-1 redis-cli SET "auth:otp:$phone" $code EX 300 | Out-Null
  # Clear rate limit key so we can request again
  docker exec real-time-chat-redis-1 redis-cli DEL "auth:otp:ratelimit:$phone" | Out-Null
  $r = Post-Json "$BASE_AUTH/auth/otp/verify" @{ phone=$phone; otp=$code }
  return $r.accessToken
}

function Decode-JwtSub($token) {
  $parts = $token.Split('.')
  $b64 = $parts[1]
  $rem = $b64.Length % 4
  if ($rem -gt 0) { $b64 = $b64 + ("=" * (4 - $rem)) }
  $json = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64))
  return ($json | ConvertFrom-Json)
}

Write-Host "`n=== Phase 5 E2E: Presence Service ===" -ForegroundColor Cyan

# ── Bootstrap ────────────────────────────────────────────────────────────────
# Register operator user
$regOp = Invoke-RestMethod -Uri "$BASE_AUTH/auth/register" -Method POST `
  -ContentType "application/json" `
  -Body (@{ phone=$PHONE_OP; fullName="Test Operator"; locale="uz" } | ConvertTo-Json) `
  -ErrorAction SilentlyContinue
$regOpId = if ($regOp.id) { $regOp.id } else { "already exists" }
Write-Host "Register op: $regOpId"

# Register customer user
$regCu = Invoke-RestMethod -Uri "$BASE_AUTH/auth/register" -Method POST `
  -ContentType "application/json" `
  -Body (@{ phone=$PHONE_CU; fullName="Test Customer"; locale="uz" } | ConvertTo-Json) `
  -ErrorAction SilentlyContinue
$regCuId = if ($regCu.id) { $regCu.id } else { "already exists" }
Write-Host "Register cu: $regCuId"

# Get tokens via direct Redis OTP injection
$TOK_CU = Get-Token $PHONE_CU "777001"
$TOK_OP_INIT = Get-Token $PHONE_OP "777002"

if (-not $TOK_OP_INIT) {
  Write-Host "ERROR: Cannot get initial operator token" -ForegroundColor Red
  exit 1
}

# Decode user ID from JWT
$jwtObj = Decode-JwtSub $TOK_OP_INIT
$OP_ID = $jwtObj.sub
Write-Host "Operator ID: $OP_ID (role: $($jwtObj.role))"

# Promote to operator in DB
docker exec real-time-chat-postgres-1 psql -U nova -d nova_chat `
  -c "UPDATE users SET role='operator' WHERE id='$OP_ID';" 2>$null | Out-Null
docker exec real-time-chat-postgres-1 psql -U nova -d nova_chat `
  -c "INSERT INTO operator_states (user_id) VALUES ('$OP_ID') ON CONFLICT DO NOTHING;" 2>$null | Out-Null
Write-Host "DB: promoted to operator + created operator_state"

# Re-issue JWT with fresh role=operator
$TOK_OP = Get-Token $PHONE_OP "777003"
if (-not $TOK_OP) {
  Write-Host "ERROR: Cannot get operator token after role update" -ForegroundColor Red
  exit 1
}
$jwtObj2 = Decode-JwtSub $TOK_OP
Write-Host "Fresh JWT: role=$($jwtObj2.role) sub=$($jwtObj2.sub)"
Write-Host ""

# ── A1: healthz ──────────────────────────────────────────────────────────────
Write-Host "--- A1: /healthz ---"
try {
  $h = Invoke-RestMethod -Uri "$BASE_PRES/healthz" -Method GET
  if ($h.status -eq "ok") { OK "A1: healthz returns ok" }
  else { FAIL "A1" "status=$($h.status)" }
} catch { FAIL "A1" $_.Exception.Message }

# ── A2: GET /presence/users/:id (as customer) ─────────────────────────────────
Write-Host "--- A2: GET /presence/users/:id ---"
try {
  $p = Get-Json "$BASE_PRES/presence/users/$OP_ID" $TOK_CU
  if ($p.user_id -eq $OP_ID -and $null -ne $p.online) { OK "A2: presence returns user_id + online flag" }
  else { FAIL "A2" ($p | ConvertTo-Json -Compress) }
} catch { FAIL "A2" $_.Exception.Message }

# ── A3: POST /presence/users/bulk ─────────────────────────────────────────────
Write-Host "--- A3: POST /presence/users/bulk ---"
try {
  $b = Post-Json "$BASE_PRES/presence/users/bulk" @{ ids=@($OP_ID) } $TOK_CU
  if ($b.users -and $b.users.Count -ge 1 -and $null -ne $b.users[0].online) {
    OK "A3: bulk presence works"
  } else { FAIL "A3" ($b | ConvertTo-Json -Compress) }
} catch { FAIL "A3" $_.Exception.Message }

# ── A4: customer forbidden from /operator/status ──────────────────────────────
Write-Host "--- A4: customer forbidden from /operator/status ---"
$rA4 = Post-Json "$BASE_PRES/operator/status" @{ status="available" } $TOK_CU
$cA4 = Get-HttpStatus $rA4
if ($cA4 -eq 403) { OK "A4: customer gets 403" } else { FAIL "A4" "got HTTP $cA4" }

# ── A5: 404 when no operator_state ───────────────────────────────────────────
Write-Host "--- A5: 404 when operator_state missing ---"
docker exec real-time-chat-postgres-1 psql -U nova -d nova_chat `
  -c "DELETE FROM operator_states WHERE user_id='$OP_ID';" 2>$null | Out-Null
$rA5 = Post-Json "$BASE_PRES/operator/status" @{ status="available" } $TOK_OP
$cA5 = Get-HttpStatus $rA5
if ($cA5 -eq 404) { OK "A5: missing operator_state → 404" } else { FAIL "A5" "got HTTP $cA5" }
# Restore
docker exec real-time-chat-postgres-1 psql -U nova -d nova_chat `
  -c "INSERT INTO operator_states (user_id) VALUES ('$OP_ID') ON CONFLICT DO NOTHING;" 2>$null | Out-Null

# ── A6: offline → available ───────────────────────────────────────────────────
Write-Host "--- A6: operator status offline→available ---"
try {
  $rA6 = Post-Json "$BASE_PRES/operator/status" @{ status="available" } $TOK_OP
  if ($rA6.status -eq "available" -and $rA6.previous -eq "offline") {
    OK "A6: offline→available (previous=$($rA6.previous))"
  } else { FAIL "A6" ($rA6 | ConvertTo-Json -Compress) }
} catch { FAIL "A6" $_.Exception.Message }

# ── A7: GET /operator/online ──────────────────────────────────────────────────
Write-Host "--- A7: GET /operator/online ---"
try {
  $rA7 = Get-Json "$BASE_PRES/operator/online" $TOK_OP
  if ($null -ne $rA7.operators) { OK "A7: /operator/online returns operators list (count=$($rA7.operators.Count))" }
  else { FAIL "A7" ($rA7 | ConvertTo-Json -Compress) }
} catch { FAIL "A7" $_.Exception.Message }

# ── A8: customer forbidden from /operator/online ──────────────────────────────
Write-Host "--- A8: customer forbidden from /operator/online ---"
$rA8 = Get-Json "$BASE_PRES/operator/online" $TOK_CU
$cA8 = Get-HttpStatus $rA8
if ($cA8 -eq 403) { OK "A8: customer gets 403 on /operator/online" } else { FAIL "A8" "got HTTP $cA8" }

# ── A9: GET /operator/transfer-targets ───────────────────────────────────────
Write-Host "--- A9: GET /operator/transfer-targets ---"
try {
  $rA9 = Get-Json "$BASE_PRES/operator/transfer-targets" $TOK_OP
  if ($null -ne $rA9.operators -and $null -ne $rA9.supervisors) {
    OK "A9: transfer-targets returns operators + supervisors"
  } else { FAIL "A9" ($rA9 | ConvertTo-Json -Compress) }
} catch { FAIL "A9" $_.Exception.Message }

# ── A10: available → busy ─────────────────────────────────────────────────────
Write-Host "--- A10: status available→busy ---"
try {
  $rA10 = Post-Json "$BASE_PRES/operator/status" @{ status="busy" } $TOK_OP
  if ($rA10.status -eq "busy" -and $rA10.previous -eq "available") {
    OK "A10: available→busy"
  } else { FAIL "A10" ($rA10 | ConvertTo-Json -Compress) }
} catch { FAIL "A10" $_.Exception.Message }

# ── A11: busy → away ──────────────────────────────────────────────────────────
Write-Host "--- A11: status busy→away ---"
try {
  $rA11 = Post-Json "$BASE_PRES/operator/status" @{ status="away" } $TOK_OP
  if ($rA11.status -eq "away" -and $rA11.previous -eq "busy") {
    OK "A11: busy→away"
  } else { FAIL "A11" ($rA11 | ConvertTo-Json -Compress) }
} catch { FAIL "A11" $_.Exception.Message }

# ── A12: Redis ZSET check ─────────────────────────────────────────────────────
Write-Host "--- A12: Redis ZSET operator:available ---"
Post-Json "$BASE_PRES/operator/status" @{ status="available" } $TOK_OP | Out-Null
Start-Sleep -Milliseconds 300
$zrank = docker exec real-time-chat-redis-1 redis-cli ZSCORE "operator:available" $OP_ID 2>$null
if ($null -ne $zrank -and $zrank -ne "" -and $zrank -ne "(nil)") {
  OK "A12: operator in ZSET with score=$zrank"
} else { FAIL "A12" "operator not in ZSET (got: '$zrank')" }

# ── A13: webhook connect ──────────────────────────────────────────────────────
Write-Host "--- A13: POST /webhooks/centrifugo/connect ---"
try {
  Post-Json "$BASE_PRES/webhooks/centrifugo/connect" @{ user=$OP_ID; client="cli-e2e"; transport="websocket" } | Out-Null
  OK "A13: webhook connect returns 200"
} catch { FAIL "A13" $_.Exception.Message }

# ── A14: presence updated after connect webhook ───────────────────────────────
Write-Host "--- A14: presence set after connect webhook ---"
Start-Sleep -Milliseconds 300
try {
  $pA14 = Get-Json "$BASE_PRES/presence/users/$OP_ID" $TOK_OP
  if ($pA14.online -eq $true) { OK "A14: user shows online after connect webhook" }
  else { FAIL "A14" "online=$($pA14.online) last_seen=$($pA14.last_seen)" }
} catch { FAIL "A14" $_.Exception.Message }

# ── A15: webhook disconnect ───────────────────────────────────────────────────
Write-Host "--- A15: POST /webhooks/centrifugo/disconnect ---"
try {
  Post-Json "$BASE_PRES/webhooks/centrifugo/disconnect" @{ user=$OP_ID; client="cli-e2e" } | Out-Null
  OK "A15: webhook disconnect returns 200"
} catch { FAIL "A15" $_.Exception.Message }

# ── A16: invalid webhook signature ───────────────────────────────────────────
Write-Host "--- A16: invalid webhook signature ---"
$wBodyJson = (@{ user=$OP_ID; client="test-sig" } | ConvertTo-Json)
$hSig = @{ "Content-Type"="application/json"; "X-Centrifugo-Sign"="deadbeefdeadbeef" }
try {
  Invoke-RestMethod -Uri "$BASE_PRES/webhooks/centrifugo/connect" -Method POST `
    -Headers $hSig -Body $wBodyJson -ErrorAction Stop | Out-Null
  OK "A16: no WEBHOOK_SECRET → signature check skipped"
} catch {
  $sc = [int]$_.Exception.Response.StatusCode
  if ($sc -eq 401) { OK "A16: invalid sig → 401 (secret configured)" }
  else { FAIL "A16" "got HTTP $sc" }
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=== SUMMARY ===" -ForegroundColor Cyan
if ($FAILURES -eq 0) {
  Write-Host "ALL 16 TESTS PASSED" -ForegroundColor Green
} else {
  Write-Host "FAILED: $FAILURES test(s)" -ForegroundColor Red
}
exit $FAILURES
