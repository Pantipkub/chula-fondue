# Progress 3: Architecture Decision Records

These are drafts to copy into the "Project description and ADRs" Google Doc (Progress 3 tab). An ADR's status records the decision only (Proposed / Accepted). Whether the code is implemented and tested is tracked separately in [README.md §2](README.md#2-status).

---

## ADR-009: Service discovery with Docker Compose DNS

**Status:** Proposed (the team marks it Accepted after review)

**Context.** In Progress 2 every service found its dependencies through `localhost:<port>` defaults, so it only worked with all processes on one host. Progress 3 must show how services find each other, and that they still find each other when one is replaced and its address changes. The demo runs on one machine, and the team has no orchestrator.

**Decision.** Run every service in one Docker Compose project on a user-defined network, `fondue-backend`. A service finds another by its **Compose service name**, which Docker's embedded DNS resolves to the container's current IP:

| Caller | Target address (environment variable) | Protocol |
| --- | --- | --- |
| api-gateway | `AUTH_SERVICE_URL=http://auth-service:3002` | REST |
| api-gateway | `DEPARTMENT_SERVICE_URL=http://department-service:3001` | REST |
| api-gateway | `TICKET_SERVICE_URL=dns:///ticket-service:50051` | gRPC |
| ticket-service | `DEPARTMENT_SERVICE_URL=http://department-service:3001` | REST |
| ticket-service, notification-service | `RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672` | AMQP |

Addresses live in configuration (Compose `environment`), never in code, and never as IPs. The defaults in code remain `localhost`, so `npm run dev` still works.

The gRPC client is told to look the name up again soon after a lost connection (`grpc.dns_min_time_between_resolutions_ms = 1000`). The grpc-js default is 30 s. Measured in the sandbox: a ticket-service at a new address was reached 0.14 s after it started with the setting, and about 25 s after it started without it.

**Discovery ≠ readiness.** DNS only answers "where is it?". Whether a service can do its work is answered by its `/health/ready` endpoint (ADR-010), which Docker healthchecks and the gateway's own `/health/ready` use.

**Alternatives considered.**

| Option | Why not now |
| --- | --- |
| Fixed IPs / `localhost` | Breaks as soon as a container is re-created or moved |
| Consul / Eureka (client-side registry) | Another component to run and secure, plus registration code in every service. Not justified for one host |
| Kubernetes Services | Same DNS-based idea at cluster scale, but no cluster is available for the course |
| Gateway-side static routing table | Still needs addresses, which only moves the problem |

**Consequences.**

- (+) No registry to run. Replacing a container needs no configuration change and no gateway restart (demo D1–D6).
- (+) The only published application port is the gateway. Internal services become unreachable from outside, which supports ADR-008.
- (−) Single host only. There is no load balancing over replicas (Docker DNS round-robin exists, but clients pin connections).
- (−) Clients must handle reconnection themselves (ADR-010).
- If the course requires a dedicated service registry, Consul can be added later without changing the services' configuration style.

---

## ADR-010: Timeouts, reconnection, acknowledgement and duplicate events

**Status:** Proposed

**Context.** Once services can disappear and come back (ADR-009), every call needs a bound on how long it waits, and every connection needs a way to come back. In Progress 2 a hanging Department Service made the gateway request hang, and Notification Service crashed if RabbitMQ dropped during a retry.

**Decision.**

| Path | Rule |
| --- | --- |
| Gateway → REST services | 5 s timeout (`REST_TIMEOUT_MS`). No connection → **503**, no answer in time → **504** |
| Gateway → Ticket Service (gRPC) | 5 s deadline per call (`GRPC_TIMEOUT_MS`). UNAVAILABLE → 503, DEADLINE_EXCEEDED → 504. Reconnect backoff 0.5–3 s, DNS re-resolution after 1 s |
| Ticket → Department (REST) | 3 s timeout (`DEPARTMENT_TIMEOUT_MS`), shorter than the gateway's deadline, so the precise error arrives first |
| Both sides ↔ RabbitMQ | heartbeat 5 s, reconnect every 2 s (amqp-connection-manager). Ticket Service connects at startup, so readiness can report the broker |
| Publishing | Persistent message on a durable queue with a publisher confirm. Every event has an `eventId` (UUID) and the `requestId` |
| Consuming | Manual ack after the MongoDB write, prefetch 10. On a storage error: nack + requeue after 5 s. If the channel closed before ack/nack, do nothing: RabbitMQ redelivers |
| Duplicates | Delivery is at-least-once, so the consumer writes with `upsert` keyed by `eventId` (unique sparse index). A second delivery is logged as `Duplicate ignored` and acked |
| Health | Every service has `/health` (liveness) and `/health/ready` (readiness with its own dependencies). Docker healthchecks use readiness for services and liveness for the gateway, so a downstream outage never restarts the gateway |
| Startup | `depends_on: service_healthy` orders the first start only. TypeORM retries the DB 20 × 3 s. `restart: unless-stopped` covers the rest |

**Alternatives considered.** Circuit breaker (e.g. opossum): useful with real traffic, but it adds state that would hide the recovery behaviour in a demo. Kept as a next step. Retrying failed calls at the gateway: rejected for now, because non-idempotent requests (assign, resolve) could be applied twice.

**Consequences.**

- (+) Every failure is a bounded, explicit 503/504 instead of a hang. Services come back without restarts.
- (−) **Known gap:** the status change is committed before the event is published. If the broker is down at that moment, the event is lost (it is logged). Fix: a transactional outbox table in the ticket database plus a relay. Planned.
- (−) No dead-letter queue: a message that can never be stored is retried forever.

---

## ADR-011: How NFRs are measured and what evidence is kept

**Status:** Proposed

**Context.** Progress 2 stated NFRs (uptime 99.5 %, 1,000 active users, page < 2 s, upload < 3 s) with no way to check them. Progress 3 must show evidence and keep measured results apart from targets.

**Decision.**

1. Every NFR is written as **scenario + metric + pass criterion** (README §4), with percentiles instead of averages (p95).
2. Each NFR has a script in `demo-progress3/` that prints every command and response, checks the expected outcome, and saves a timestamped log under `demo-progress3/evidence/` with the branch and commit.
3. Performance uses **k6** (`perf/ticket-history.k6.js`): 15 s warm-up, then 50 VUs for 60 s on `GET /tickets/:id/history` through the gateway. Thresholds p95 < 1 s and errors < 1 % apply to the steady phase only. The run records the machine, Docker version and the number of tickets in the database.
4. Observability: one `X-Request-Id` per request, created or accepted at the gateway, passed in HTTP headers, gRPC metadata and the event, and logged by every service with the `eventId`. Successful reads are not logged, so load tests stay readable.
5. Reports use three states: **Implemented** (code exists), **Verified** (a saved log shows it), **Planned**. Numbers from another machine or mode (e.g. host mode instead of Docker) are not reported as results.

**Consequences.**

- (+) Every claim in the video and the document can point to a log file.
- (−) Lab numbers from one laptop say nothing about production capacity. The 1,000-user and 99.5 % targets stay targets until a workload model and monitoring exist.

---

## Proposed edits to existing ADRs

These are the corrections the Progress 3 plan asks for, written from what the code on this branch does. Check them against the current wording in the Google Doc before replacing anything.

| ADR | Proposed change |
| --- | --- |
| ADR-004 and ADR-006 (notifications) | State one path only: Ticket Service publishes `ticket.status_changed` to the durable RabbitMQ queue `notifications`, and Notification Service consumes it with manual ack and records it in MongoDB. Add `eventId`/`requestId` and duplicate handling (ADR-010). Email sending is Planned |
| ADR-005 (gRPC) | Keep gRPC for Gateway ↔ Ticket Service only. **Remove** the Notification-over-gRPC / Gmail path, which contradicts ADR-004/006. Add the 5 s deadline and the reconnect settings |
| ADR-007 (PostgreSQL) | The document says Render, the README says Neon with a local fallback, and the team's current `.env` uses the local container. Decide which one the demo uses and write that. Database-per-service stays |
| ADR-008 (authentication / authorization) | Add: tokens are checked only at the gateway (HS256, 1-day expiry), with role checks per route plus ownership checks (Reporter: own tickets, Staff: own department). Internal services trust the gateway, which is acceptable **only** because Compose publishes no internal port (`security-test.sh` S10). Known risks: guest tokens read any ticket by id, no login rate limit |
| UC-05 (in the use-case document) | Remove the Gmail postcondition, or mark it Planned, to match the decision to defer email |
