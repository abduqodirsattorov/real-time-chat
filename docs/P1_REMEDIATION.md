# P1 Remediation

This file records implementation and verification evidence, not a claim that all P1 tasks are closed.
The active backlog and release gates are maintained in [REMEDIATION_PLAN.md](REMEDIATION_PLAN.md);
the developer handoff is [plan.txt](../plan.txt). Last synchronized: 2026-09-14.

## Production Configuration

`docker-compose.prod.yml` uses an externally deployed LiveKit server and Egress workers. Configure `LIVEKIT_HOST` with the HTTP(S) API endpoint reachable by call-service and recording-service, and `LIVEKIT_WS_URL` with the public `wss://` endpoint reachable by clients. `LIVEKIT_URL` is not used. Both services must use the API key and secret configured on that server.

Set `MINIO_PUBLIC_ENDPOINT` to the HTTPS S3 endpoint reachable by clients. Media and recording services sign URLs for this hostname; internal data operations continue using Docker DNS. The production Compose file does not provision the external LiveKit deployment or the public S3 reverse proxy.

The Compose file now starts ClamAV on the private network, persists its signature database and waits for its healthcheck before starting media-service. ClamD accepts streams up to 100 MiB and rejects files that exceed its scan limits. Initial signature loading can take several minutes. Allocate sufficient RAM to ClamAV; the [official Docker documentation](https://docs.clamav.net/manual/Installing/Docker.html) recommends 4 GiB.

Redis healthchecks receive credentials through `REDISCLI_AUTH`. MinIO initialization receives credentials, creates private buckets and must complete before media-service starts. Auth, chat, call, presence and media receive the missing infrastructure credentials identified during this pass.

```sh
node scripts/validate-prod-secrets.js
node --test scripts/production-config.test.js
docker compose -f docker-compose.prod.yml config --quiet
```

Export production secrets and endpoint settings before the preflight and Compose commands. Configuration tests use uninterpolated Compose data and synthetic credentials; they do not require production secrets.

## Media Validation

Direct uploads land under `uploads/`. Confirmation checks the stored size against the upload session and MIME limit, then streams the object to a private temporary file with an enforced byte limit. MIME detection and antivirus scanning operate on this snapshot. Only a successful scan allows publication under a fresh key that has never had a client upload URL, preventing replacement through the original presigned PUT URL.

Unknown or mismatched MIME types are rejected. WAV, Ogg Opus and WebM use explicit container aliases. Formats that the installed detector cannot identify reliably are rejected, including generic legacy Office containers. Voice uploads use the same MIME and antivirus checks before storage or URL issuance.

The scanner implements [ClamD INSTREAM framing](https://docs.clamav.net/manual/Usage/ClamdProtocol.html), bounded writes and a deadline. Only a complete clean verdict is accepted. Malware returns HTTP 400; unavailable, timed-out or malformed scanner responses return HTTP 503. Production startup and runtime reject disabled scanning. Local development Compose explicitly defaults to development mode with scanning disabled.

Temporary snapshots are deleted on success and failure. Configure storage lifecycle cleanup for abandoned objects under `uploads/`, including objects re-uploaded through an unexpired PUT URL after confirmation. Existing attachment objects are not retroactively scanned. The streaming change covers upload confirmation; thumbnail workers still have separate processing and memory requirements.

## Recording Failures and Access

Recording-service verifies that the recording, call and LiveKit room match before starting Egress. An Egress startup failure marks the recording failed and returns HTTP 503. Call-service propagates startup failures, applies a request timeout and does not publish a successful recording-start event for failed responses.

Supervisor downloads now require product access unless the supervisor directly owns or participates in the recording. Unrelated staff cannot list recordings of calls without a product. Recording download URLs use `MINIO_PUBLIC_ENDPOINT` and signing failures return an error instead of an empty URL.

## Verification Scope

CI checks production configuration and uses `npm ci` without an `npm install` fallback. Media tests exercise actual filesystem streams and a local TCP protocol fixture, including fragmented verdicts, malware names containing `OK`, scanner errors, disconnects and timeouts. Call and recording tests cover failed Egress startup and recording access.

These checks do not replace an end-to-end deployment test with real ClamAV signatures, LiveKit/Egress, MinIO and production networking. A recording start timeout can have an uncertain remote outcome and requires reconciliation with Egress before retrying; this change does not implement a distributed recording job state machine.

## Operator Recording Controls (2026-09-14)

The panel normalizes the backend start response (`recordingId`) to the local recording model (`id`). Consent acknowledgments use that ID. Recording mutations disable the controls while pending, ignore late responses for a different call, and reconcile failures through the authorized recording-list endpoint. If reconciliation fails, further mutations stay blocked until an explicit status refresh succeeds. A failed stop request no longer hides the recording locally.

Eight Vitest tests exercise the real Axios client and Pinia store against backend-shaped fixtures. The panel build and tests pass. A temporary Playwright harness also passed at 1280 px and 375 px using the real recording component with mocked HTTP responses, including stop failure and status recovery. This is component verification, not a real audio or Egress test. CI now runs panel tests and its production build.

## Clean Database and HTTP Verification (2026-09-14)

A fresh Docker deployment exposed an existing failure in `infra/postgres/init.sql`: the correlated transfer-count subquery in `v_operator_kpi_daily` referenced an ungrouped call timestamp. PostgreSQL subsequently restarted with a partial schema and appeared healthy. The view now aggregates calls and transfers independently before joining by operator and date. The entire initialization script passed on a separate clean TimescaleDB/PostgreSQL 16 database. `tests/sql/operator-kpi.sql` verifies counts, averages, operator/date isolation and zero transfers in a rolled-back transaction.

`tests/integration/seed.sql` explicitly provisions test accounts and an operator product assignment. It must only be used on disposable test databases and is never mounted as a production initializer. The test setup now resolves the repository path portably. CI runs the SQL regression and seed, and generates matching internal/webhook keys for services and tests.

The `authorization.test.ts` and `security.test.ts` suites passed together: 59 tests through the running local HTTP services. Both suites used the same webhook secret as the services. This validates the assertions in those suites, not all API workflows or the entire CI pipeline.

The initial image pull for `minio/minio:latest` was denied by the registry. Local verification used a temporary Compose override with the already available `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z` image and `quay.io/minio/mc:latest`. Those substitutions are not committed deployment defaults. Selecting and pinning accessible images remains open. The disposable Compose project was `rtc-remediation`; no production data was used.

## Next Verification Work

Use the stable task IDs in [the active plan](REMEDIATION_PLAN.md) instead of a separate completion checklist:

1. R01-R03: outbound participant tokens, Egress failure propagation/reconciliation and actual Centrifugo proxy authentication.
2. R04-R06: accessible pinned images, real call/recording acceptance including Flutter, and real ClamAV/private media acceptance.
3. R07-R13: API contracts, durable deadlines, atomic call/queue transitions, executable migrations, shared policies/modules and remaining strict validation.
4. R14-R20: media lifecycle, logging, deployment boundaries, locked builds, full CI, readiness and runbooks.

G01-G03 remain mandatory before release: deployed secret rotation, legacy token/session revocation and reviewed tenant ownership for legacy data. The documentation update itself reran no tests and performed no production rollout.
