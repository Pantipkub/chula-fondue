# Chula Fondue: C4 model and sequence diagrams (C4-PlantUML)

These diagrams describe the **Docker Compose deployment** (`docker-compose.yml`). Services find each other by Compose service name through Docker's embedded DNS. The Kubernetes/Tilt setup in `k8s/` is not drawn here.

| File | Diagram |
| --- | --- |
| [01-system-context.puml](01-system-context.puml) | Level 1, System Context (required) |
| [02-container.puml](02-container.puml) | Level 2, Container (required) |
| [03-sequence-uc01-report-issue.puml](03-sequence-uc01-report-issue.puml) | Sequence, UC-01 Report Campus Issue |
| [04-sequence-uc02-route-ticket.puml](04-sequence-uc02-route-ticket.puml) | Sequence, UC-02 Route Ticket to Department |
| [05-sequence-uc03-resolve-ticket.puml](05-sequence-uc03-resolve-ticket.puml) | Sequence, UC-03 Resolve Ticket |

Each `.puml` file has a rendered `.png` next to it. Level 3 is optional and is not drawn here; a Ticket Service component view exists in [../presentation/03-ticket-service-components.mmd](../presentation/03-ticket-service-components.mmd). Level 4 is not required.

The diagrams match the configuration the team runs: photos are stored on the gateway's `uploads` volume, and email is sent through Gmail (`EMAIL_MODE=gmail`). The code also supports Cloudinary for photos, but it is not configured, so it is left out. To keep the Container diagram readable, the Department Service usage checks made when a department is retired (calls to Auth and Ticket Service) are omitted.

Re-render after editing. PlantUML 1.2024+ bundles the C4 library, so no internet access is needed:

```sh
java -jar plantuml.jar -charset UTF-8 -tpng docs/c4/*.puml
```

## Architecture goals and constraints

**Goals**

1. **Independent services by business capability.** Auth, Department, Ticket, Notification and Analytics are separate NestJS services. Each service owns its data: four logical PostgreSQL databases plus MongoDB. No service reads another service's tables.
2. **One secured entry point.** Users reach only the web frontend and the API Gateway. The gateway verifies the JWT, re-checks the session with Auth Service, enforces role and ownership rules, validates photos and assigns an `X-Request-Id` to every request.
3. **Reliable status changes.** A ticket's status, its history row and an outbox event are committed in one PostgreSQL transaction. A relay then publishes the event to durable RabbitMQ queues. Consumers acknowledge only after writing and ignore duplicates by `eventId`, giving at-least-once delivery with no lost events.
4. **Bounded failures.** Every remote call has a timeout (gateway to services 5 s, Ticket to Department 3 s). An unreachable dependency returns 503 and a slow one returns 504, instead of leaving the request hanging.
5. **Safe concurrent edits.** Each state change locks the ticket row and compares the expected version. A stale update returns 409.

**Constraints**

- The course project runs on a single host with Docker Compose. Service discovery uses Compose service names (for example `ticket-service:50051`) resolved by Docker DNS on the private `backend` network. No service registry is needed.
- Only the frontend (8080) and the gateway (3000) are published. PostgreSQL, RabbitMQ and MongoDB are bound to 127.0.0.1 for debugging only.
- Stack: TypeScript on Node.js 22, NestJS, React 18, PostgreSQL 18, MongoDB 8 and RabbitMQ 4. The only external dependency is the Gmail API.
- Business rules from the use cases: a ticket needs 1–5 photos of at most 5 MB each, and completion photos are required to resolve it.

**Key design decisions**

| Decision | Why |
| --- | --- |
| gRPC between Gateway and Ticket Service; REST for the other services | Ticket Service has the richest command set, which benefits from a typed contract (`proto/ticket.proto`) and per-call deadlines. The other calls are simple CRUD. |
| RabbitMQ events for notification and analytics | Ticket requests never wait for email or reporting, and those consumers can be offline without blocking ticket changes. |
| Transactional outbox instead of publishing inside the request | If the broker is down right after the commit, a direct publish loses the event. The outbox makes the event part of the same transaction. |
| Docker DNS for service discovery | Addresses are service names in configuration, never IPs. A re-created container is found again without a gateway restart, and there is no extra registry to run. |
| MongoDB for notifications | The inbox is schemaless, append-heavy data that needs TTL purging and no joins. |
| Synchronous Department lookup when assigning | An assignment must never be committed against a department that does not exist, so a failed lookup rejects the request (404/503/504) before anything is written. |
