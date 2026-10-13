# Chula Fondue

Five small NestJS services for the Progress #2 demo: authentication, the three business use cases (report, route, resolve), two kinds of database and a message broker. The design is explained in [docs/progress-2-plan.md](docs/progress-2-plan.md).

| App | Protocol | Port | Purpose | Storage |
| --- | --- | --- | --- | --- |
| `api-gateway` | REST | 3000 | Checks the login token and role, stores uploaded photos, forwards to the services | Cloudinary (photos) |
| `auth-service` | REST | 3002 | Register, login, guest login, Admin-created Staff accounts | PostgreSQL `auth` |
| `department-service` | REST | 3001 | CRUD on departments | PostgreSQL `department` |
| `ticket-service` | gRPC | 50051 | Tickets and status history; calls `department-service` over REST when assigning; publishes every status change to RabbitMQ | PostgreSQL `ticket` |
| `notification-service` | RabbitMQ consumer | none | Takes status-change messages from the `notifications` queue and records them | MongoDB `notification` |

## 1. Prerequisites and install

- Node.js 22.13 or newer (tested on 22.13.1) and npm
- Docker Desktop, for RabbitMQ (and the local Postgres fallback)
- Git Bash (or any bash) and `curl` for the demo scripts

```
npm run install:all
```

## 2. Configure

Copy `.env.example` to `.env` in the project root and fill it in. Every service loads this one file. `.env` is ignored by git; share it privately.

| Variable | Needed | If it is not set |
| --- | --- | --- |
| `JWT_SECRET` | yes | Auth Service and API Gateway refuse to start |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | yes for the demo | No Admin account is created |
| `MONGODB_URL` | yes | Notification Service tries `mongodb://localhost:27017` |
| `AUTH_DATABASE_URL`, `TICKET_DATABASE_URL`, `DEPARTMENT_DATABASE_URL` | for Neon | The local Postgres from `docker-compose.yml` is used |
| `CLOUDINARY_URL` | for Cloudinary | Photos are saved in `services/api-gateway/uploads` and served at `/uploads` |
| `RABBITMQ_URL` | no | `amqp://guest:guest@localhost:5672` |

The MongoDB cluster must accept connections from every teammate's network (Atlas: Network Access, allow `0.0.0.0/0`). If only one address is allowed, connections fail with `SSL alert number 80` whenever your public IP differs.

## 3. Start everything

```
docker compose up -d   # RabbitMQ and the local Postgres
npm run dev            # all five services
```

`npm run dev` compiles and starts the services in one terminal with `[department]`, `[auth]`, `[ticket]`, `[notification]` and `[gateway]` log prefixes. Wait for five "successfully started" lines. Tables are created on first start.

RabbitMQ's management page is http://localhost:15672 (user `guest`, password `guest`).

## 4. Run the demo scripts

From a second terminal. All of them can be run repeatedly and against a shared database, because each run creates its own departments, accounts and tickets.

```
bash demo/progress2-demo.sh   # login + UC-01 report, UC-02 route, UC-03 resolve, through the gateway
bash demo/broker-demo.sh      # the message broker on its own (see below)
bash demo/rest-demo.sh        # R1-R8: REST CRUD directly on department-service
bash demo/grpc-demo.sh        # G1-G8: gRPC CRUD directly on ticket-service (run rest-demo.sh first)
```

Each script prints every command before its output, followed by the status it got and the status it expected, and exits non-zero if any check failed. Passwords and tokens are shortened in the printed output.

On Windows, run them from a Git Bash terminal. In PowerShell, plain `bash` starts the WSL one, which has no Node.js and cannot reach the services (every call prints `HTTP 000`). From PowerShell use:

```
& 'C:\Program Files\Git\bin\bash.exe' demo/progress2-demo.sh
```

### Postman

Import `demo/chula-fondue.postman_collection.json`, open the collection's Variables tab and set `adminPassword` to the `ADMIN_PASSWORD` from `.env`. Run folder 0 once, then the requests of folder 1 in order; tokens and ids are saved into variables automatically. In the two upload requests, pick the files for the `photos` field (samples are in `demo/photos`).

### Showing that the broker keeps messages

1. Start the system without Notification Service: `npm run dev:no-notification`
2. `bash demo/broker-demo.sh`: the ticket is still assigned, and step B3 reports 1 message waiting (also visible on the RabbitMQ page under Queues, `notifications`)
3. In another terminal: `npm run notification`. Its log shows `Recorded to=... status=ASSIGNED` for the waiting message
4. `node --env-file=.env demo/show-notifications.js <ticket id>` prints the MongoDB record

## 5. Gateway API

Send the token from `/auth/login` or `/auth/guest` as `Authorization: Bearer <token>`.

| Route | Who | Notes |
| --- | --- | --- |
| `POST /auth/register` | anyone | `{email, password}`; always creates a Reporter |
| `POST /auth/login` | anyone | `{email, password}` returns `{accessToken, user}` |
| `POST /auth/guest` | anyone | returns `{accessToken}` for an anonymous reporter |
| `POST /auth/users` | Admin | `{email, password, role: "STAFF" or "ADMIN", departmentId}` |
| `POST /tickets` | Reporter, Guest | multipart form: `category`, `location`, `description`, `photos` (1-5 images, 5 MB each); guests add `contactEmail` |
| `GET /tickets` | Admin, Staff, Reporter | Admin: all (filters `status`, `departmentId`, `reporterEmail`); Staff: own department; Reporter: own tickets |
| `GET /tickets/:id/history` | Admin, Staff of that department, the reporter, Guest | |
| `DELETE /tickets/:id` | the reporter | cancel while Submitted |
| `POST /tickets/:id/assign` | Admin | `{departmentId}` |
| `POST /tickets/:id/reject` | Admin | `{reason}` |
| `POST /tickets/:id/start` | Staff of that department | |
| `POST /tickets/:id/resolve` | Staff of that department | multipart form: `photos` (1-5 images) |
| `POST /tickets/:id/confirm`, `/reopen` | the reporter | reopen takes `{reason}` |
| `/departments`, `/departments/:id` | Admin | GET, POST, PUT, DELETE |

## 6. Reset the local data

Only for the local Postgres; never run a reset against the shared Neon databases.

```
docker compose down -v && docker compose up -d
```

## 7. What is real and what is not

Real:

- Login tokens (JWT), password hashing (scrypt) and role checks at the gateway
- Tickets, departments and accounts in PostgreSQL, one database per service
- Photo upload with file-type and size checks; several photos per ticket
- Ticket Service publishing to RabbitMQ and Notification Service consuming, with messages kept while the consumer is down
- Notification records in MongoDB

Not built in this iteration:

- No email is sent. Notification Service stores each notification with `delivery: "RECORDED"`; the Gmail API call belongs in `services/notification-service/src/notifications.controller.ts`
- No Analytics Service and no web frontend
- Reopening a ticket notifies the reporter, while the specification says the department

Verified so far only with stand-ins:

- PostgreSQL was tested on the local container, not yet on Neon
- The Cloudinary upload was tested up to Cloudinary's signature check with fake credentials, not with a real account

## Notes

- `grpcurl` is not installed on this machine, so `demo/grpc-demo.sh` runs `demo/grpc-demo.js`, a small Node script that loads the same `proto/ticket.proto`.
- Services are compiled with `tsc` and run with `node`. The Nest CLI is not used because its current version crashes on Node 22.13.
- The services are an npm workspace, so `npm run install:all` is a single `npm install` at the root.
- All services use `synchronize: true`, so a changed entity alters the tables of whoever shares that database. Tell the team before changing an entity.
