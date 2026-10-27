# Person 3 handoff

- Status: **READY_WITH_FINDING** — runner, NFR guide, raw evidence and measured results complete. Latest overall suite remains **FAIL** for one stopped-Ticket status expectation; this is an actual finding for Person 2, not a missing measurement.
- Files: `scripts/verification/{run,load,suites,audit}.mjs`, `docs/nfr-verification.md`, `docs/evidence/**`, this handoff, and a minimal README link to the report.
- Run: `node scripts/verification/run.mjs`; flags/modes and fixture lifecycle in [NFR guide](../nfr-verification.md).
- Latest evidence: [20261027t084152z-c1ab](../evidence/20261027t084152z-c1ab/report.md), 2026-10-27 08:41:52–08:45:22 UTC (15:41:52–15:45:22 Asia/Bangkok).
- Shared application contracts changed: **none**. No npm dependencies added. Local `.env` and service source are preserved. The runner uses existing Compose/proto/API/health contracts.

## Actual results

Both endpoint measurements used **100 tickets, 10s warm-up, 20 closed-loop workers and 60s measurement per endpoint**, separately and before functional mutations:

| Endpoint | Requests | req/s | p50 ms | p95 ms | p99 ms | Error | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/tickets` | 67,200 | 1,119.31 | 13.42 | 27.68 | 72.86 | 0% | PASS |
| `/tickets/:id/history` | 69,113 | 1,151.57 | 9.42 | 23.37 | 54.97 | 0% | PASS |

PASS: all actual TypeScript/image builds; fresh isolated fixtures; workflow/history/filters; 400/404/409; failure non-mutation; request ID across all three services; DNS and both container recreations through the original Gateway; retained fixture Department/ticket/history; application probes; raw CSV audit; Department stopped/frozen; Ticket frozen; restoration and shutdown.

FAIL: **Ticket stopped → GET `/tickets` returned 504 in 3,027.05ms rather than 503**. Reproduced across two complete runs. [Finding, evidence and follow-up](../evidence/20261027t084152z-c1ab/findings.md). Existing gRPC code-to-HTTP mapping and a stronger expectation about a stopped container are distinct; the transport cause has not been established. Keep this visible in the proposal/video and have Person 2 assess it.

The first full run is retained, including its FAILs. The runner then corrected trace capture order/ANSI JSON extraction and restoration blocked by stale Compose dependency health. The latest run verifies those corrections. Independent offline auditing of the first raw CSV also passed; it does not change that run's overall FAIL.

## Commands and environment

```bash
node --check scripts/verification/run.mjs
node --check scripts/verification/load.mjs
node --check scripts/verification/suites.mjs
node --check scripts/verification/audit.mjs
node scripts/verification/run.mjs --help
node scripts/verification/run.mjs
node scripts/verification/audit.mjs docs/evidence/20261027t084152z-c1ab
git diff --check
```

The full run orchestrates the exact Docker commands and records exit codes in `events.jsonl` and output in `commands.log`. Source/config SHA-256 values and image IDs accompany Git HEAD `52f2040e75afeb845b4bb3de10a40f4741aef818`, whose working tree is dirty. Application source is the same in both runs; the verification harness changed between runs. Docker/host access required the approved sandbox escalation.

Host: Apple M3 arm64, 8 logical CPUs, 16 GiB RAM; Docker Desktop Engine 27.4.0 / Compose 2.31.0-desktop.2, VM 8 CPUs / approximately 11.67 GiB RAM. Host Node v24.4.1; container Node v22.23.4; SQLite. Person 1/2 plus `ocr`/`backend` Compose projects ran concurrently. These shared resources and the host load generator limit capacity inference. Maximum client latency exceeded 1s in each endpoint despite passing the p95 target; see the guide and full JSON.

## Retained fixtures and review

Latest project: `chula-fondue-person3-20261027t084152z-c1ab`; port 31320. All four faults restored their dependency and final readiness was 200 before normal `down`. Its containers/network are removed; both named SQLite volumes remain. People 1/2 projects and local databases were not targeted.

- Department: `6d321167-f0b0-4887-925e-f56c2cdc6221`.
- Lifecycle CLOSED ticket: `70fce266-7351-4c3c-9663-1e9140481277`.
- Failure SUBMITTED ticket: `8dc778b5-f16a-4b8d-a94d-0960a2c92cf6`; ticket/history unchanged through all failed Department assignments and subsequent recovery checks.
- Benchmark snapshots: 100 tickets before measurement, 20 ASSIGNED/80 SUBMITTED; after functional checks 104 total/103 visible. Full IDs in `fixtures.json` and `functional.json`.
- Correlation: `person3-trace-7ac202c6-32b1-47de-81af-b500918718d4`; 5 structured records in `request-correlation.json`.

For inspection only, start the retained project with its existing images/volumes:

```bash
GATEWAY_PORT=31320 docker compose -p chula-fondue-person3-20261027t084152z-c1ab up -d --wait --wait-timeout 120
docker compose -p chula-fondue-person3-20261027t084152z-c1ab down
```

A new runner invocation always creates a fresh project. It refuses existing project containers/volumes, does not run `down -v`, and supports `--keep-up` for future interactive review. Do not delete other projects' volumes to rerun tests.

## Next people and remaining scope

- Person 2: assess the repeated stopped-Ticket 504 finding; preserve the strict FAIL until resolved or an explicit contract revision is agreed and tested.
- Person 4: use the latest table with the measured environment, workload and open finding in the proposal/NFR matrix. Keep SQLite/local Compose implemented and production targets separate.
- Person 5: use discovery, failure, recovery and correlation evidence for the <5min video. Say performance targets passed for this local test and one strict error-classification check failed; do not say the whole suite passed.
- `NOT_RUN`: 1,000-user capacity, 99.5% uptime observation, soak/open-loop/concurrent-write load, actual network delay/packet loss, HA/cloud/multi-host deployment, backup/restore and security assessment. Proposal/PDF/diagram rendering and completed video remain roles 4/5 deliverables.
