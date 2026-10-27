# Progress 3: Service Discovery and Non-Functional Requirements

Branch `feature/progress-3-discovery-nfr`, built on Progress 2 (`feature/business-use-cases`, commit `3cf4ca1`).

**What this round adds:** the five services now run as containers on one Docker network and find each other by name. Each service reports its own health. Calls between services have timeouts and reconnect when a service comes back. Each NFR has a script that tests it and saves the output as evidence.

Related files:

- [adr.md](adr.md): new ADR-009 to ADR-011 and the proposed edits to ADR-004 to ADR-008
- [diagrams.md](diagrams.md): the four diagrams (Mermaid sources and PNGs in `diagrams/`)
- [`docker-compose.yml`](../../docker-compose.yml), [`docker/Dockerfile`](../../docker/Dockerfile)
- [`demo-progress3/`](../../demo-progress3): the test and demo scripts. Each run writes a log to `demo-progress3/evidence/`

## 1. What changed since Progress 2

| Area | Progress 2 | Progress 3 |
| --- | --- | --- |
| Runtime | Only RabbitMQ and PostgreSQL in Docker; services started on the host with `npm run dev` | All services, RabbitMQ, PostgreSQL and a local MongoDB in Docker Compose (`npm run dev` still works) |
| Finding services | `localhost:<port>` defaults | Docker DNS names set through environment variables (`http://auth-service:3002`, `dns:///ticket-service:50051`, `amqp://rabbitmq:5672`) |
| Exposure | Every service port open on the host | Only the gateway (`:3000`) is published; infrastructure ports are bound to `127.0.0.1` |
| Health | none | `/health` (liveness) and `/health/ready` (readiness) on every service; gateway readiness checks the three services behind it |
| Timeouts | none: a hanging service hung the request | REST 5 s (gateway), REST 3 s (ticket → department), gRPC 5 s deadline; answers 503/504 |
| Reconnect | gRPC client re-resolved DNS at most every 30 s | gRPC re-resolves after 1 s; RabbitMQ heartbeat 5 s and reconnect every 2 s on both sides |
| Events | no id | `eventId` and `requestId` in every `ticket.status_changed` event; the consumer ignores duplicates |
| Tracing | none | `X-Request-Id` created at the gateway, passed in HTTP headers, gRPC metadata and the event, and logged by every service |
| Notification Service | crashed if the broker dropped while a retry was pending; never reconnected if MongoDB was down at its first write | Both fixed (see §6) |

## 2. Status

How to read the columns: **Implemented** means the code is on this branch. **Checked in the sandbox** is what was run while building this branch. The sandbox could not download images from Docker Hub, so it ran the app containers on a stand-in Node base image, with PostgreSQL and RabbitMQ forwarded from outside the network and no MongoDB. These checks show that the code and scripts work. **They are not the results for the report**: only the team's own runs in the real Compose stack count, and those runs also save the evidence logs.

| Item | Implemented | Checked in the sandbox | Still to do (team) |
| --- | --- | --- | --- |
| Container images and Compose stack | yes | All 5 images built from `docker/Dockerfile`. All app containers reached `healthy`, and the gateway readiness check reported all three services `up` | `docker compose up -d --build` with the real images (node:22-alpine, rabbitmq, postgres, mongo) |
| Discovery by DNS name: gRPC | yes | `discovery-demo.sh` passed twice. ticket-service IP 172.18.0.10 → .8, then .8 → .10. 503 in < 5 ms during the outage. Answering again 1.8–2.3 s after `up`. No gateway restart or config change. Without the 1 s DNS re-resolution setting, recovery took ≈ 25 s | Run `discovery-demo.sh` and keep the log |
| Discovery by DNS name: REST | yes | department-service replaced with a new IP (.5 → .8): gateway 503 while gone, 200 again 0.9 s after `up` | covered by the demo above, optional |
| Health and readiness endpoints | yes | All endpoints answer. Readiness turns `not_ready`/`degraded` when a dependency stops. Docker healthchecks drive `depends_on` | n/a |
| Timeouts and controlled errors | yes | Department down → 503 in 25 ms. Department hanging → 504 after 3.0 s (assign) and 5.0 s (proxy). Ticket down → 503 | n/a |
| RabbitMQ reconnect | yes | Broker restarted. Ticket Service went `degraded` and back to `ready`, and Notification Service re-attached its consumer without restarting | Optional: `docker compose restart rabbitmq` during the video |
| Consumer outage (events wait) | yes (from Progress 2) | `reliability-demo.sh` (with a docker stand-in): ticket ASSIGNED while Notification was down, the event waited, the request id appeared in all 3 services. **Not checked:** the MongoDB record (no MongoDB available) | Run `reliability-demo.sh` (needs MongoDB: Atlas or the `mongo` container) |
| Duplicate event handling | yes | Compiles. Not exercised: it needs MongoDB | Optional manual test: kill notification-service right after a write, before the ack |
| Security S1–S10 | gateway rules from Progress 2, network boundary new | `security-test.sh` in the container stack: ALL CHECKS PASSED, S10 included (3001, 3002, 8081, 50051 unreachable from the host). The same script in host mode correctly fails S10 | Run `security-test.sh` and keep the log |
| Performance test | yes (k6 script) | Script runs. Sandbox trial: p95 ≈ 98 ms at 50 VUs, but in host mode on a 2-CPU sandbox, **so it is not a result** | Run `perf-test.sh` on the demo machine, record machine and numbers |
| ADR / design / diagrams | drafted | n/a | Team review, then copy into the Google Docs (Progress 3 tab) |
| Video | n/a | n/a | Record per the plan |

## 3. Revised microservice design

| Service | Responsibility | Interface (port) | Discovery name | Data owned | Health | When a dependency fails |
| --- | --- | --- | --- | --- | --- | --- |
| api-gateway | Single entry point: JWT check, role and ownership rules, photo upload, forwarding | REST `:3000` (only published port) | `api-gateway` | none (photos in Cloudinary or local folder) | `/health` (Docker), `/health/ready` checks auth, department and ticket | Auth/Department down → 503, slow → 504 after 5 s. Ticket down → 503, slow → 504 after 5 s. Reconnects on its own |
| auth-service | Accounts, password hashing, token issuing, Admin seeding | REST `:3002` | `auth-service` | PostgreSQL `auth` | `/health/ready` = DB answers | DB down at start: TypeORM retries 20 × 3 s, then Docker restarts the container |
| department-service | Department CRUD | REST `:3001` | `department-service` | PostgreSQL `department` | `/health/ready` = DB answers | as auth-service |
| ticket-service | Ticket lifecycle and history, status-change events | gRPC `:50051`, health HTTP `:8081` | `ticket-service` | PostgreSQL `ticket` | `/health/ready` = DB answers; `degraded` when RabbitMQ is down | Department down/slow → UNAVAILABLE/DEADLINE_EXCEEDED (503/504). Broker down → the status change still commits, but the event is lost and logged (see §6) |
| notification-service | Consume `ticket.status_changed`, record notifications (email is Planned) | AMQP consumer, health HTTP `:8082` | `notification-service` | MongoDB `notification` | `/health/ready` = connected to RabbitMQ; `degraded` when MongoDB is down | MongoDB down → nack + retry every 5 s. Broker down → reconnects every 2 s; unacked messages are redelivered |
| rabbitmq | Durable queue `notifications` | AMQP `:5672`, mgmt `:15672` (127.0.0.1) | `rabbitmq` | volume `rabbitmq-data` | `rabbitmq-diagnostics check_port_connectivity` | n/a |
| postgres | One database per service | `:5432` (127.0.0.1:5433) | `postgres` | volume `postgres-data` | `pg_isready` | n/a |
| mongo | Local fallback when `MONGODB_URL` is not set | `:27017` (127.0.0.1:27018) | `mongo` | volume `mongo-data` | `ping` | n/a |

## 4. NFRs: scenario, metric, criterion, result

The criteria are **proposed** in the Progress 3 plan. The Result column stays empty until the team runs the script in Docker. Copy the numbers from the evidence log.

| NFR | Scenario | Metric | Pass criterion (proposed) | How to test | Result |
| --- | --- | --- | --- | --- | --- |
| Performance | 50 VUs, no think time, read one ticket's history through the gateway for 60 s after a 15 s warm-up (10 VUs) | p95 latency, throughput, error rate (steady phase only) | p95 < 1 s, errors < 1 % | `bash demo-progress3/perf-test.sh` | _pending_ |
| Security | No token, forged token, expired token, Reporter assigns, Reporter manages departments/users, Reporter reads another's ticket, Staff of another department reads/starts, Guest lists, direct access to internal services | HTTP status, data unchanged | 401/403 as listed, status unchanged, internal ports closed | `bash demo-progress3/security-test.sh` | _pending_ |
| Reliability | Stop Notification Service, assign a ticket, start it again | assignment succeeds, event waits, then recorded | 200 ASSIGNED; queue +1; queue back to 0; MongoDB record exists | `bash demo-progress3/reliability-demo.sh` | _pending_ |
| Recovery / discovery | Remove ticket-service and start a new container with a different IP | time until the gateway answers 200 again; errors during the outage | IP changed; 503 during the outage; back ≤ 30 s; no gateway restart or config change | `bash demo-progress3/discovery-demo.sh` | _pending_ |
| Observability | Assign with a known `X-Request-Id` | the id appears in the logs of every service on the path | gateway, ticket-service, notification-service all log it, together with the eventId | `reliability-demo.sh` step N6 | _pending_ |

Requirements carried over that must be reported carefully:

- **Uptime 99.5 %** stays a long-term target. One recovery demo cannot show uptime. What exists now is the health endpoints and Docker healthchecks, which a monitor could poll. Monitoring itself is not built.
- **1,000 active users** is not the same as 50 simultaneous requests. Before claiming it, define the workload (requests per user per minute). Example: 1,000 users × 2 requests/min ≈ 33 requests/s. The k6 run reports the throughput it actually reached, so compare against that.
- **Page load < 2 s / upload < 3 s:** not tested. There is no frontend, and Cloudinary was not tested with a real account.
- The NFR text should name the percentile: "p95 < 1 s under 50 concurrent clients" instead of "fast".

## 5. How to reproduce

```bash
cp .env.example .env               # JWT_SECRET and ADMIN_PASSWORD at least; leave RABBITMQ_URL out
docker compose up -d --build       # first build takes a few minutes
docker compose ps                  # wait until every service is "healthy"
curl http://localhost:3000/health/ready

bash demo-progress3/security-test.sh
bash demo-progress3/reliability-demo.sh
bash demo-progress3/discovery-demo.sh
bash demo-progress3/perf-test.sh   # k6 on the host if installed, otherwise the grafana/k6 image
```

Each script prints its commands and responses, prints `ALL CHECKS PASSED` or `SOME CHECKS FAILED`, and saves everything to `demo-progress3/evidence/<name>-<time>.log`. Commit the logs you cite in the report, and note the commit they were taken on (printed at the top of each log).

## 6. Limitations and known risks (state these in the report and the video)

1. **Event loss window.** Ticket Service commits the status change first and publishes the event afterwards. If RabbitMQ is down at that moment, the event is dropped and logged as `Event NOT queued (lost)`. A transactional outbox would fix this. Planned, not built.
2. **Consumer-down vs broker-down.** The reliability demo stops the consumer. It does not test a broker crash. The queue is durable and messages are persistent, and the `rabbitmq-data` volume keeps them across container re-creation. A broker restart was tried in the sandbox (both services reconnected), but message survival across a crash was not measured.
3. **Retry forever.** A message that can never be stored is retried every 5 s with no dead-letter queue.
4. **Services trust the gateway.** Internal services have no auth of their own. They are protected only because Compose does not publish their ports (ADR-008 update). Anyone on the Docker network or the host can call them.
5. **Guest tokens can read any ticket's history by id.** This is by design from Progress 2, so a guest can follow their own report, and ticket ids are random UUIDs. It is still a disclosure risk to record.
6. **No login rate limit** (noted in the code as a TODO since Progress 2).
7. **Discovery is single-host.** Docker DNS works for one Compose project. Several replicas or several hosts would need a registry or orchestrator (Consul, Kubernetes Services), see ADR-009.
8. **Database deployment** (ADR-007): Render vs Neon vs local. The team's `.env` currently has no database URLs, so the local Postgres container is what runs. Confirm before editing the ADR.
9. **Not built:** Gmail delivery, Analytics Service and the web frontend are still on the roadmap. Reopen notifies the reporter, while the specification says the department.

### Bugs found and fixed during this round

- Notification Service crashed (`IllegalOperationError: Channel closed`) when RabbitMQ dropped while a 5-second retry was pending. Now handled: RabbitMQ redelivers the message.
- If MongoDB was unreachable at the first write, the MongoDB client stayed closed for good and every retry failed with `Topology is closed`, even after MongoDB came back. Now a failed client is replaced on the next attempt.
- grpc-js re-resolves DNS at most every 30 s by default. A re-created ticket-service was therefore unreachable for about 25 s after it started. Now it takes about 1 s (`grpc.dns_min_time_between_resolutions_ms`).
