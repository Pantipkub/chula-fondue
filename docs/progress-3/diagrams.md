# Progress 3: Diagrams

Sources are the `.mmd` files in [diagrams/](diagrams/). GitHub renders the blocks below, and the PNGs in the same folder are ready to paste into the Google Docs. To re-render after editing: `npx -p @mermaid-js/mermaid-cli mmdc -i diagrams/<file>.mmd -o diagrams/<file>.png -b white -s 2`.

Dashed boxes and lines are **Planned**: they are not built in this round.

## 1. System / container diagram

![1. System / container diagram](diagrams/1-system-container.png)

<details><summary>Mermaid source</summary>

```mermaid
flowchart LR
  users(["Reporter · Guest · Admin · Staff"])
  gw["API Gateway<br/>NestJS · :3000<br/>JWT + role checks, photo upload"]
  auth["Auth Service<br/>NestJS · :3002"]
  dept["Department Service<br/>NestJS · :3001"]
  ticket["Ticket Service<br/>NestJS · gRPC :50051"]
  notif["Notification Service<br/>NestJS · RabbitMQ consumer"]
  mq[["RabbitMQ<br/>durable queue: notifications"]]
  authdb[("PostgreSQL<br/>auth")]
  deptdb[("PostgreSQL<br/>department")]
  ticketdb[("PostgreSQL<br/>ticket")]
  mongo[("MongoDB<br/>notification")]
  cloud["Cloudinary<br/>(optional, external)"]
  gmail["Gmail API"]
  analytics["Analytics Service"]

  users -->|"REST/JSON over HTTP + Bearer JWT"| gw
  gw -->|"REST"| auth
  gw -->|"REST"| dept
  gw -->|"gRPC + x-request-id, 5 s deadline"| ticket
  ticket -->|"REST, 3 s timeout"| dept
  ticket -->|"AMQP publish ticket.status_changed<br/>(persistent, publisher confirm)"| mq
  mq -->|"AMQP consume, manual ack, prefetch 10"| notif
  auth --> authdb
  dept --> deptdb
  ticket --> ticketdb
  notif --> mongo
  gw -.->|"HTTPS"| cloud
  notif -.->|"Planned"| gmail
  analytics -.-|"Planned"| mq

  classDef planned stroke-dasharray: 5 5,color:#777
  class gmail,analytics planned
```

</details>

## 2. Deployment diagram (Docker Compose)

![2. Deployment diagram (Docker Compose)](diagrams/2-deployment.png)

<details><summary>Mermaid source</summary>

```mermaid
flowchart TB
  client(["Browser / curl / k6<br/>on the host"])
  subgraph host["Host machine · Docker Compose project chula-fondue"]
    direction TB
    subgraph net["Docker network fondue-backend · embedded DNS resolves service names"]
      direction LR
      gw["api-gateway<br/>:3000"]
      auth["auth-service<br/>:3002 (+/health)"]
      dept["department-service<br/>:3001 (+/health)"]
      ticket["ticket-service<br/>gRPC :50051 · health :8081"]
      notif["notification-service<br/>health :8082"]
      mq[["rabbitmq<br/>:5672 · mgmt :15672"]]
      pg[("postgres<br/>:5432 · DBs auth/ticket/department")]
      mongo[("mongo<br/>:27017 (local fallback)")]
    end
  end
  atlas[("MongoDB Atlas<br/>when MONGODB_URL is set")]
  cloud["Cloudinary<br/>when CLOUDINARY_URL is set"]

  client -->|"published 0.0.0.0:3000"| gw
  gw -->|"http://auth-service:3002"| auth
  gw -->|"http://department-service:3001"| dept
  gw -->|"dns:///ticket-service:50051"| ticket
  ticket -->|"http://department-service:3001"| dept
  ticket -->|"amqp://rabbitmq:5672"| mq
  notif -->|"amqp://rabbitmq:5672"| mq
  auth & dept & ticket -->|"postgres:5432"| pg
  notif -->|"mongodb://mongo:27017"| mongo
  notif -.-> atlas
  gw -.-> cloud
  client -.->|"127.0.0.1 only: 5672, 15672, 5433, 27018 (debug / npm run dev)"| mq
```

</details>

## 3. Sequence: Assign Ticket

![3. Sequence: Assign Ticket](diagrams/3-sequence-assign-ticket.png)

<details><summary>Mermaid source</summary>

```mermaid
sequenceDiagram
  autonumber
  actor A as Admin
  participant G as API Gateway
  participant T as Ticket Service
  participant D as Department Service
  participant DB as PostgreSQL (ticket)
  participant Q as RabbitMQ
  participant N as Notification Service
  participant M as MongoDB

  A->>G: POST /tickets/{id}/assign {departmentId}<br/>Authorization: Bearer JWT
  G->>G: verify JWT (HS256, expiry) and role ADMIN, else 401/403
  G->>T: gRPC AssignTicket · metadata x-request-id · deadline 5 s
  T->>DB: load ticket, must be SUBMITTED (else FAILED_PRECONDITION → 409)
  T->>D: GET /departments/{id} · X-Request-Id · timeout 3 s
  alt department missing / unreachable / slow
    D-->>T: 404 / no connection / no answer
    T-->>G: NOT_FOUND / UNAVAILABLE / DEADLINE_EXCEEDED
    G-->>A: 404 / 503 / 504
  else department found
    D-->>T: 200 {id, name, contactEmail}
    T->>DB: one transaction: ticket.status = ASSIGNED + history row
    T-)Q: publish ticket.status_changed {eventId, requestId, ...}
    T-->>G: Ticket (ASSIGNED)
    G-->>A: 200 Ticket · X-Request-Id
  end
  Note over A,G: The Admin's answer does not wait for the notification
  Q-)N: deliver event (at least once)
  N->>M: upsert by eventId (a duplicate is ignored)
  N-)Q: ack after the record is stored
```

</details>

## 4. Sequence: Failure and recovery of Notification Service

![4. Sequence: Failure and recovery of Notification Service](diagrams/4-sequence-failure-recovery.png)

<details><summary>Mermaid source</summary>

```mermaid
sequenceDiagram
  autonumber
  actor A as Admin
  participant G as API Gateway
  participant T as Ticket Service
  participant Q as RabbitMQ (durable queue)
  participant N as Notification Service
  participant M as MongoDB

  Note over N: Notification Service is stopped (or crashed)
  A->>G: POST /tickets/{id}/assign
  G->>T: gRPC AssignTicket
  T->>T: commit ASSIGNED + history
  T-)Q: publish event (persistent) → broker confirms
  T-->>G: Ticket (ASSIGNED)
  G-->>A: 200 — the business flow is not blocked
  Note over Q: event waits in "notifications" (messages = 1)
  Note over N: Notification Service starts again
  N->>Q: connect, consume (prefetch 10)
  Q-)N: deliver the waiting event
  alt MongoDB available
    N->>M: upsert by eventId
    N-)Q: ack → message removed
  else MongoDB unavailable
    N--)Q: nack + requeue after 5 s (retried until it is stored)
  end
  opt connection lost before the ack
    Q-)N: redelivers the same event later
    N->>M: upsert finds the eventId → "Duplicate ignored"
    N-)Q: ack
  end
```

</details>
