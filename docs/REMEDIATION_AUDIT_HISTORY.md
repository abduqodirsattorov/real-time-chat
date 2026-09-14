# Historical Remediation Audit

> Archived on 2026-09-14. This document preserves earlier findings and sequencing, including
> statements that have since been superseded. Do not use it as the active backlog or a current
> security verdict. See [the current remediation plan](REMEDIATION_PLAN.md).

> **Implementation update (2026-09-14):** See [P1 remediation and verification](P1_REMEDIATION.md)
> for current changes, passing checks and remaining call/recording work. The historical audit below
> is retained as evidence; its individual findings are not a current completion checklist.

This plan is prioritized from production-blocking security issues to longer-term maintainability work.

> **Revision note.** The original plan (P0–P5 below) was reviewed against the code and holds up:
> every item in it was confirmed. Items marked **[+]** were added during that review; each carries a
> file:line reference so it can be verified without re-deriving the analysis. Two original items were
> re-prioritized after the code confirmed they are more severe than first written (marked **[↑]**).

---

# Re-Review — verification pass after remediation

Scope: working tree at `e545d5c`, clean. Every item below was re-checked against source, not against
`docs/STATUS.md`. Verdict: **substantial, real progress — roughly two thirds of the plan is genuinely
closed** — but four issues are marked done in `STATUS.md` while still being exploitable, and two of the
fixes introduced new critical holes of their own.

## A. Verified fixed

| Item | Evidence |
|---|---|
| P0.1 Centrifugo subscribe | `infra/centrifugo/config.json` — `allow_subscribe_for_client: false`, `proxy_subscribe: true`, `proxy_subscribe_endpoint → chat-service`; real authorization in `services/chat/src/centrifugo/centrifugo.controller.ts` (room membership + `operatorProduct`) |
| P0.4 / 4a room scoping | `services/chat/src/rooms/rooms.service.ts:38-53,114-118,183-188` — `operatorProduct` is now checked on `list`, `searchUser`, `getOne` |
| P0.4b operator product switch | `services/presence/src/operator/operator.service.ts:189-197` — membership enforced, denial logged |
| P0.6 OTP entropy / brute force | `auth.service.ts:430` `randomInt`; `:90-96` 5-attempt cap that also burns the OTP; email login lockout at `:127-152` |
| P0.6 revocation | `admin.service.ts:128-136,166-176,185-195` clears sessions; `common/guards/account-status.ts` re-checks DB status per request with a 10 s cache — this is now a proper full-mesh revocation |
| P0.7 rate limiting / headers | `services/*/src/common/http-hardening.ts` applied in all 8 `main.ts` |
| P0.8 media IDOR | `media.service.ts:184-218` `verifyAttachmentAccess` — uploader or active room member (see B.3 for the remaining hole) |
| P1.2 frontend/backend call routes | `operator-panel/src/api/calls.ts` now matches `calls.controller.ts` exactly, including `{hold}`, `{type,toOperatorId}`, `{recordingId}`; a legacy `POST /livekit/token` alias was kept |
| P1.5 refresh stampede | `operator-panel/src/api/client.ts:16` single-flight `refreshPromise` |
| P2.1 schema ownership | `shared/prisma/schema.prisma` as master + `prisma/migrations/0_init` per service + CI drift gate |
| P2.2 DTO/enum drift | `rooms/dto/*.ts` now use `open/pending/closed/bot_handling` and `direct/support/transfer_consult` |
| P2.4 strict validation | `forbidNonWhitelisted: true` in auth, chat, call, presence, media, recording |
| P2.7 ACD claim leak | `calls.service.ts:138,200` — claim released on answer and hangup |
| P3.4 host port exposure | every internal port is now `127.0.0.1`-bound in `docker-compose.yml` |
| P4.2 CI | `.github/workflows/ci.yml` — schema sync, per-service unit tests, live DB drift diff, integration + authorization suites, Prometheus target liveness |
| P4.3 negative tests | `tests/integration/authorization.test.ts` + `security.test.ts` — a real role × endpoint × tenant matrix with ~41 deny assertions, and setup that fails loudly instead of skipping |

## B. Regressions and new critical findings introduced by the fixes

These did not exist in the original review; they are properties of the remediation itself.

1. **[NEW-P0] Nova SSO accepts the old, unsigned-role signature.**
   `services/auth/src/auth/auth.service.ts:359-369` computes the hardened HMAC over
   `novaUserId:timestamp:novaRole:locale` — and then computes `legacyExpected` over
   `novaUserId:timestamp` and accepts **either**. The escalation path the fix was written to close is
   still fully open: replay any legacy signature within the 300 s window with `novaRole: "admin"` and
   `auth.service.ts:392` writes `role: admin` onto the existing account. Delete the legacy branch, or
   gate it behind an explicit, time-boxed `NOVA_SSO_ALLOW_LEGACY_SIG` flag that defaults to off.

2. **[NEW-P0] The internal service key has a hardcoded default that grants admin.**
   `services/recording/src/common/guards/internal-auth.guard.ts:8` and its caller
   `services/call/src/calls/calls.service.ts:459` both fall back to the literal
   `'internal_service_default_secret_key'`. If `INTERNAL_SERVICE_KEY` is unset, anyone who has seen this
   repository can send `x-internal-service-key: internal_service_default_secret_key` and the guard sets
   `req.user = { sub: 'service_call', role: 'admin' }` — full admin identity on `POST /recordings/start`
   and `/recordings/stop`, and the recording router is publicly reachable through Traefik. This replaced
   a 401 (P1.1) with an authentication bypass. Fail startup when the variable is missing; never default it.

3. **[NEW-P0] `isStaff` short-circuits replaced the old `isOperator` short-circuits.**
   The room path got a real `operatorProduct` check; four other paths kept the old shape, so the same
   cross-tenant class of bug survives in a new location:
   - `calls.service.ts:571-576` `getLivekitToken` — `isParticipant || isStaff`. **An operator of tenant A
     can obtain a LiveKit join token for a live call of tenant B and listen to it.**
   - `calls.service.ts:556-559` `getCall` — any staff reads any call, including `transfers` and `recordings`.
   - `calls.service.ts:518-521` `getCallQueue` — the role check was added, but there is still **no product
     filter**: `where: { direction: 'inbound', status: 'queued' }`, and `:534` attaches caller `fullName`/`phone`.
     Cross-tenant PII, unchanged.
   - `media.service.ts:185-186` `verifyAttachmentAccess` — `if (isStaff) return;` before any check.
     Any operator can still read any tenant's attachment and any call recording in the bucket.
   - `rooms.service.ts:254-255` `assertMember` — `isGlobalOperator` returns the room with no product
     check, and it gates `messages.list/create/markRead/typing`. **Any operator can still read and post in
     any tenant's conversation by room id**, even though `rooms.getOne` now blocks reading the room itself.
   - Same shape in the subscribe proxy: `centrifugo.controller.ts:141-144` allows a call channel to any
     staff member, and `:122-127` allows `presence:operators` to any staff with no product scope.
   All five are the P-1.2 root cause reappearing. Extract the product check into one helper and call it
   from every branch, or the next fix round will reintroduce it again.

4. **[NEW-P1] The subscribe proxy fails open on unrecognized channels.**
   `centrifugo.controller.ts:154` ends with `return { result: {} }` — any channel that does not match the
   four handled prefixes is **allowed**. Make the default `return { error: … }` and enumerate what is permitted.

5. **[NEW-P2] `answerCall` still broadcasts a LiveKit credential.**
   `calls.service.ts:143-150` publishes `callerToken` into `call:${callId}`. Now that subscribe is proxied
   this is no longer world-readable, but combined with B.3 it hands the caller's join token to any staff
   member of any tenant. It is already returned in the HTTP response at `:158-165`; drop it from the publish.

6. **[NEW-P3] `STATUS.md` again asserts work that is not in the code.**
   `docs/STATUS.md:3-20` claims strict authorization on `mute` (there is none — B.7), calls managed in
   `prisma.$transaction` (true only for `initiateCall:55,91`; `executeColdTransfer` and `hangupCall` are
   still non-transactional), product permission checks in media access (absent), and "full payload HMAC"
   for Nova SSO (defeated by B.1). This is the same failure mode the last review flagged. Tie each claim
   to a named passing test or delete the claim.

7. **[STILL OPEN] `muteCall` has no authorization at all.**
   `calls.service.ts:288-293` — no role check, no participation check. Correction to the previous review:
   the LiveKit call passes `user.sub`, so a stranger can only mute *themselves*; the actual impact is
   **event injection** — any authenticated user can publish a forged `call.mute` event into any call's
   channel, and probe call existence. Lower severity than first written, but still unauthenticated-in-effect.

## C. Not fixed — carried forward unchanged

| Item | Status |
|---|---|
| P0.3 `completeWarmTransfer` / `cancelWarmTransfer` | `calls.service.ts:361,382` — still accept `user` and never read it. **Any authenticated user, including a customer, can complete or cancel any operator's warm transfer.** |
| P0.3 `stopRecording` | `calls.service.ts:489` — no role, no participation check |
| P0.3 `recordingConsentAck` | `calls.service.ts:444` — loads the call at `:450` but never authorizes against it |
| P0.3 `POST /presence/users/bulk` | `presence.controller.ts:18` — no role check, while the single-user route at `:13` does pass `user.role`. Presence enumeration for arbitrary id lists |
| P0.5 Centrifugo secrets | `infra/centrifugo/config.json` still hardcodes `token_hmac_secret_key`, `api_key`, `admin_password: "admin"`, `admin_secret`, `allowed_origins: ["*"]`, and `docker-compose.yml:133-135` mounts it read-only with no env override |
| P0.5 Traefik | `dynamic.yml:70-74` `centrifugo-api` on `PathPrefix(/centrifugo)` with only a strip-prefix middleware; `cors` middleware still `accessControlAllowOriginList: ["*"]`; `docker-compose.yml:553` `--api.insecure=true` |
| P0.5 `dev_secret` | 12 sites across bot-gateway, call, media, notification, presence, recording still `process.env.JWT_SECRET ?? 'dev_secret'` — a service started without the env var validates forged tokens |
| P0.6 logout | `auth.controller.ts:76` passes `user.jti` (the **access** jti); `issueTokens:405-419` stores the **refresh** jti. `logout` deletes a key that was never written — the 30-day refresh token stays valid after logout. Unchanged from the last review |
| P0.6 role staleness | `jwt.strategy.ts:23` checks only `sub`/`jti`; `account-status.ts` re-reads status but not `role`. A demoted admin keeps admin for the remaining hour |
| P1.4 webhook signatures | No `rawBody: true` in any `main.ts`, so `req.rawBody` is still always undefined and both controllers HMAC a re-serialized body; `presence/webhooks.controller.ts:47,77` and `chat/centrifugo.controller.ts:44` still use `if (signature && …)` — omit the header and verification is skipped; `verifySignature` returns `true` when the secret is unset; the secret still falls back to `CENTRIFUGO_API_KEY` |
| P2.3 shared modules | `prisma.service.ts` / `redis.service.ts` / guards still copy-pasted per service, now with additional drift (`http-hardening.ts` duplicated 8 times) |
| P2.5 `setTimeout` | `calls.service.ts:425` — unchanged; still lost on restart, still an unguarded async callback |
| P2.6 transactions | `initiateCall` fixed (`:55`, `:91`); `executeColdTransfer` and `hangupCall` still multi-statement |
| P3.1 media hardening | `media.service.ts:106-114` MIME mismatch still logged and accepted; `:117` ClamAV still a stub; `:103` still buffers whole objects |
| P3.3 OTP in logs | `auth.service.ts:82` `console.log(\`[OTP] ${phone}: ${otp}\`)` — unchanged |
| P3.5 / P4.1 images | all Dockerfiles still `npm install` (never `npm ci`), no `USER` directive, and bot-gateway/call/notification/recording still use deprecated `--production` |

## D. Sequencing for the next round

1. **B.1 and B.2 first** — both are one-line deletions of a fallback, and both currently give an attacker
   admin. Then the `dev_secret` and Centrifugo-config secrets (C), which are also config-only.
2. **B.3 as one change, not five** — write `assertProductAccess(userId, role, productId)` once and call it
   from `getLivekitToken`, `getCall`, `getCallQueue`, `verifyAttachmentAccess`, `assertMember` and the two
   subscribe-proxy branches. Add a negative test per call site to `authorization.test.ts`, which now exists
   and is the right home for them.
3. **C: the four unauthorized call/presence endpoints** — the same helper plus a participant check.
4. **P1.4 `rawBody: true`** — until it lands, no webhook signature work can be verified.
5. **P0.6 logout** — carry the refresh jti in the access token, or revoke by user + session set.

Everything else in C is unchanged from the original plan and keeps its original priority.

---

## P-1 - Architectural Root Causes

These are not bugs; they are the reasons the P0 list looks the way it does. Fixing the P0 items without
addressing these will produce the same class of defect again.

1. **[+] Eight services share one database and one schema, duplicated eight ways.**
   - `services/*/prisma/schema.prisma` — 8 separate schemas, all pointing at the same Postgres instance
     (`DATABASE_URL` is identical for every service in `docker-compose.yml`).
   - `User` is redefined in 7 schemas, `OperatorState` in 3, `Recording`/`Call`/`Attachment`/`OperatorProduct` in 2 each,
     with no single owner. `call-service` writes `Recording` rows (`services/call/src/calls/calls.service.ts:399`)
     that `recording-service` also owns (`services/recording/src/recordings/recordings.service.ts`).
   - There are no Prisma migrations anywhere (`find services -type d -name migrations` → empty). Schema
     lives in `infra/postgres/init.sql` plus seven hand-applied `infra/postgres/migrate_*.sql` files.
   - Consequence: this is a distributed monolith. Service boundaries provide deployment cost without
     isolation benefit, and any schema change must be replicated by hand across up to 8 files.
   - Decide explicitly: either (a) collapse to a modular monolith with one schema and real migrations,
     or (b) give each service its own database and replace cross-service reads with API/event calls.
     Option (a) is the lower-risk path given current team size and the fact that all data is already shared.

2. **[+] Authorization is 44 hand-written inline role checks with no guard, policy, or shared abstraction.**
   - `grep -rn "user.role" services --include="*.ts"` → 44 sites; `RolesGuard`/`@Roles` → 0 sites.
   - Every endpoint re-implements its own check, so omissions are invisible in review. The omissions
     found in P0.3 below (`mute`, `stopRecording`, `completeWarmTransfer`, `getAttachment`) are all
     instances of this single root cause.
   - Introduce a `@Roles()` decorator + `RolesGuard`, and a `ResourceAccess` policy service for
     participant/membership/product checks. Make the guard deny-by-default so a missing decorator fails closed.

3. **[+] Tenant scoping is advisory, not enforced.**
   - `productId` reaches every query as an optional spread: `...(productId ? { productId } : {})`
     (`services/chat/src/rooms/rooms.service.ts:38`, `services/call/src/calls/calls.service.ts:533`,
     and ~10 more). Omit the header and the filter silently disappears.
   - Additionally, the operator role short-circuits scoping entirely — see P0.4a.
   - Product scope must be resolved server-side into a required, non-optional predicate. Consider Prisma
     client extensions or a repository layer so no query can be written without it.

---

## P0 - Critical Security And Tenant Isolation

1. Lock down Centrifugo subscription authorization.
   - Validate channel namespace, product ownership, room membership, and user role before issuing subscription tokens.
   - Deny access to `chat`, `presence`, and `call` channels unless the authenticated user is allowed to observe that specific resource.
   - Prefer server-side proxy subscription where possible, so authorization stays on the backend.
   - Add regression tests for cross-room, cross-product, and cross-role subscription attempts.
   - **[↑] This is worse than described: subscription tokens are not merely weak, they are not required at all.**
     `infra/centrifugo/config.json` sets `"allow_subscribe_for_client": true` on all three namespaces
     (`chat`, `presence`, `call`) and `"proxy_subscribe_endpoint": ""`. Centrifugo therefore accepts any
     subscription from any connected client with no token. `POST /auth/centrifugo/subscribe`
     (`services/auth/src/auth/auth.service.ts:211`) — which validates only the namespace prefix — is
     decorative; the operator panel calls it (`operator-panel/src/stores/centrifuge.ts:41`) but nothing
     enforces it. **Any authenticated user can read every chat room, every call channel, and all presence
     in every tenant.** Fix by setting `allow_subscribe_for_client: false` and pointing
     `proxy_subscribe_endpoint` at a backend authorization endpoint — the config change is what actually
     closes the hole; token hardening alone does not.
   - **[+] The committed Centrifugo HMAC secret makes connection tokens forgeable.**
     `infra/centrifugo/config.json:2` hardcodes `token_hmac_secret_key` and is not overridden by env in
     `docker-compose.yml`. Anyone with repo access can mint a connection token for an arbitrary `sub`
     and impersonate any user on the realtime layer. Same file also hardcodes `api_key`,
     `admin_password: "admin"`, `admin_secret`, and `allowed_origins: ["*"]`.
   - **[+] LiveKit access tokens are broadcast over a call channel.**
     `services/call/src/calls/calls.service.ts:136-143` publishes `callerToken` into `call:${callId}`.
     Combined with the open subscribe above, a LiveKit join credential is handed to any subscriber.
     Deliver participant tokens over the authenticated HTTP response only.

2. Enforce LiveKit call participation checks.
   - Issue LiveKit tokens only to users who are participants in the requested call.
   - Treat valid participants explicitly: caller, callee, assigned operator, supervisor, or approved consult participant.
   - Add tests proving that an authenticated but unrelated user cannot receive a token for another call.
   - Confirmed: `services/call/src/livekit/livekit.controller.ts:25-29` fetches the call by id and issues
     a token with no participant check whatsoever.
   - **[+] `POST /livekit/webhook` (`livekit.controller.ts:31`) has no guard and no signature verification** —
     unauthenticated, and currently only logs, so make it verify before any handler is attached to it.

3. Harden call endpoint authorization.
   - Protect `GET /calls/:id` with call participant or supervisor checks. — confirmed, `calls.controller.ts:48`.
   - Restrict `GET /calls/queue` to authorized operator roles and valid product scope. — confirmed,
     `calls.controller.ts:33`; note it also returns caller `fullName` and `phone`
     (`calls.service.ts:506-510`), so this is a PII leak to any authenticated customer.
   - Require participant checks for hangup. — confirmed, `calls.service.ts:160`.
   - Require both operator role and call participation for recording start. — confirmed, `calls.service.ts:389`.
   - Require the transferring operator to be the current assigned callee/operator for transfer operations.
     — confirmed, `calls.service.ts:287`.
   - **[+] Four more endpoints have no authorization at all, not just a missing participant check:**
     - `muteCall` (`calls.service.ts:278`) — no role, no participation. Any authenticated user can mute
       any participant in any live call.
     - `stopRecording` (`calls.service.ts:468`) — no role, no participation.
     - `recordingConsentAck` (`calls.service.ts:427`) — no participation check; triggers egress start.
     - `completeWarmTransfer` / `cancelWarmTransfer` (`calls.service.ts:351,372`) — accept `user` and
       never read it. Any authenticated user can complete or cancel any operator's warm transfer.
   - **[+] `POST /presence/users/bulk` (`services/presence/src/presence/presence.controller.ts:18`)**
     takes an arbitrary id list with no role check — presence enumeration for all users.

4. Remove trust in client-controlled `X-Product-Id`.
   - Treat `X-Product-Id` only as a requested scope, not an authorization source.
   - Validate operator access through `operator_products` or equivalent server-side membership data.
   - Apply the same validation across chat, call, media, presence, and operator-facing APIs.
   - Add bypass tests for forged product headers.
   - Confirmed and worse than it reads: `operator_products` is consulted in exactly **one** place —
     `services/chat/src/products/products.service.ts:30`, to render a picker list. It is never consulted
     on any scoped endpoint. The header itself comes from `localStorage`
     (`operator-panel/src/api/client.ts:11`), i.e. fully user-editable.

   4a. **[+] The operator role bypasses room scoping entirely, header or not.**
   - `rooms.list` (`services/chat/src/rooms/rooms.service.ts:35-53`): the membership predicate is applied
     only to non-operators, and the product filter only when a header is present. An operator sending no
     `X-Product-Id` receives **every room in every tenant**.
   - `rooms.getOne:154` and `rooms.assertMember:220` return early for any operator/supervisor/admin,
     with no product check. Since `assertMember` gates all of `messages.list/create/markRead/typing`,
     **any operator can read and post in any tenant's conversation** by room id alone.
   - `rooms.searchUser:97` does an unscoped `contains` match on `phone` across all users — cross-tenant
     PII enumeration for any operator.

   4b. **[+] `PATCH /operator/product` lets an operator join any tenant.**
   - `services/presence/src/operator/operator.service.ts:179-193` writes `currentProductId` with no
     `operator_products` membership check. An operator sets it to another tenant's product id and is
     immediately routed that tenant's inbound calls by ACD (`calls.service.ts:583`). This is the
     concrete cross-tenant escalation path and should be fixed alongside 4.

5. Remove hardcoded secrets and insecure public admin surfaces.
   - Move Centrifugo, LiveKit, Grafana, database, Redis, RabbitMQ, and MinIO credentials to environment-managed secrets.
   - Fail startup when required production secrets are empty, defaulted, or known development values.
   - Disable Traefik insecure API in non-local environments. — confirmed, `docker-compose.yml:502` `--api.insecure=true`, port `8080` published.
   - Remove public routing to Centrifugo API/admin endpoints. — confirmed, `infra/traefik/dynamic.yml` router `centrifugo-api` on `PathPrefix(/centrifugo)` with no auth middleware.
   - Replace wildcard CORS with explicit allowed origins. — confirmed, `infra/traefik/dynamic.yml` `accessControlAllowOriginList: ["*"]` plus Centrifugo `allowed_origins: ["*"]`.
   - Inventory of defaulted secrets found: `JWT_SECRET ?? 'dev_secret'` in **7 services**
     (notification, recording ×2, presence ×3, call ×2, bot-gateway ×2, media ×2);
     `LIVEKIT_SECRET ?? 'devsecret_change_me_32_chars_minimum_xx'` in call and recording;
     `POSTGRES_PASSWORD:-nova_dev_pass`, `MINIO_ROOT_PASSWORD:-minioadmin123`,
     `GRAFANA_ADMIN_PASSWORD:-admin` in `docker-compose.yml`; `devkey`/`devsecret…` in
     `infra/livekit/livekit.yaml` and `infra/livekit/egress.yaml`.

6. **[+] Authentication defects in auth-service.** *(new item — this whole area was not covered)*
   - **Nova SSO signature does not cover the role claim.** `services/auth/src/auth/auth.service.ts:236`
     signs only `${novaUserId}:${dto.timestamp}`, but line 254/265 writes `dto.novaRole` — client-supplied,
     `@IsEnum(['operator','supervisor','admin'])` — into the user record, for **new and existing users alike**.
     Anyone able to observe or obtain one valid SSO signature can replay it within the 5-minute window
     with `novaRole: "admin"` and take over that account at admin level. Sign the full payload.
   - **`NOVA_SSO_SECRET ?? ''`** (same line): if the variable is unset, the HMAC key is the empty string,
     which an attacker can compute. Unauthenticated admin account creation. Fail startup instead.
   - **OTP brute force is unbounded.** Rate limiting exists only on `otpSend`
     (`auth.service.ts:301`); `otpVerify:83` has no attempt counter and does not invalidate the OTP on
     failure. A 6-digit OTP with a 300s TTL falls in ~500k requests, and there is no rate limiting
     anywhere in the stack (see P0.7).
   - **OTP is generated with `Math.random()`** (`auth.service.ts:298`) — not cryptographically random,
     and predictable from observed values. Use `crypto.randomInt`.
   - **Logout does not revoke anything.** `issueTokens:278-292` stores the *refresh* jti (`refreshJti`)
     in Redis, but the access token carries a *different* jti. `logout(user.sub, user.jti)`
     (`auth.controller.ts:76`) therefore deletes a key that never existed; the 30-day refresh token stays
     valid after logout. Carry the refresh jti in the access token, or revoke by user + session id.
   - **Supervisors can seize admin accounts.** `requireAdmin` (`services/auth/src/admin/admin.controller.ts:23`)
     accepts `supervisor`, and `PATCH /admin/users/:id/password` has no target-role restriction — a
     supervisor sets an admin's password and logs in as them. Separate the two roles, or forbid
     acting on a user whose role outranks the caller's.
   - **Role is never re-validated after issue.** `services/auth/src/auth/strategies/jwt.strategy.ts:22`
     checks only that `sub` and `jti` are present. A demoted or suspended user keeps full privileges
     for the remaining access-token lifetime (1h).

7. **[+] No rate limiting, no security headers, anywhere.** *(new item)*
   - `@nestjs/throttler` and `helmet` appear in zero services (`grep` over all `package.json` and `src`).
     No limits on `/auth/email-login`, `/auth/otp/verify`, `/auth/refresh`, or any other endpoint.
   - Add throttling at the gateway (Traefik middleware) *and* per-endpoint on the auth paths; add
     `helmet` to every service bootstrap.

8. **[+] Media attachments have no access control (IDOR).** *(re-prioritized from P3.1)*
   - `services/media/src/media/media.service.ts:158` and `:168`: `getAttachment` / `getThumbnail` look
     the record up by id and return a presigned MinIO URL with **no ownership, room-membership, or
     product check**. Any authenticated user can enumerate attachment ids and download every file
     uploaded by every tenant, including call recordings written to the same bucket.
   - This belongs in P0, not in the media-hardening bucket at P3.1.

---

## P1 - Broken Flows And API Contract Mismatches

1. Fix call-service to recording-service authentication.
   - Add an internal authentication mechanism for service-to-service calls: internal JWT, shared API key, mTLS, or an internal-only network endpoint.
   - Ensure `call-service` sends required credentials when calling `recording-service`.
   - Keep public recording endpoints protected by user authentication.
   - Add integration coverage for starting recording from a call.
   - Confirmed: `services/call/src/calls/calls.service.ts:445` sends no `Authorization` header;
     `services/recording/src/recordings/recordings.controller.ts:15-17` is `@UseGuards(JwtAuthGuard)`.
     Every call returns 401 — **recording has never worked**; the error is caught and logged at
     `calls.service.ts:455`, so the API still reports success to the operator.

2. Align operator-panel call API routes with backend routes.
   - Replace `/calls/livekit/token` with `POST /livekit/token`.
   - Replace cold and warm transfer-specific frontend routes with `POST /calls/:id/transfer` and body fields `{ type, toOperatorId }`.
   - Use `POST /calls/:id/transfer/complete` for transfer completion.
   - Replace `/calls/:id/recording/:recordingId/consent-ack` with `POST /calls/:id/recording/consent-ack` and body `{ recordingId }`.
   - Add frontend API tests or contract tests for the call workflows.
   - **[↑] The mismatch is total, not partial.** Comparing `operator-panel/src/api/calls.ts` against
     `services/call/src/calls/calls.controller.ts`, every non-trivial call operation is wrong:

     | Frontend call | Backend route | Status |
     |---|---|---|
     | `POST /calls/livekit/token` | `POST /livekit/token` | 404 |
     | `POST /calls/:id/hold` (no body) | needs `{ hold: boolean }`, `forbidNonWhitelisted` | 400 |
     | `POST /calls/:id/resume` | *(does not exist)* | 404 |
     | `POST /calls/:id/transfer/cold` `{targetOperatorId}` | `POST /calls/:id/transfer` `{type,toOperatorId}` | 404 |
     | `POST /calls/:id/transfer/warm/init` | same as above | 404 |
     | `POST /calls/:id/transfer/warm/complete` | `POST /calls/:id/transfer/complete` | 404 |
     | `POST /calls/:id/transfer/warm/cancel` | `POST /calls/:id/transfer/cancel` | 404 |
     | `POST /calls/:id/recording/:rid/consent-ack` | `POST /calls/:id/recording/consent-ack` `{recordingId}` | 404 |
     | `POST /calls/:id/recording/:rid/stop` | `POST /calls/:id/recording/stop` | 404 |

     Only `answer`, `hangup`, `mute`, `outbound` and `getHistory` resolve. Hold, resume, transfer
     (both kinds), and the entire recording flow are non-functional in the operator panel.
   - **[+] `docs/STATUS.md:3` claims "58/58 test PASS" and lists transfer and recording as working.**
     Neither can work. Correct the status document as part of this item — a status file that contradicts
     the code is worse than no status file, because it suppresses exactly the investigation that would
     find these.

3. Introduce a single API contract source.
   - Publish OpenAPI/Swagger specs from backend services.
   - Generate frontend API clients or validate the hand-written clients against the specs in CI.
   - Add contract checks for operator-panel endpoints before merge.

4. **[+] Webhook signature verification is structurally inoperative in both services.** *(promoted from P3.2 — this is a broken flow, not just hardening)*
   - Neither `services/presence/src/main.ts` nor `services/recording/src/main.ts` passes
     `{ rawBody: true }` to `NestFactory.create`, so `req.rawBody` is always `undefined` in
     `services/presence/src/webhooks/webhooks.controller.ts:46,76` and
     `services/recording/src/webhooks/webhooks.controller.ts:27`.
   - Presence then HMACs a re-serialized `JSON.stringify(body)`, which will not byte-match Centrifugo's
     payload — so whenever the signature header *is* sent, verification fails and the webhook 401s;
     presence tracking breaks. When the header is absent, `if (signature && …)` skips verification
     entirely (`:47`), so an attacker simply omits the header.
   - Recording swallows every verification failure in a bare `catch` (`:31`) and processes the event
     anyway — unauthenticated attackers can forge `egress_ended`/`egress_failed` and corrupt recording state.
   - Fix `rawBody: true` first; the P3.2 hardening below is only meaningful afterwards.

5. **[+] Concurrent 401s log the user out of every session.** *(new item)*
   - `operator-panel/src/api/client.ts:16-38` has no single-flight guard: N parallel requests that 401
     fire N refresh calls with the same refresh token. The first rotates and deletes the jti
     (`services/auth/src/auth/auth.service.ts:146`); the rest hit the theft-detection branch at `:136`,
     which revokes **all** of the user's sessions.
   - Any page load with two concurrent expired requests forcibly logs the operator out. Serialize
     refresh into a single in-flight promise.

---

## P2 - Data Model Consistency And Shared Service Boundaries

1. Consolidate database schema ownership.
   - Choose one source of truth for Prisma schema and migrations.
   - Remove or generate duplicated per-service schemas where possible.
   - Keep `infra/postgres/init.sql` aligned with migrations or replace it with migration-driven initialization.
   - Add CI checks that detect schema drift.
   - See P-1.1 for the scope of the duplication; this item is the execution of that decision.

2. Fix DTO and database enum mismatches.
   - Align room status values with persisted values such as `open`, `pending`, `closed`, and `bot_handling`.
   - Align room type values with persisted values such as `direct`, `support`, and `transfer_consult`.
   - Add validation tests for accepted and rejected enum values.
   - Confirmed precisely. `services/chat/src/rooms/dto/list-rooms.dto.ts` and `update-room.dto.ts` accept
     `['active','pending','closed','archived']` and `['direct','support','group']`; the DB
     (`infra/postgres/init.sql:93-94`, `services/chat/prisma/schema.prisma:35-48`) defines
     `('direct','support','transfer_consult')` and `('open','closed','pending','bot_handling')`.
   - Net effect today: `GET /rooms?status=open` → 400 (rejected by DTO), `?status=active` → 500
     (accepted by DTO, rejected by Postgres). `type=group` likewise 500s on create. Only `pending`
     and `closed` work.

3. Centralize common service modules.
   - Extract shared JWT guards, Prisma service setup, RabbitMQ client setup, Redis client setup, Centrifugo client setup, and common configuration validation.
   - Remove inconsistent JWT secret fallbacks such as `dev_secret` from production paths.
   - Make shared modules strict by default and explicitly configurable for local development.
   - Scope check: `prisma.service.ts`, `redis.service.ts`, `rabbitmq.service.ts` and the jwt guard/strategy
     are copy-pasted across 6–8 services each, with drift (auth-service reads `JWT_SECRET` strictly,
     the other seven fall back to `dev_secret`).

4. Standardize request validation.
   - Enable `whitelist` and `forbidNonWhitelisted` consistently across NestJS services.
   - Add service-level bootstrap tests or smoke tests to verify strict validation is enabled.
   - Confirmed: only `auth` and `chat` set `forbidNonWhitelisted: true`; call, media, presence,
     recording, notification, bot-gateway do not.

5. **[+] In-process `setTimeout` used for cross-request state.** *(new item)*
   - `services/call/src/calls/calls.service.ts:413-422` schedules the recording consent timeout with
     `setTimeout` in the request handler. It is lost on restart or deploy, does not work with more than
     one replica, and its `async` callback has no `.catch` — an unhandled rejection on a Prisma error
     will take the process down under Node's default policy.
   - Move to a Redis-backed delayed job or a periodic sweeper over `status='starting'` records.

6. **[+] Multi-step call state changes are not transactional.** *(new item)*
   - `initiateCall` (`calls.service.ts:39-96`) performs `call.create` → `livekit.createRoom` →
     `call.update` → `callQueue.create` → `operatorState.updateMany` as independent statements. A failure
     partway leaves an orphaned call row, a LiveKit room with no call, or an operator flagged `onCall`
     forever. Same pattern in `executeColdTransfer:311` and `hangupCall:172`.
   - Wrap the DB portion in `prisma.$transaction` and make the LiveKit side idempotent/compensating.

7. **[+] ACD operator claim is never released.** *(new item)*
   - `findAvailableOperator` (`calls.service.ts:597`) sets `operator:claim:{id}` with a 5s TTL and never
     deletes it on answer or failure. Between assignment and TTL expiry the operator is invisible to
     routing; after expiry they can be double-assigned even while ringing. Release the claim explicitly
     in `answerCall`/`hangupCall`.

---

## P3 - Media, Webhooks, And Operational Hardening

1. Harden media upload handling.
   - Reject MIME and magic-byte mismatches instead of only logging them.
     — confirmed, `services/media/src/media/media.service.ts:106-114` logs and continues.
   - Replace the ClamAV stub with real scanning or quarantine pending scan result.
     — confirmed, `media.service.ts:117` logs `scan_skipped`.
   - Avoid reading full uploaded files into memory for validation.
     — confirmed, `media.service.ts:103` `getObject` buffers the whole object; with a 100MB video limit
     this is a trivial memory-exhaustion vector against `media-service`.
   - Make the media bucket private by default.
   - Serve downloads through backend authorization and attachment ACL checks.
     — **[↑] the ACL half of this moved to P0.8**; what remains here is bucket policy and streaming.

2. Make webhook signature validation mandatory in production.
   - Reject presence webhooks when the secret is missing or the signature is invalid.
   - Reject LiveKit recording webhooks with invalid signatures instead of logging and continuing.
   - Add explicit development-only bypasses if local workflows need them.
   - **Blocked on P1.4** — the `rawBody` fix must land first or verification cannot succeed at all.
   - **[+]** Also stop reusing `CENTRIFUGO_API_KEY` as the webhook HMAC secret
     (`services/presence/src/webhooks/webhooks.controller.ts:15-17`, `docker-compose.yml:271`):
     one credential serving both API auth and signature verification means a leak in either direction
     compromises both.

3. Stop leaking sensitive operational data.
   - Remove OTP values from production logs. — confirmed, `services/auth/src/auth/auth.service.ts:76`
     `console.log("[OTP] ${phone}: ${otp}")`, bypassing the pino logger entirely.
   - Redact tokens, secrets, product identifiers where needed, and call metadata in structured logs.
   - Add log-level controls for local debugging.
   - **[+]** Add PII-aware redaction for `phone` and `fullName`, which currently flow into logs and into
     API responses that are not access-controlled (`calls.service.ts:506`, `rooms.service.ts:71`).

4. Reduce exposed infrastructure surface.
   - Avoid binding database, Redis, RabbitMQ, MinIO, and other internal ports to the host in production-like Compose files.
   - Split local development Compose configuration from production-like deployment configuration.
   - Protect Grafana with non-default credentials and private routing.
   - **[+] All eight application services also publish their ports to the host**
     (`docker-compose.yml` 3001–3008). Traefik is therefore bypassable: `recording-service:3007`,
     including the internal `/recordings/start` endpoint, is reachable directly, as is every other
     service without passing the gateway's middleware chain.

5. **[+] Containers run as root and builds pull `latest` transitively.** *(new item)*
   - No `USER` directive in any of the 9 Dockerfiles; every service runs as uid 0.
   - `npm install` without `--ignore-scripts` in the build stage runs arbitrary lifecycle scripts from
     the dependency tree at image-build time.
   - `services/{bot-gateway,call,notification,recording}/Dockerfile` use the deprecated
     `npm install --production` rather than `--omit=dev`.

---

## P4 - CI, Build Reproducibility, And Test Coverage

1. Make Docker builds reproducible.
   - Commit lockfiles for Node services where missing.
   - Copy `package-lock.json` into Docker build contexts.
   - Use `npm ci` instead of `npm install` in Dockerfiles and CI.
   - Fail builds when lockfiles are missing or out of sync.
   - Confirmed: all 9 Dockerfiles `COPY package.json ./` only and run `npm install`. Lockfiles exist in
     the repo but are never used, so image contents drift on every rebuild.

2. Add CI gates.
   - Run install, lint, typecheck, unit tests, integration tests, and Docker build checks.
   - Add security regression tests for tenant isolation, channel authorization, LiveKit token authorization, and call ownership.
   - Add contract checks for frontend/backend API compatibility.
   - Confirmed: there is **no CI at all** — no `.github/`, no pipeline definition anywhere in the repo.

3. Expand security-focused test coverage.
   - Test forged `X-Product-Id` access.
   - Test access to unrelated rooms, calls, recordings, and media attachments.
   - Test unauthorized call queue access.
   - Test unauthorized transfer, hangup, and recording operations.
   - **[+] The existing tests give false assurance and should be treated as a finding, not a baseline.**
     `tests/integration/multitenancy.test.ts` — the file titled "FINTECH CRITICAL" — authenticates only
     as **admin** (`getAdminToken()`, line 17) and asserts only that scoped requests return data for the
     product asked for. It never attempts an access the caller should be denied. Every isolation hole in
     P0.4/4a/4b passes it. The 9 `*.spec.ts` unit files run under `jest --passWithNoTests`.
   - Each security test added must be a *negative* test asserting 403/404, and must be written from a
     non-admin principal.

4. Add service health and readiness coverage.
   - Distinguish liveness from readiness.
   - Include dependency checks for database, Redis, RabbitMQ, Centrifugo, LiveKit, MinIO, and Meilisearch where applicable.
   - Ensure production deployments do not accept traffic before required dependencies and migrations are ready.

---

## P5 - Documentation And Developer Workflow

1. Document security and tenancy rules.
   - Define product scoping rules.
   - Define role permissions for operators, supervisors, customers, bots, and service accounts.
   - Document channel naming and authorization requirements for realtime access.
   - **[+]** Include an explicit `supervisor` vs `admin` boundary — the code currently treats them as
     interchangeable in `requireAdmin` and `ADMIN_ROLES`, which is what makes P0.6's escalation possible.

2. Document service-to-service authentication.
   - Define which services may call each internal endpoint.
   - Document credential rotation and local development setup.
   - Add examples for authenticated internal calls.

3. Keep architecture docs aligned with implementation.
   - Update architecture diagrams after schema ownership and shared-module changes.
   - Document the chosen API contract workflow.
   - Document local vs production infrastructure differences.
   - **[+]** `docs/STATUS.md` currently asserts working transfer and recording flows that cannot execute
     (P1.1, P1.2). Either correct it now or stop maintaining it; treat "status" claims as requiring a
     passing test to back them.

4. Maintain a remediation tracker.
   - Convert this plan into issues or milestones.
   - Assign owners and target releases.
   - Track blocking dependencies between security, schema, and frontend contract work.

---

## Suggested Sequencing

The P0 list is not independently orderable; some items unblock others.

1. **Stop the bleeding (config-only, hours not days).**
   `allow_subscribe_for_client: false` + rotate every committed secret + drop the `dev_secret` fallbacks
   + close the host port bindings + Traefik `--api.insecure=false` + explicit CORS origins.
   This removes the unauthenticated and trivially-exploitable paths without touching application code.
2. **Build the authorization primitives** (P-1.2): `RolesGuard`, participant policy, product-scope resolver.
   Doing P0.2/0.3/0.4/0.8 before these exist means writing 20 more inline checks.
3. **Land P0.4a/4b/0.6/0.7/0.8** on top of those primitives, each with a negative test (P4.3).
4. **Fix the broken flows** (P1.1, P1.2, P1.4, P1.5) — these are user-visible breakage, not just risk.
5. **Then** P2 schema consolidation, which is the largest and least reversible piece of work and should
   not be started while the security surface is still moving.

CI (P4.2) should be stood up in parallel with step 1, since every subsequent step needs it to hold.
