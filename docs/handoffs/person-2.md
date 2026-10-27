# Person 2 handoff

- Status: READY
- Completed: Application liveness/readiness, CheckHealth RPC, shared CLI probe, bounded REST and native gRPC calls, assignment pre-write cancellation checks, request correlation and focused verification script. Healthy/failure/slow/recovery/cancellation checks passed on real isolated containers; DB-health error/timeout unit faults also passed.
- Files changed: Gateway/Department/Ticket source, `proto/ticket.proto`, `scripts/healthcheck.mjs`, `scripts/resilience-check.mjs`, README, `docs/discovery.md`, `docs/resilience.md`, `docs/diagrams/assign-ticket-sequence.mmd`, this handoff. Shared docs now point to the application-probe implementation; Person 1 DB paths/defaults are preserved.
- How to run: See `docs/resilience.md`; isolated Compose project `chula-fondue-person2` uses host port 31310.
- Verification: PASS for all TypeScript/image builds, application probes, lifecycle/error regression, stopped/paused dependency behavior, failure non-mutation, recovery, short caller deadlines/cancellation and matching request IDs across all three services. Measured values below are from this smoke run, not sustained performance benchmarks.
- Contract changes: CheckHealth adds service/databaseStatus fields alongside status; it is application-specific, not grpc.health.v1. Budgets are source constants (REST 2s, gRPC 3s, readiness 750ms). Person 1 wrapper delegates to the shared script unchanged.
- Remaining dependencies: Person 3 owns full NFR/performance measurement; Person 4 renders and integrates diagrams/proposal; Person 5 uses the tested demo. Those deliverables are not completed by this role.
- Next person: People 1/3/4/5 use resilience guide for concrete endpoint/RPC/timeout/error/log contracts and the actual evidence below. Rebuild older project images to obtain the new application probe.

## Environment and retained fixtures

- Verified on 2026-10-27 (Asia/Bangkok), Docker Engine 27.4.0 / Compose v2.31.0-desktop.2, using the Node 22 Linux arm64 images from Person 1's Dockerfile.
- Project: `chula-fondue-person2`, host Gateway `http://localhost:31310`. All 3 containers were healthy and no container was paused or stopped when the work finished. This project is left running for review.
- Separate volumes retain only this project's fixtures. Person 1's project at port 31300 and its databases were not changed by these tests.
- Department ID: `43de9486-26d4-497b-8c1b-db0542b61b17`.
- Successful lifecycle ticket: `3de4a38b-2505-4709-9612-1c0595c8adaa` (CLOSED after resolve/reopen/confirm checks).
- Failure fixture ticket: `38dd028f-4e8b-44de-91a2-6a51b40620c4` (SUBMITTED, original history unchanged after all failed/cancelled assignments).
- Expected state snapshot: `/tmp/chula-fondue-resilience.json` in Gateway. Keep that container if rerunning failure/recovery modes; `prepare` requires a fresh Gateway container without that snapshot. Database data is stored in volumes, independently of this temporary expected-state file.

## Actual verification

| Check | Result | Observed behavior |
| --- | --- | --- |
| `npm run build`; JS syntax; `git diff --check` | PASS | All three TypeScript workspaces and verification/probe scripts valid |
| `docker compose -p chula-fondue-person2 build` | PASS | All three images built with application code/proto/probe |
| `GATEWAY_PORT=31310 docker compose -p chula-fondue-person2 up -d --wait --wait-timeout 120` | PASS | All containers became healthy using the real application probe |
| `resilience-check.mjs prepare` | PASS | Department validation/conflict, ticket/history reads, create/assign/start/resolve/reopen/confirm, cancel/reject, 400/404/409 mappings and 8 concurrent request-ID echoes |
| DB-health query error / stuck query doubles | PASS | Department returns safe 503/down; Ticket returns NOT_SERVING/down. Never-resolving query completed its health check at 755 ms / 757 ms respectively |
| Department paused: `department-slow` | PASS | Readiness 503 in 815 ms, liveness 200, independent ticket route 200; REST proxy 504 in 2014 ms; assignment 504 in 2036 ms; ticket/history unchanged |
| Department stopped: `department-down` | PASS | Readiness 503 in 218 ms; REST proxy 503 in 11 ms; assignment 503 in 21 ms; ticket/history unchanged |
| Ticket paused: `ticket-slow` | PASS | Readiness 503 in 792 ms, liveness 200, Department route 200; Ticket list 504 in 3029 ms via native gRPC deadline |
| Ticket stopped: `ticket-down` | PASS | Readiness 503 in 22 ms; Ticket list 503 in 2 ms; Department route remains usable |
| Incoming caller deadline 400 ms with Department paused | PASS | gRPC DEADLINE_EXCEEDED (4), observed callback at 670 ms; original ticket/history unchanged |
| Explicit caller cancellation at 150 ms | PASS | gRPC CANCELLED (1), observed callback at 156 ms; original ticket/history unchanged |
| Recovery after all failure/cancellation phases | PASS | Both dependencies up; Gateway ready 200 (last check 20 ms); failure fixture unchanged, including after Department resumed |
| Person 1 wrapper delegates for each service | PASS | All three reported `PASS <service>: application readiness` |
| Host HTTP `/ready` with request ID | PASS | HTTP 200 and `x-request-id: person2-final-check`, both dependencies up |
| Cross-service log correlation | PASS | Same trace ID on Gateway dependency/request logs, Ticket RPC/Department lookup logs and Department HTTP logs; correct gRPC 4/1 for deadline/cancellation logs |

The local health timers/native deadlines are not hard real-time guarantees: the measured short-deadline callback included scheduling/startup overhead beyond its configured 400 ms. DB fault tests used controlled doubles of the query operation and the actual compiled health classes; no real DB was corrupted or disconnected for that unit check.

### Reproduction commands

Run from repository root. The guide lists all pause/stop/restore steps; always restore a dependency even if a check fails.

```bash
docker compose -p chula-fondue-person2 exec -T api-gateway node /app/scripts/resilience-check.mjs recover
docker compose -p chula-fondue-person2 exec -T department-service node /app/scripts/resilience-check.mjs db-health department-service
docker compose -p chula-fondue-person2 exec -T ticket-service node /app/scripts/resilience-check.mjs db-health ticket-service
docker compose -p chula-fondue-person2 exec -T api-gateway node /app/docker/healthcheck.mjs api-gateway
curl -i -H 'x-request-id: person2-final-check' http://localhost:31310/ready
```

`scripts/resilience-check.mjs` was extended with the `rpc-cancellation` phase after the image build and copied from the working tree to the running Gateway with `docker compose -p chula-fondue-person2 cp scripts/resilience-check.mjs api-gateway:/app/scripts/resilience-check.mjs`. Application runtime source did not change after the successful image build. A future `up --build` includes the final check script automatically.

### Log evidence for one assignment

Trace ID: `person2-4bc526a9-8eb1-4f2c-8d0b-310f55c7e038`.

```text
api-gateway        dependency_call assignTicket   grpcCode=0 durationMs=33
api-gateway        http_request    POST .../assign status=200 durationMs=34
ticket-service     dependency_call GetDepartment  grpcCode=0 durationMs=22
ticket-service     rpc_request     assignTicket   grpcCode=0 durationMs=29
department-service http_request    GET /departments/43de9486-26d4-497b-8c1b-db0542b61b17 status=200 durationMs=1
```

All five records carried the same trace ID. Other checks returned the expected non-success gRPC codes: NOT_FOUND=5, DEADLINE_EXCEEDED=4 and CANCELLED=1.

## Integration notes and limits

- Existing DB path variables, SQLite defaults, owned volumes, business RPCs/field numbers and ticket/history transactions are retained. No package versions or npm dependencies changed in this role.
- Gateway marks overall readiness 503 when a required dependency is down while continuing independent routes. Review this routing/readiness trade-off when choosing a production load balancer policy.
- There is no application mutation retry/idempotency system. Expired client deadline after commit can still mean an uncertain result; reconcile ticket/history before another mutation.
- `NOT_RUN`: Person 3's sustained p95/throughput/capacity measurements, 1,000-active-user model and uptime percentage.
- `NOT_RUN`: Diagram rendering/PDF assembly, frontend/Auth/JWT, PostgreSQL/RabbitMQ/notification implementation and production deployment.
- Person 1's older images at 31300 still use bootstrap probes until rebuilt. Use 31310 to inspect this role's completed health endpoints.

To stop this role's test setup while preserving its volumes:

```bash
docker compose -p chula-fondue-person2 down
```
