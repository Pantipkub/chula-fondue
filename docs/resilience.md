# Health, Resilience and Request Correlation

## Scope

Person 2 adds application health/readiness and bounded service calls to the existing three-service prototype. The DB path settings and parent-directory creation supplied by Person 1 are preserved. There are no new npm dependencies, business statuses or database fields.

Actual verification results and remaining work are in [Person 2 handoff](handoffs/person-2.md). This document describes implemented contracts; it is not a performance or uptime report.

## Health contract

| Service | Check | Healthy | Not ready |
| --- | --- | --- | --- |
| Gateway | `GET /health` | HTTP 200, `{ "status": "ok", "service": "api-gateway" }` | Indicates that its HTTP process answers, independent of dependencies |
| Gateway | `GET /ready` | HTTP 200, `status=ready`, Department/Ticket both `up` | HTTP 503, `status=not_ready`, separate dependency status and safe reason |
| Department | `GET /health` | HTTP 200, `status=ok` | Liveness does not query the DB |
| Department | `GET /ready` | HTTP 200 after `SELECT 1`, database `up` | HTTP 503 with database `down`; internal DB errors are omitted |
| Ticket | `ticket.TicketService/CheckHealth` | gRPC OK with `status=SERVING`, `service=ticket-service`, `databaseStatus=up` | gRPC OK with `status=NOT_SERVING`, `databaseStatus=down`, or a transport error if the service is unreachable |

Example Gateway readiness response:

```json
{"status":"ready","service":"api-gateway","dependencies":{"department":{"status":"up"},"ticket":{"status":"up"}}}
```

When a dependency is unavailable, Gateway remains live. Its overall readiness becomes 503, but independent working routes are still served. For example, Ticket history/list can work while Department is down. A caller or deployment platform must decide how it uses readiness when some routes are degraded.

`CheckHealth` is an application-specific unary RPC added to the existing `ticket` service. It is not the standard `grpc.health.v1.Health` protocol. Existing RPCs and message field numbers are preserved.

## Budgets and failure mappings

| Call/check | Budget |
| --- | --- |
| Gateway -> Department business REST call | 2,000 ms for fetch and complete response body |
| Gateway -> Ticket RPC | Native gRPC deadline at call start + 3,000 ms |
| Ticket -> Department lookup | At most 2,000 ms, shortened to remaining incoming gRPC deadline minus a 25 ms margin |
| Gateway readiness dependency checks | 750 ms each, in parallel |
| Department/Ticket DB readiness query | 750 ms |
| Shared healthcheck CLI | 2,000 ms HTTP/gRPC transport limit |
| Person 1 Docker wrapper | 4,000 ms child-process limit; Compose healthcheck limit 5 seconds |

These are prototype constants in the client/health source files, not additional `.env` keys. Timers and client deadlines bound asynchronous waits; they cannot interrupt a synchronously blocked Node event loop, and local scheduling can add a small response delay.

| Failure | Ticket gRPC code where applicable | Gateway HTTP |
| --- | --- | --- |
| Invalid request | INVALID_ARGUMENT | 400 |
| Ticket/department missing | NOT_FOUND | 404 |
| Invalid ticket status transition | FAILED_PRECONDITION | 409 |
| Department unreachable/non-success server error | UNAVAILABLE | 503 |
| Ticket unreachable | UNAVAILABLE | 503 |
| REST lookup/proxy timeout | DEADLINE_EXCEEDED for Ticket lookup | 504 |
| Gateway -> Ticket deadline exceeded | DEADLINE_EXCEEDED | 504 |
| Backend cancellation returned to a waiting caller | CANCELLED | 503 |
| Other internal RPC failures | Unmapped/internal | 500 |

Normal Department REST response codes/bodies are forwarded by Gateway. Response-body reading stays within the REST timeout. An aborted network/body read is reported as 504; connection failure is 503.

There is no application-level automatic retry. Gateway disables gRPC retries on its channel. Reconnection is separate from re-executing an operation. Mutation retries require an idempotency design before they can be added safely.

## Assignment and data integrity

1. Load and validate the current ticket state.
2. Look up Department with a bounded request, propagating the request ID.
3. Check incoming deadline/cancellation before changing/saving the assignment.
4. Save ticket and history in the existing transaction, with an additional active-call check before the first write.
5. Log the existing notification stub after commit.

If Department lookup fails or times out before commit, the ticket and its history remain unchanged. gRPC cancellation also aborts a pending Department fetch. A deadline expiring after a transaction has begun or committed cannot guarantee that the operation was rolled back: the caller should reconcile the ticket/history before deciding on another mutation. These checks are not a general idempotency or distributed transaction mechanism.

See [Assign Ticket sequence](diagrams/assign-ticket-sequence.mmd).

## Request correlation and logs

- Incoming HTTP `x-request-id` is accepted only if it matches `[a-zA-Z0-9._-]{1,100}`; otherwise a UUID is generated. Gateway and Department echo the effective ID in the response header.
- Gateway propagates the ID in Department HTTP headers and Ticket gRPC metadata. Ticket's interceptor establishes an `AsyncLocalStorage` context for each RPC and propagates it to its Department HTTP lookup.
- Structured log records contain `event`, `service`, `requestId`, `operation`, `durationMs`, and an HTTP status or gRPC code. Dependency logs also name the destination service.
- The new request/dependency logs omit bodies, query strings, credentials and full configuration. The existing NotificationStub still has its original email-oriented log; that stub is not a mail delivery or notification persistence implementation.
- This is request correlation, not a full OpenTelemetry tracing system. Direct gRPC callers can provide the same metadata key; otherwise Ticket generates an ID for that RPC's logs.

Example for host requests:

```bash
curl -i -H 'x-request-id: demo-assignment-001' http://localhost:31310/ready
```

## Health probe and Compose integration

```bash
node scripts/healthcheck.mjs api-gateway
node scripts/healthcheck.mjs department-service
node scripts/healthcheck.mjs ticket-service
```

The probe targets the named service on loopback using `GATEWAY_PORT`, `DEPARTMENT_PORT` or `TICKET_GRPC_URL` as applicable. HTTP uses `/ready`; Ticket uses `CheckHealth` with a deadline. Exit 0 means ready and non-zero means not ready, invalid target, or transport failure.

Rebuild images to include this new script and the updated proto/source. Person 1's `docker/healthcheck.mjs` automatically delegates to it; Compose configuration does not need a new command.

```bash
GATEWAY_PORT=31310 docker compose -p chula-fondue-person2 up --build -d --wait --wait-timeout 120
docker compose -p chula-fondue-person2 ps
docker compose -p chula-fondue-person2 exec -T api-gateway node /app/docker/healthcheck.mjs api-gateway
```

The separate project avoids modifying Person 1's retained fixtures. A negative Gateway readiness result is expected during failure tests and can make its Compose health status unhealthy; liveness/other routes remain inspectable. Compose does not restart a merely unhealthy running container automatically.

## Focused checks and repeatable failure demo

`scripts/resilience-check.mjs` is Person 2's focused smoke/fault check, not Person 3's performance runner. It runs inside Gateway for HTTP checks and writes expected fixture state to its `/tmp`. Use a fresh Gateway container before another `prepare`, or reuse the prepared fixture for failure/recovery checks.

```bash
docker compose -p chula-fondue-person2 exec -T api-gateway node /app/scripts/resilience-check.mjs prepare
```

This checks ready/liveness, Department validation/conflict, ticket lifecycle/error mappings, missing-department non-mutation and concurrent request ID echoes. It creates isolated test records and prints the trace ID for a successful Gateway -> Ticket -> Department assignment.

Run these phases one at a time, restoring the dependency even if a check fails:

```bash
docker pause chula-fondue-person2-department-service-1
docker compose -p chula-fondue-person2 exec -T api-gateway node /app/scripts/resilience-check.mjs department-slow
docker unpause chula-fondue-person2-department-service-1

docker compose -p chula-fondue-person2 stop department-service
docker compose -p chula-fondue-person2 exec -T api-gateway node /app/scripts/resilience-check.mjs department-down
docker compose -p chula-fondue-person2 start department-service

docker pause chula-fondue-person2-ticket-service-1
docker compose -p chula-fondue-person2 exec -T api-gateway node /app/scripts/resilience-check.mjs ticket-slow
docker unpause chula-fondue-person2-ticket-service-1

docker compose -p chula-fondue-person2 stop ticket-service
docker compose -p chula-fondue-person2 exec -T api-gateway node /app/scripts/resilience-check.mjs ticket-down
docker compose -p chula-fondue-person2 start ticket-service
```

Before a phase that expects the other dependency healthy, wait for normal health/probe responses. After both dependencies return:

```bash
docker compose -p chula-fondue-person2 exec -T api-gateway node /app/scripts/resilience-check.mjs recover
```

The slow Department phase verifies both REST proxy and assignment fail near the 2-second budget with unchanged ticket/history; the slow Ticket phase verifies the real 3-second gRPC deadline. Stopped dependencies should produce 503, not hang. The check allows scheduling tolerance and separately verifies the independent route and liveness.

Controlled database-health unit faults use the actual compiled health classes, with query-error and never-resolving-query doubles. They do not corrupt a real database:

```bash
docker compose -p chula-fondue-person2 exec -T department-service node /app/scripts/resilience-check.mjs db-health department-service
docker compose -p chula-fondue-person2 exec -T ticket-service node /app/scripts/resilience-check.mjs db-health ticket-service
```

To check a short incoming gRPC deadline and explicit caller cancellation, pause Department, run the following inside Gateway, then unpause Department and run `recover` again to check for late writes:

```bash
docker compose -p chula-fondue-person2 exec -T api-gateway node /app/scripts/resilience-check.mjs rpc-cancellation
```

This uses a 400 ms caller deadline and a second call cancelled after 150 ms. It validates error codes and unchanged fixture state. It does not claim that a caller can undo a transaction already committed.

Use `docker compose -p chula-fondue-person2 logs` and the printed trace ID to verify all three service logs. Stop this project with `docker compose -p chula-fondue-person2 down` to retain its named volumes. No test here establishes sustained performance, 1,000-user capacity, HA or an uptime percentage.

## References

- [NestJS gRPC clients and metadata](https://docs.nestjs.com/microservices/grpc)
- [gRPC deadlines and cancellation](https://grpc.io/docs/guides/deadlines/)
