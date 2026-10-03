# Chula Fondue demo

Three small NestJS services for the REST + gRPC CRUD demo.

| App | Protocol | Port | Purpose |
| --- | --- | --- | --- |
| `department-service` | REST | 3001 | CRUD on departments |
| `ticket-service` | gRPC | 50051 | CRUD on tickets; calls `department-service` over REST when assigning |
| `api-gateway` | REST | 3000 | Forwards to the two services, no logic of its own |

## 1. Prerequisites and install

- Node.js 22.13 or newer (tested on 22.13.1) and npm
- Git Bash (or any bash) and `curl` for the demo scripts

```
npm run install:all
```

## 2. Start everything

```
npm run dev
```

This compiles and starts all three services in one terminal with `[department]`, `[ticket]` and `[gateway]` log prefixes. Wait for three "successfully started" lines.

Environment variables and their defaults: `DEPARTMENT_PORT` (3001), `TICKET_GRPC_URL` (0.0.0.0:50051), `DEPARTMENT_SERVICE_URL` (http://localhost:3001), `TICKET_SERVICE_URL` (localhost:50051), `GATEWAY_PORT` (3000).

## 3. Run the demo scripts

Run them from a second terminal, in this order, against fresh data (see section 4):

```
bash demo/rest-demo.sh      # R1-R8: REST CRUD on department-service
bash demo/grpc-demo.sh      # G1-G8: gRPC CRUD on ticket-service
bash demo/gateway-demo.sh   # W1-W4: the same services through the gateway
```

Each script prints every command before its output, followed by the status it got and the status it expected. `rest-demo.sh` saves the two department ids to `demo/.ids`, and the other two scripts read them from there.

During G3, the `npm run dev` terminal shows the two log lines for the cross-service call:

```
[TicketService] GET http://localhost:3001/departments/<id> -> 200
[NotificationStub] to=<email> ticket=<id> status=ASSIGNED
```

## 4. Reset the data

Stop `npm run dev` (Ctrl+C), then delete the two database files. They are recreated on the next start.

```
rm -f services/department-service/department.sqlite services/ticket-service/ticket.sqlite
```

## 5. What is real and what is a stub

Real:

- REST CRUD on departments, stored in SQLite (`department.sqlite`)
- gRPC CRUD on tickets with status history, stored in SQLite (`ticket.sqlite`)
- The REST call from `ticket-service` to `department-service` when a ticket is assigned
- The gateway, including the routes for the optional status changes (`POST /tickets/:id/reject`, `/start`, `/resolve`, `/confirm`, `/reopen`)

Stub or not built:

- Notifications are logged only; no email is sent
- Photos are URL strings only; nothing is uploaded or stored
- No authentication, login or roles
- No Analytics Service

## Differences from the spec

- `grpcurl` is not installed on this machine, so `demo/grpc-demo.sh` runs `demo/grpc-demo.js`, a small Node script that loads the same `proto/ticket.proto`.
- The SQLite driver is `better-sqlite3`. The current TypeORM (1.x) no longer supports the `sqlite3` package.
- `demo/gateway-demo.sh` and `demo/lib.sh` are extra files. The gateway checks must run after the gRPC checks, so they could not go into `rest-demo.sh`.
- The services are an npm workspace, so `npm run install:all` is a single `npm install` at the root.
- Services are compiled with `tsc` and run with `node`. The Nest CLI is not used because its current version crashes on Node 22.13.
