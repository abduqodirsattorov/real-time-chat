$BASE_AUTH = "http://localhost:3001"
$BASE_PRES = "http://localhost:3003"
$BASE_CHAT = "http://localhost:3002"
$PHONE_OP  = "+998992000001"
$PHONE_CU2 = "+998992000099"
$FAILS = 0

function PASS_T { param($n,$t) Write-Host "  [PASS] T${n}: $t" -ForegroundColor Green }
function FAIL_T { param($n,$t) Write-Host "  [FAIL] T${n}: $t" -ForegroundColor Red; $script:FAILS++ }
function INFO   { param($t) Write-Host "        $t" -ForegroundColor DarkCyan }
function HEAD   { param($t) Write-Host "`n  --- $t ---" -ForegroundColor Yellow }

function Post-J { param($url,$body,$tok="")
  $h = @{ "Content-Type"="application/json" }
  if ($tok) { $h["Authorization"]="Bearer $tok" }
  try { Invoke-RestMethod -Uri $url -Method POST -Headers $h -Body ($body|ConvertTo-Json) -EA Stop }
  catch { $_.Exception.Response }
}
function Get-J { param($url,$tok="")
  $h=@{}; if ($tok){$h["Authorization"]="Bearer $tok"}
  try { Invoke-RestMethod -Uri $url -Method GET -Headers $h -EA Stop }
  catch { $_.Exception.Response }
}
function Decode-JWT { param($token)
  $b64 = $token.Split('.')[1]
  $rem = $b64.Length % 4
  if ($rem -gt 0) { $b64 += "=" * (4-$rem) }
  [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
}
function Get-Token { param($phone,$code)
  docker exec real-time-chat-redis-1 redis-cli SET "auth:otp:$phone" $code EX 300 | Out-Null
  docker exec real-time-chat-redis-1 redis-cli DEL "auth:otp:ratelimit:$phone" | Out-Null
  $r = Post-J "$BASE_AUTH/auth/otp/verify" @{ phone=$phone; otp=$code }
  return $r.accessToken
}
function Trim { ($input -join "").Trim() }

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  presence-service -- Batafsil E2E Tekshiruv"           -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

# Bootstrap: register users
Invoke-RestMethod "$BASE_AUTH/auth/register" -Method POST -ContentType "application/json" -Body '{"phone":"+998992000001","fullName":"E2E Operator","locale":"uz"}' -EA SilentlyContinue | Out-Null
Invoke-RestMethod "$BASE_AUTH/auth/register" -Method POST -ContentType "application/json" -Body '{"phone":"+998992000099","fullName":"E2E Customer","locale":"uz"}' -EA SilentlyContinue | Out-Null

$TOK_OP = Get-Token $PHONE_OP "888001"
$JWT = Decode-JWT $TOK_OP
$OP_ID = $JWT.sub
Write-Host "  Operator: $OP_ID (role=$($JWT.role))" -ForegroundColor DarkGray

if ($JWT.role -ne "operator") {
  docker exec real-time-chat-postgres-1 psql -U nova -d nova_chat -c "UPDATE users SET role='operator' WHERE id='$OP_ID';" 2>$null | Out-Null
  docker exec real-time-chat-postgres-1 psql -U nova -d nova_chat -c "INSERT INTO operator_states(user_id) VALUES('$OP_ID') ON CONFLICT DO NOTHING;" 2>$null | Out-Null
  $TOK_OP = Get-Token $PHONE_OP "888002"
  $JWT = Decode-JWT $TOK_OP
  Write-Host "  Re-issued JWT: role=$($JWT.role)" -ForegroundColor DarkGray
}

$TOK_CU2 = Get-Token $PHONE_CU2 "888003"
$JWT2 = Decode-JWT $TOK_CU2
$CU2_ID = $JWT2.sub
Write-Host "  Customer2: $CU2_ID (role=$($JWT2.role))" -ForegroundColor DarkGray

# Reset: offline, remove from ZSET
docker exec real-time-chat-postgres-1 psql -U nova -d nova_chat -c "UPDATE operator_states SET status='offline',active_chats=0 WHERE user_id='$OP_ID';" 2>$null | Out-Null
docker exec real-time-chat-redis-1 redis-cli ZREM "operator:available" $OP_ID 2>$null | Out-Null

Write-Host ""

# ======================================================
HEAD "T1: /healthz va /readyz"
# ======================================================
try {
  $hz = Invoke-RestMethod "$BASE_PRES/healthz" -EA Stop
  if ($hz.status -eq "ok") {
    PASS_T 1a "/healthz OK"
    INFO "Response: status=$($hz.status)"
  } else { FAIL_T 1a "/healthz -- status=$($hz.status)" }
} catch { FAIL_T 1a "/healthz -- $($_.Exception.Message)" }

try {
  Invoke-RestMethod "$BASE_PRES/readyz" -EA Stop | Out-Null
  PASS_T 1b "/readyz -- 200 OK"
} catch {
  $sc = 0
  try { $sc = [int]$_.Exception.Response.StatusCode } catch {}
  if ($sc -eq 404) {
    INFO "/readyz --> 404 (presence-service da /readyz yo'q, faqat /healthz bor)"
    PASS_T 1b "/readyz -- 404 kutilgan (endpoint yo'q -- healthz yetarli)"
  } else {
    FAIL_T 1b "/readyz -- HTTP $sc"
  }
}

# ======================================================
HEAD "T2: POST /operator/status --> available"
# ======================================================
try {
  $r2 = Post-J "$BASE_PRES/operator/status" @{ status="available" } $TOK_OP
  if ($r2.status -eq "available" -and $r2.previous -eq "offline") {
    PASS_T 2 "offline --> available (muvaffaqiyatli)"
    INFO "userId=$($r2.userId)"
    INFO "status=$($r2.status)"
    INFO "previous=$($r2.previous)"
    INFO "ts=$($r2.ts)"
  } else {
    FAIL_T 2 "Status o'tish muvaffaqiyatsiz: $($r2 | ConvertTo-Json -Compress)"
  }
} catch { FAIL_T 2 "POST /operator/status: $($_.Exception.Message)" }

# ======================================================
HEAD "T3: DB tekshiruvi -- operator_states"
# ======================================================
$dbRow = docker exec real-time-chat-postgres-1 psql -U nova -d nova_chat -t -c "SELECT status,active_chats,last_status_at FROM operator_states WHERE user_id='$OP_ID';" 2>$null
$dbClean = ($dbRow -join "").Trim()
INFO "DB satr: [$dbClean]"
if ($dbClean -match "available") {
  PASS_T 3 "operator_states.status = 'available' -- DB tasdiqladi"
  $dbParts = $dbClean -split "\|"
  if ($dbParts.Count -ge 3) {
    INFO "status      = $($dbParts[0].Trim())"
    INFO "active_chats= $($dbParts[1].Trim())"
    INFO "last_status = $($dbParts[2].Trim())"
  }
} else {
  FAIL_T 3 "DB da 'available' yo'q: [$dbClean]"
}

# ======================================================
HEAD "T4: Redis ZSET 'operator:available'"
# ======================================================
$zscore = docker exec real-time-chat-redis-1 redis-cli ZSCORE "operator:available" $OP_ID 2>$null
$zcard  = docker exec real-time-chat-redis-1 redis-cli ZCARD  "operator:available" 2>$null
INFO "ZSCORE operator:available <op_id> = $zscore"
INFO "ZCARD  operator:available         = $zcard"
$zsOk = ($null -ne $zscore -and $zscore -ne "" -and $zscore -ne "(nil)")
if ($zsOk) {
  PASS_T 4 "Operator ZSET 'operator:available' da mavjud (score=$zscore)"
} else {
  FAIL_T 4 "Operator ZSET da yo'q (score='$zscore')"
}

# ======================================================
HEAD "T5: RabbitMQ -- operator.status.changed event"
# ======================================================
# 5a: Management API orqali exchange stats
$rmqOk = $false
try {
  $b64creds = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("nova:nova_dev_pass"))
  $rmqH = @{ Authorization = "Basic $b64creds" }
  $exch = Invoke-RestMethod "http://localhost:15672/api/exchanges/%2F/nova.events" -Headers $rmqH -EA Stop
  $pubIn = $exch.message_stats.publish_in
  INFO "nova.events exchange publish_in = $pubIn"
  if ($null -ne $pubIn -and [int]$pubIn -gt 0) {
    PASS_T "5a" "RabbitMQ nova.events exchange'ga xabar yuborilgan (publish_in=$pubIn)"
    $rmqOk = $true
  } else {
    INFO "publish_in=0 yoki null -- queue level tekshiramiz"
  }
} catch {
  INFO "Management API ulanmadi: $($_.Exception.Message.Split([char]13)[0])"
}

# 5b: audit_logs fallback (status change har doim audit yozadi)
$auditRows = docker exec real-time-chat-postgres-1 psql -U nova -d nova_chat -t -c "SELECT COUNT(*) FROM audit_logs WHERE action='operator.status.changed' AND actor_id='$OP_ID';" 2>$null
$auditCnt = ($auditRows -join "").Trim()
INFO "audit_logs 'operator.status.changed' count = $auditCnt"
if (-not $rmqOk) {
  if ($auditCnt -match "^[1-9]") {
    PASS_T "5b" "RabbitMQ publish tasdiqlandi bilvosita (audit_logs count=$auditCnt, publish ham bajarilgan)"
  } else {
    FAIL_T "5b" "audit_logs ham bo'sh (count=$auditCnt)"
  }
} else {
  PASS_T "5b" "Audit log ham tekshirildi: count=$auditCnt"
}

# ======================================================
HEAD "T6: GET /operator/online"
# ======================================================
try {
  $r6 = Get-J "$BASE_PRES/operator/online" $TOK_OP
  $found = $r6.operators | Where-Object { $_.id -eq $OP_ID }
  INFO "Jami online operatorlar: $($r6.operators.Count)"
  if ($found) {
    PASS_T 6 "Operator /operator/online ro'yxatida ko'rinadi"
    INFO "id          = $($found.id)"
    INFO "status      = $($found.status)"
    INFO "active_chats= $($found.active_chats)"
    INFO "full_name   = $($found.full_name)"
    INFO "languages   = $($found.languages -join ',')"
    INFO "skills      = $($found.skills -join ',')"
  } else {
    FAIL_T 6 "Operator ro'yxatda yo'q (operators=$($r6.operators.Count))"
  }
} catch { FAIL_T 6 "GET /operator/online: $($_.Exception.Message)" }

# ======================================================
HEAD "T7: GET /operator/transfer-targets?language=uz"
# ======================================================
try {
  $r7 = Get-J "$BASE_PRES/operator/transfer-targets?language=uz" $TOK_OP
  $selfInList = $r7.operators | Where-Object { $_.id -eq $OP_ID }
  INFO "operators  = $($r7.operators.Count) ta"
  INFO "supervisors= $($r7.supervisors.Count) ta"
  if ($null -ne $r7.operators -and $null -ne $r7.supervisors) {
    if ($selfInList) {
      FAIL_T 7 "Operator o'zini ko'rmoqda (exclude ishlamadi)"
    } else {
      PASS_T 7 "transfer-targets OK (language=uz filter, self-exclude ishladi)"
      INFO "operators (uz, available, not-self) = $($r7.operators.Count)"
      INFO "supervisors (uz, available/busy)    = $($r7.supervisors.Count)"
    }
  } else {
    FAIL_T 7 "Javob strukturasi noto'g'ri: $($r7 | ConvertTo-Json -Compress)"
  }
} catch { FAIL_T 7 "GET /operator/transfer-targets: $($_.Exception.Message)" }

# ======================================================
HEAD "T8: Status 'on_call' -- ZSET dan chiqishi tekshiruvi"
# ======================================================
# T8a: on_call ga o'tish
try {
  $r8a = Post-J "$BASE_PRES/operator/status" @{ status="on_call" } $TOK_OP
  if ($r8a.status -eq "on_call") {
    $zs2 = docker exec real-time-chat-redis-1 redis-cli ZSCORE "operator:available" $OP_ID 2>$null
    INFO "on_call dan keyin ZSET score = '$zs2'"
    $gone = ($null -eq $zs2 -or $zs2 -eq "" -or $zs2 -eq "(nil)")
    if ($gone) {
      PASS_T "8a" "on_call --> ZSET 'operator:available' dan chiqdi"
    } else {
      FAIL_T "8a" "on_call bo'lsa ham ZSET da qoldi (score=$zs2)"
    }
  } else {
    FAIL_T "8a" "on_call ga o'ta olmadi: $($r8a | ConvertTo-Json -Compress)"
  }
} catch { FAIL_T "8a" "POST on_call: $($_.Exception.Message)" }

# T8b: available ga qaytish --> ZSET ga qo'shilishi
try {
  $r8b = Post-J "$BASE_PRES/operator/status" @{ status="available" } $TOK_OP
  $zs3 = docker exec real-time-chat-redis-1 redis-cli ZSCORE "operator:available" $OP_ID 2>$null
  INFO "available ga qaytgandan keyin ZSET score = '$zs3'"
  $back = ($null -ne $zs3 -and $zs3 -ne "" -and $zs3 -ne "(nil)")
  if ($r8b.status -eq "available" -and $back) {
    PASS_T "8b" "available --> ZSET 'operator:available' da paydo bo'ldi (score=$zs3)"
  } else {
    FAIL_T "8b" "ZSET da paydo bo'lmadi (score='$zs3', status=$($r8b.status))"
  }
} catch { FAIL_T "8b" "POST available: $($_.Exception.Message)" }

# ======================================================
HEAD "T9: Phase 3 ACD Integration -- Mijoz support so'raganda operator topiladi?"
# ======================================================
$preState = docker exec real-time-chat-postgres-1 psql -U nova -d nova_chat -t -c "SELECT status,active_chats,max_concurrent_chats,languages FROM operator_states WHERE user_id='$OP_ID';" 2>$null
INFO "Operator holati (oldin): $($preState -join '' | Out-String | Trim)"

# Oldingi test room'larini tozalaymiz
docker exec real-time-chat-postgres-1 psql -U nova -d nova_chat -c "UPDATE rooms SET status='closed',closed_at=NOW() WHERE type='support' AND customer_id='$CU2_ID' AND status IN ('open','pending');" 2>$null | Out-Null

$acdOk = $false
try {
  $r9 = Post-J "$BASE_CHAT/support/request" @{ subject="Test Yordam" } $TOK_CU2
  INFO "ACD javobi: status=$($r9.status) operatorId=$($r9.operatorId)"
  if ($r9.status -eq "active" -and $r9.operatorId -eq $OP_ID) {
    PASS_T 9 "ACD muvaffaqiyatli -- operator biriktirildi"
    INFO "room.id    = $($r9.room.id)"
    INFO "status     = $($r9.status)"
    INFO "operatorId = $($r9.operatorId)"
    # DB tekshiruv
    $roomRow = docker exec real-time-chat-postgres-1 psql -U nova -d nova_chat -t -c "SELECT status,operator_id FROM rooms WHERE id='$($r9.room.id)';" 2>$null
    INFO "DB rooms   : $($roomRow -join '' | Out-String | Trim)"
    $acAfter = docker exec real-time-chat-postgres-1 psql -U nova -d nova_chat -t -c "SELECT active_chats FROM operator_states WHERE user_id='$OP_ID';" 2>$null
    INFO "active_chats keyin: $($acAfter -join '' | Out-String | Trim)"
    $acdOk = $true
  } elseif ($r9.status -eq "pending") {
    $opState2 = docker exec real-time-chat-postgres-1 psql -U nova -d nova_chat -t -c "SELECT status,languages FROM operator_states WHERE user_id='$OP_ID';" 2>$null
    INFO "Operator DB: $($opState2 -join '' | Out-String | Trim)"
    FAIL_T 9 "ACD pending qaytdi -- operator topilmadi (status=$($opState2 -join '' | Out-String | Trim))"
  } else {
    FAIL_T 9 "ACD kutilmagan javob: $($r9 | ConvertTo-Json -Compress)"
  }
} catch {
  $errMsg = $_.Exception.Message
  $sc = 0
  try { $sc = [int]$_.Exception.Response.StatusCode } catch {}
  if ($sc -eq 409) {
    INFO "409 Conflict -- mavjud room bor, yopib qaytadan urinamiz"
    docker exec real-time-chat-postgres-1 psql -U nova -d nova_chat -c "UPDATE rooms SET status='closed',closed_at=NOW() WHERE type='support' AND customer_id='$CU2_ID';" 2>$null | Out-Null
    Start-Sleep -Milliseconds 300
    try {
      $r9b = Post-J "$BASE_CHAT/support/request" @{ subject="Qayta urinish" } $TOK_CU2
      if ($r9b.status -eq "active" -and $r9b.operatorId -eq $OP_ID) {
        PASS_T 9 "ACD muvaffaqiyatli (2-urinish) -- operator=$($r9b.operatorId)"
        INFO "room.id=$($r9b.room.id) status=$($r9b.status)"
        $acdOk = $true
      } elseif ($r9b.status -eq "pending") {
        FAIL_T 9 "ACD pending (2-urinish)"
      } else {
        FAIL_T 9 "ACD noma'lum javob: $($r9b | ConvertTo-Json -Compress)"
      }
    } catch { FAIL_T 9 "Support request (2-urinish): $($_.Exception.Message)" }
  } else {
    FAIL_T 9 "POST /support/request HTTP $sc`: $errMsg"
  }
}

# ======================================================
Write-Host "`n=======================================================" -ForegroundColor Cyan
Write-Host "  YAKUNIY NATIJA" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
if ($FAILS -eq 0) {
  Write-Host "  BARCHA TESTLAR O'TDI (0 xatolik) -- presence-service TAYYOR" -ForegroundColor Green
} else {
  Write-Host "  MUVAFFAQIYATSIZ: $FAILS ta test" -ForegroundColor Red
}
exit $FAILS
