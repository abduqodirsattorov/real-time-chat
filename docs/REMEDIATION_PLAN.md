# Remediation Plan

Updated: 2026-09-14.

This is the active plan for the current working tree, including uncommitted remediation changes. It replaces the obsolete open-task list; the original audit is preserved in [REMEDIATION_AUDIT_HISTORY.md](REMEDIATION_AUDIT_HISTORY.md). The synchronized developer handoff is [plan.txt](../plan.txt).

No new test run was performed for this documentation update. Results below come from the preceding implementation pass and are not a blanket security sign-off or proof that the full CI pipeline or production deployment passes.

## Status and Ownership

- **Implemented / scoped verification:** changes listed below have source or recorded test evidence, with limits stated explicitly.
- **Open:** every R01-R20 task and G01-G03 release gate still requires work or acceptance evidence.
- Owners and target releases are **unassigned**. Assign them when creating development tickets; do not infer completion from a merged change alone.
- P1 covers broken workflows and required integration verification; P2 covers consistency and maintainability; P3 covers operational hardening; P4 covers delivery guarantees; P5 covers documentation and tracking.

## Implemented Baseline

| Area | Implemented change | Evidence and remaining scope |
| --- | --- | --- |
| Authentication | Hardened SSO signatures, OTP limits, session revocation, account/role checks and secret fallbacks | Existing source and auth/security tests; deployed credential rotation and legacy sessions remain G01-G02 |
| Resource authorization | Product assignment, room membership, call participation and attachment checks; unrelated staff cannot use null products as global scope | [Authorization rules](AUTHORIZATION.md), service regression tests and the recorded HTTP authorization suite; consolidation remains R11 |
| Realtime and webhooks | LiveKit credentials removed from shared events; raw-body signature checks reject missing/invalid signatures | Direct HTTP security tests; actual Centrifugo proxy wiring remains R03 and outbound client adaptation remains R01 |
| Internal recording start | Explicit internal credentials and failed Egress startup propagation | Call/recording regression coverage; stop and uncertain remote outcomes remain R02 |
| Panel recording controls | recordingId normalization, pending guards, late-response checks and failure reconciliation | 8 Vitest tests, production build, desktop/mobile component smoke with mocked HTTP; real recording remains R05 |
| Upload confirmation | Bounded temporary snapshot, MIME rejection, real ClamD protocol implementation, scanned final keys and private bucket configuration | Media unit/protocol tests; real signatures and production delivery remain R06; old objects and derivatives remain R14 |
| Production configuration | Added missing service credentials, LiveKit endpoint settings, private bucket initialization and ClamAV wiring | Configuration tests, not a deployed production acceptance test; R04/R06/R16 remain open |
| Database initialization | Repaired v_operator_kpi_daily and added an aggregation regression | Full init.sql execution on a clean TimescaleDB/PostgreSQL 16 database and rolled-back SQL assertions; migrations/readiness remain R10/R19 |
| Test setup and CI | Portable repository path, explicit test seed, shared generated test secrets, panel and SQL CI steps, strict npm ci in CI | 59 HTTP tests passed together in authorization.test.ts and security.test.ts; full pipeline remains R18 |
| Other existing improvements | Room DTO enums aligned, single-flight panel refresh, strict validation in six services, non-root users in eight backend Dockerfiles | Not reopened as missing features; remaining validation is R13 and container install reproducibility is R17 |

The local Docker run required a temporary MinIO image override. Local media scanning was disabled in development mode. Flutter, real audio/consent playback, complete Egress output and production networking were not accepted end to end. Details: [P1_REMEDIATION.md](P1_REMEDIATION.md).

## Release Gates (P0, Open)

These are deployment obligations, not newly demonstrated code exploits. Implementation fixes do not prove that previously deployed credentials, tokens or data have been remediated.

- **G01 - Rotate exposed and development credentials.** Inventory deployed JWT/refresh, Nova SSO, Centrifugo, LiveKit, internal-service, database, Redis, RabbitMQ, MinIO and admin credentials. Rotate affected values through secret management and verify that old credentials fail.
- **G02 - Revoke legacy access.** Revoke affected tokens and refresh sessions and disconnect existing realtime/LiveKit sessions where required. Test that credentials issued before remediation cannot retain unauthorized access.
- **G03 - Remediate legacy tenant data.** Assign reviewed product ownership to legacy rooms/calls and validate operator product assignments. Quarantine ambiguous records; do not weaken the new null-product access rules to restore access.

Development order is R01-R07, then R08-R13, R14-R16, R17-R19 and R20. Start G01-G03 in parallel and complete them before deployment. Pull R17-R19 forward whenever reproducibility or readiness blocks R04-R06; maintain R20 throughout.

## Development Backlog

Every entry below is **Open**. Task IDs are stable and match plan.txt; the numbered order is the recommended development sequence.

### 1. R01 - Repair Outbound LiveKit Connection (P1)

The operator panel still waits for callerToken in call.connected even though the backend no longer broadcasts credentials.

Fetch the participant token through the authenticated call endpoint when the call connects. Deduplicate connection attempts and discard late token responses after hangup or call replacement.

**Acceptance:** A real outbound call connects both participants, duplicate events create one connection, and no credential is published to a shared channel.

**Code scope:** `operator-panel/src/stores/calls.ts`, `services/call/src/calls/calls.service.ts`.

### 2. R02 - Propagate and Reconcile Egress Failures (P1)

Egress stop errors are swallowed, while recording-start timeouts can leave an unknown remote outcome.

Propagate stop failures without claiming a successful state transition and reconcile both start and stop outcomes against LiveKit. Make retries idempotent using the recording identity so an uncertain response cannot create duplicate recordings.

**Acceptance:** Timeout, failed stop, lost response and retry tests prove that API, database and remote Egress state converge without false success or duplicate sessions.

**Code scope:** `services/call/src/livekit/livekit.service.ts`, `services/call/src/calls/calls.service.ts`, `services/recording/src/recordings/recordings.service.ts`.

### 3. R03 - Verify Actual Centrifugo Proxy Authentication (P1)

Directly signed HTTP tests do not establish that deployed Centrifugo sends authentication compatible with the protected proxy endpoints.

Verify and align connect, subscribe and disconnect authentication for the deployed Centrifugo version in local and production configurations. Exercise actual WebSocket clients while preserving fail-closed checks, room membership and product isolation.

**Acceptance:** Authorized clients connect and receive permitted events; forged, unrelated and cross-product subscriptions fail through the real proxy.

**Code scope:** `infra/centrifugo/config.json`, `docker-compose.yml`, `docker-compose.prod.yml`, `services/chat/src/centrifugo/centrifugo.controller.ts`, `services/presence/src/webhooks/webhooks.controller.ts`.

### 4. R04 - Restore Reproducible Stack Image Availability (P1)

The default minio/minio:latest pull failed during verification and the successful local run required an uncommitted override.

Select accessible, supported image sources and pin tested MinIO server/client versions or digests in maintained deployment configuration. Verify compatibility and pull the stack from a clean cache without relying on local images or temporary overrides.

**Acceptance:** A clean CI runner can pull and initialize the documented stack, including private bucket setup.

**Code scope:** `docker-compose.yml`, `docker-compose.prod.yml`, `docs/P1_REMEDIATION.md`.

### 5. R05 - Complete Real Call and Recording Acceptance Tests (P1)

Passing component and HTTP authorization tests does not prove that real audio, consent playback and Egress recording work end to end.

Run browser and Flutter call flows with real LiveKit, Egress and MinIO, including inbound/outbound calls, transfers, consent announcement and acknowledgment, stop, completion and authorized downloads. Cover denied access, disconnects and failure recovery, and make consent audio assets reachable without making media buckets public.

**Acceptance:** Both clients exchange audio; a consented recording completes and can only be downloaded by authorized users; transfer and disconnect scenarios have retained test evidence.

**Code scope:** `operator-panel/src/components/RecordingButton.vue`, `client/lib/services/call_service.dart`, `services/call`, `services/recording`, `infra/livekit`.

### 6. R06 - Verify Real Antivirus and Private Media Delivery (P1)

Scanner protocol fixtures passed, but real ClamAV signatures and production-like private storage delivery were not exercised.

Test clean files, a standard harmless antivirus test fixture, MIME mismatches, size limits and scanner outages against real ClamAV and MinIO. Verify original, thumbnail, voice and recording URL permissions through the public HTTPS storage endpoint.

**Acceptance:** Unsafe or unscanned uploads never become downloadable, outages fail closed, and unauthorized users cannot obtain working download URLs.

**Code scope:** `services/media/src/media/clamav.ts`, `services/media/src/media/media.service.ts`, `infra/clamav/clamd.conf`, `docker-compose.prod.yml`.

### 7. R07 - Establish a Single API Contract (P1)

Frontend request and response contracts remain handwritten and can drift despite the corrected recording ID mapping.

Publish versioned OpenAPI contracts and generate clients or validate existing clients against those contracts, starting with calls and recordings. Specify realtime event payloads alongside HTTP contracts and add compatibility checks for both operator-panel and Flutter in CI.

**Acceptance:** A breaking route, payload, response or event change fails a contract check before merge.

**Code scope:** `operator-panel/src/api/calls.ts`, `services/call/src/calls/calls.controller.ts`, `services/recording/src/recordings/recordings.controller.ts`, `client/lib/services/call_service.dart`.

### 8. R08 - Persist Recording Consent Deadlines (P2)

Recording consent expiry still relies on an in-process setTimeout that does not survive restarts or coordinate replicas.

Persist deadlines and process them through durable delayed jobs or a database sweeper. Use conditional state transitions so expiry cannot overwrite accepted consent or an active recording, and retry failed jobs safely.

**Acceptance:** Restart and multi-replica tests expire abandoned consent requests exactly once without invalidating acknowledged recordings.

**Code scope:** `services/call/src/calls/calls.service.ts`.

### 9. R09 - Make Call and Queue Transitions Atomic (P2)

Existing transactions and claim releases do not prove that competing answers, transfers, hangups and routing attempts preserve call ownership.

Add conditional transitions, transactional queue assignment and ownership-aware claim release on every terminal or failure path. Reconcile external LiveKit operations with database state using idempotent actions and compensation where necessary.

**Acceptance:** Concurrency, crash and retry tests demonstrate one owner per call, no double operator assignment, no leaked claims and recoverable partial failures.

**Code scope:** `services/call/src/calls/calls.service.ts`, `services/call/src/queue`.

### 10. R10 - Finish Schema Ownership and Executable Migrations (P2)

A shared Prisma schema exists, but duplicated migration dumps contain psql commands and deployment does not demonstrate a single reliable migration path.

Define one migration owner for the shared database and generate or synchronize service schemas from the canonical source. Replace dump-based baselines with validated migrations and a baseline procedure for existing databases, then test both fresh installs and upgrades including SQL views and TimescaleDB objects.

**Acceptance:** Fresh and populated databases reach the same expected schema through the documented migration command, with drift checks and a tested recovery procedure.

**Code scope:** `shared/prisma/schema.prisma`, `services/auth/prisma/migrations/0_init/migration.sql`, `infra/postgres/init.sql`, `.github/workflows/ci.yml`.

### 11. R11 - Centralize Authorization and Tenant Policies (P2)

Corrected access checks are still duplicated and can diverge when new endpoints or roles are added.

Extract shared role and resource policies and a server-validated product-scope resolver for tenant-bound operations. Preserve explicit admin and active-membership rules from AUTHORIZATION.md, and keep header omission or null products from granting staff access.

**Acceptance:** A shared role/resource matrix covers all consumers, including omitted headers, no product assignments, null products, former members and unrelated staff.

**Code scope:** `docs/AUTHORIZATION.md`, `services/chat/src/common/product-access.ts`, `services/call/src/common/product-access.ts`, `services/media/src/common/product-access.ts`.

### 12. R12 - Consolidate Shared Infrastructure Modules (P2)

Prisma, Redis, RabbitMQ, JWT and HTTP-hardening implementations remain duplicated across services.

Extract shared configuration validation and infrastructure modules incrementally using the existing service interfaces. Preserve startup failure behavior, account revocation, connection cleanup and service-specific settings with regression tests.

**Acceptance:** Migrated services use the same tested implementations without changing authorization semantics or reintroducing secret fallbacks.

**Code scope:** `services/*/src/common`, `services/*/src/prisma`, `services/*/src/redis`.

### 13. R13 - Complete Strict Request Validation (P2)

Notification and bot-gateway still omit forbidNonWhitelisted while the other six services reject unexpected fields.

Enable strict validation in the remaining services and check their DTOs and existing producers for incompatible payloads. Add request-level tests for unknown properties, invalid enums, identifiers and numeric bounds across all services.

**Acceptance:** Unexpected properties and malformed typed input are consistently rejected without breaking valid service-to-service requests.

**Code scope:** `services/notification/src/main.ts`, `services/bot-gateway/src/main.ts`.

### 14. R14 - Finish Media Lifecycle and Worker Limits (P3)

Abandoned staging objects, previously stored unscanned media and thumbnail processing remain outside the completed upload-confirmation hardening.

Add storage lifecycle cleanup and a quarantine or rescan policy for legacy objects. Bound thumbnail and derivative processing by size, memory, duration and concurrency, and retain attachment authorization on every derived asset.

**Acceptance:** Abandoned uploads expire, legacy content has a documented disposition, and oversized or malformed derivatives cannot exhaust workers.

**Code scope:** `services/media/src/media/media.service.ts`, `services/media/src/minio/minio.service.ts`, `docs/P1_REMEDIATION.md`.

### 15. R15 - Audit Remaining Sensitive Logging (P3)

OTP removal and existing redaction do not establish consistent handling of PII, credentials and upstream error payloads across all services.

Inventory structured logs, request serializers, errors and response fields and standardize redaction and data minimization. Add tests for tokens, internal keys, phone numbers and nested upstream errors without removing necessary audit events.

**Acceptance:** Representative success and failure logs contain no usable credentials or unnecessary personal data, with documented retention and access rules.

**Code scope:** `services/*/src/app.module.ts`, `services/*/src/common`, `docs/AUTHORIZATION.md`.

### 16. R16 - Validate Production Network and Runtime Boundaries (P3)

Local infrastructure defaults and externally deployed LiveKit and storage endpoints are not a verified production deployment boundary.

Validate private routing, exact CORS origins, TLS, storage signing hostnames and restricted admin/metrics exposure in the deployment environment. Retain existing non-root service users and review remaining images, filesystem permissions and mounted credentials.

**Acceptance:** External probes reach only intended public endpoints, browser media URLs work over HTTPS/WSS, and runtime permissions are documented and tested.

**Code scope:** `docker-compose.yml`, `docker-compose.prod.yml`, `infra/traefik`, `infra/livekit`, `services/*/Dockerfile`.

### 17. R17 - Lock Dependency and Container Builds (P4)

Service and panel Dockerfiles still use npm install rather than the committed lockfiles.

Copy lockfiles and use npm ci in build stages, producing the intended production dependency set without disabling required generation steps. Pin base images, review required lifecycle scripts and triage dependency findings with explicit owners instead of unreviewed bulk upgrades.

**Acceptance:** Clean container builds consume lockfiles, fail on lock drift and have reproducible dependency inventories and reviewed security findings.

**Code scope:** `services/*/Dockerfile`, `operator-panel/Dockerfile`, `services/*/package-lock.json`, `operator-panel/package-lock.json`.

### 18. R18 - Complete Reliable CI and Regression Coverage (P4)

CI jobs exist, but a full clean-run pipeline and all user-facing workflows have not been verified, and some integration tests can pass without exercising authenticated flows.

Make test setup and service readiness deterministic, require authenticated fixtures for workflow suites and retain separate unauthenticated denial tests. Run builds, typechecks, unit, contract, SQL, authorization and selected real dependency scenarios with failure artifacts and retained browser tests.

**Acceptance:** The complete pipeline passes from a clean checkout without temporary overrides, skipped workflow assertions or suppressed drift/tool failures.

**Code scope:** `.github/workflows/ci.yml`, `tests/integration/call.test.ts`, `tests/integration/setup.ts`, `tests/integration/seed.sql`, `tests/sql/operator-kpi.sql`.

### 19. R19 - Gate Readiness on Usable Dependencies and Schema (P4)

The fresh-deployment failure showed that a healthy database process can coexist with an incomplete application schema.

Separate liveness from readiness and include migration/schema completion plus the dependencies required by each service. Make startup and CI waits fail with diagnostics when those prerequisites are unavailable rather than accepting a process-only health signal.

**Acceptance:** Incomplete initialization, failed migrations and required dependency outages prevent readiness and fail deployment checks.

**Code scope:** `docker-compose.yml`, `docker-compose.prod.yml`, `services/*/src/health`, `.github/workflows/ci.yml`.

### 20. R20 - Maintain Ownership, Runbooks and Evidence (P5)

Historical status claims and plans have drifted from implementation and do not provide release ownership or complete operational procedures.

Track these stable task IDs with an owner, target release, dependencies and links to passing acceptance evidence. Keep architecture, authorization, internal endpoint trust, key rotation, migration/recovery and test runbooks aligned with implementation; treat historical test totals as historical.

**Acceptance:** Every release-blocking item has an owner and evidence or an explicit unresolved status, and operators can follow tested deployment and recovery procedures.

**Code scope:** `docs/STATUS.md`, `docs/REMEDIATION_PLAN.md`, `docs/P1_REMEDIATION.md`, `docs/AUTHORIZATION.md`, `docs/TESTING.md`.

## Historical Coverage

This mapping prevents implemented original tasks from being silently dropped or incorrectly reopened. Numbers refer to the former 38-item plan.txt, preserved conceptually by the historical audit.

| Former task numbers | Current disposition |
| --- | --- |
| 1, 19 | Shared schema partially implemented; ownership and migration completion R10 |
| 2, 3, 7, 8, 9 | Authorization/product checks implemented at reviewed call sites; policy consolidation R11 and routing concurrency R09 |
| 4, 5, 6, 13 | Token and resource restrictions implemented; real proxy and call/media acceptance R01/R03/R05/R06 |
| 10, 29, 30 | Configuration and backend non-root improvements implemented; deployment G01-G02/R16 and reproducible builds R04/R17 |
| 11, 12, 18 | Authentication hardening, HTTP protections and single-flight refresh implemented; regression maintenance R18 |
| 14, 15, 16 | Internal start auth, HTTP route corrections and recording mapping implemented; remaining workflow/contract R01/R02/R05/R07 |
| 17, 27 | Raw-body and fail-closed verification implemented; deployed proxy acceptance R03 |
| 20, 21, 22 | Room enums aligned; shared modules R12 and remaining strict validation R13 |
| 23, 24, 25 | Timeout, transaction and claim work partially implemented; durability/concurrency R08/R09 |
| 26, 28 | Upload scanning and logging improvements implemented in part; real AV R06, lifecycle R14 and remaining log audit R15 |
| 31, 32, 33, 34 | CI/security tests exist; reproducibility R17, coverage R18 and readiness R19 |
| 35, 36, 37, 38 | Authorization and remediation docs exist; operational runbooks, ownership and evidence maintenance R20 |

## Completion Rules

Close a task only with its acceptance evidence linked to a commit/build and tested configuration. Keep implementation, mocked tests, real dependency tests and production rollout as separate statuses. Changes to authorization must preserve the policy in AUTHORIZATION.md or explicitly update that policy and its negative tests.
