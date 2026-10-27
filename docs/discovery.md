# Service Discovery and Docker Compose

## Scope and health integration

This setup runs the existing Gateway, Department and Ticket services on one Docker Compose bridge network. It uses service-name DNS and separate SQLite volumes. It keeps the original `npm run dev` workflow and root `.env` values for local development.

Person 2 has added the application health/readiness probe; rebuild images to include it. Compose runs `node /app/docker/healthcheck.mjs <service-name>`:

- When `/app/scripts/healthcheck.mjs` exists, the wrapper delegates to that shared probe from `/app`, with a 4-second process limit. Its non-zero exit is a failure; the wrapper does not hide failures by falling back.
- Until that file exists, Department is checked through its REST list endpoint, Ticket through its `ListTickets` gRPC method, and Gateway through both forwarded list endpoints. These bounded, read-only checks exercise the existing request/DB paths.
- The fallback is labelled `bootstrap read probe` in health output. It does not implement Person 2's HTTP `/health`/`/ready`, `CheckHealth` RPC, runtime request deadlines, or request tracing.
- Rebuild images after adding or changing application health code. Files are copied into the image, not bind-mounted from the working tree.

See [Person 1 handoff](handoffs/person-1.md) for the original bootstrap verification, and [Person 2 handoff](handoffs/person-2.md) / [resilience guide](resilience.md) for the application-probe integration and failure checks. Existing containers do not update until rebuilt/recreated.

## Prerequisites and start

- Docker Engine/Desktop running, with Docker Compose v2 supporting `--wait`.
- Network access for the initial Node image, Debian build packages and npm dependencies.
- A free host Gateway port, default 3000. Host Node/npm is needed only for npm/local development, not for building these images.
- Run commands from the repository root. Examples use a POSIX shell such as zsh, bash or Git Bash.

```bash
docker compose config --quiet
docker compose up --build -d --wait --wait-timeout 120
docker compose ps
```

Open `http://localhost:3000/departments` or `http://localhost:3000/tickets`. Responses are JSON; the backend has no web UI yet. If a local process already uses port 3000, choose another host port:

```bash
GATEWAY_PORT=3100 docker compose up --build -d --wait --wait-timeout 120
```

Then use `http://localhost:3100` for host requests. Container ports remain 3000/3001/50051. An exported shell value overrides the value Compose reads from the root `.env`; Compose explicitly sets its service-to-service addresses so local `localhost` values do not leak into containers.

The Docker build uses `npm ci`, compiles the selected workspace, removes development dependencies and copies production dependencies, proto files, probes and the service code into a Node 22 runtime. Native SQLite compilation uses the same Linux/Node environment as the runtime. Containers run as the `node` user; the writable `/data` directory is backed by a named volume for the two database services.

## Addresses and ownership

| Caller | Destination | Address | Configuration |
| --- | --- | --- | --- |
| Host/browser/demo | API Gateway | `http://localhost:3000` by default | host port `GATEWAY_PORT`, published on `127.0.0.1` |
| API Gateway | Department Service | `http://department-service:3001` | `DEPARTMENT_SERVICE_URL` |
| API Gateway | Ticket Service | `ticket-service:50051` | `TICKET_SERVICE_URL` |
| Ticket Service | Department Service | `http://department-service:3001` | `DEPARTMENT_SERVICE_URL` |
| Department Service | Own SQLite file | `/data/department.sqlite` | `DEPARTMENT_DB_PATH`, volume `department-data` |
| Ticket Service | Own SQLite file | `/data/ticket.sqlite` | `TICKET_DB_PATH`, volume `ticket-data` |

`0.0.0.0:50051` is Ticket's listener address; its callers use `ticket-service:50051`. Inside a container, `localhost` refers to that container. Docker DNS names are for callers on this Compose network; the host/browser uses the published Gateway address.

Configuration selects the logical name/port. Docker resolves the name to a reachable container address. Gateway routing, DNS resolution, health checks and client reconnection each have distinct responsibilities.

## DNS proof

Resolve service names from inside Gateway, using Node which is already in the image:

```bash
docker compose exec -T api-gateway node --input-type=module -e 'import { lookup } from "node:dns/promises"; for (const name of ["department-service", "ticket-service"]) console.log(name, await lookup(name, { all: true }));'
```

Show the actual client configuration without displaying unrelated environment variables:

```bash
docker compose exec -T api-gateway node -e 'console.log({department:process.env.DEPARTMENT_SERVICE_URL,ticket:process.env.TICKET_SERVICE_URL});'
```

Send requests through Gateway:

```bash
curl --fail --silent --show-error http://localhost:3000/departments
curl --fail --silent --show-error http://localhost:3000/tickets
```

## Recreate and persistence demo

Use a separate Compose project and unused host port for test fixtures, especially when another team member is working. The following prefix must be used for **every** command in that test project; named volumes are scoped to the project.

```bash
GATEWAY_PORT=31300 docker compose -p chula-fondue-person1 up --build -d --wait --wait-timeout 120
```

The image includes a small Person 1 demo helper. Create isolated fixture data and keep its expected snapshot in the existing Gateway container:

```bash
docker compose -p chula-fondue-person1 exec -T api-gateway node /app/docker/discovery-demo.mjs seed
```

Run it once per snapshot path; it rejects an existing snapshot rather than silently overwriting it. A separate path can be passed as the final argument for another fixture. The helper uses normal Gateway APIs, prints service DNS addresses and records the returned IDs. It is an infrastructure demo, not Person 3's full NFR runner.

For a repeatable demo, use the existing APIs through `http://localhost:31300` to:

1. POST `/departments` with a unique test name, contact email and buildings. Record its returned department ID.
2. POST `/tickets` with category, location, description and test reporter email. Record its ticket ID.
3. POST `/tickets/<ticket-id>/assign` with `{ "departmentId": "<department-id>" }`.
4. GET `/tickets/<ticket-id>/history`; save the returned ticket and history before recreation.

Example request bodies (give the department a fresh name on a repeated run):

```json
{"name":"Discovery Demo 001","contactEmail":"discovery@example.com","buildings":["DEMO"]}
```

```json
{"category":"Demo","location":"DEMO building","description":"Person 1 discovery fixture","reporterEmail":"reporter@example.com"}
```

Recreate only Department, retaining its named volume:

```bash
GATEWAY_PORT=31300 docker compose -p chula-fondue-person1 up -d --no-deps --force-recreate --wait --wait-timeout 120 department-service
```

Repeat the DNS lookup and GET `/departments/<department-id>` through the same Gateway. Check its response and retry a read request after readiness if an old connection was closed during recreation. No service URL should be edited. Docker may allocate the same IP again; continuity by stable service name is the evidence, not a claim that the IP must change.

Recreate Ticket with its existing volume:

```bash
GATEWAY_PORT=31300 docker compose -p chula-fondue-person1 up -d --no-deps --force-recreate --wait --wait-timeout 120 ticket-service
```

Read `/tickets/<ticket-id>/history` again through the original Gateway process. Compare ticket ID/status/department and the history entries with the earlier snapshot. This verifies stored data and gRPC reconnection after recreation; volume configuration by itself is not proof. Observe Gateway logs if it is reconnecting.

If you used the demo helper, check both records and their history after either or both service recreations:

```bash
docker compose -p chula-fondue-person1 exec -T api-gateway node /app/docker/discovery-demo.mjs verify
```

Keep the Gateway container running between `seed` and `verify` so its `/tmp` snapshot remains available. That snapshot is only the expected test result; application data lives in the database volumes. This check can resolve the names again even when the recreated container receives the same IP.

The guide intentionally retains fixtures in the isolated project's volumes for inspection. Department fixtures can be removed with the department API when no longer needed; assigned tickets have no hard-delete API. Do not delete shared volumes or reset a real SQLite database for this demo.

## Health, logs and shutdown

```bash
docker compose ps
docker compose logs --tail=100 api-gateway ticket-service department-service
docker compose exec -T department-service node /app/docker/healthcheck.mjs department-service
docker compose exec -T ticket-service node /app/docker/healthcheck.mjs ticket-service
docker compose exec -T api-gateway node /app/docker/healthcheck.mjs api-gateway
```

Use `docker compose -p chula-fondue-person1 ...` instead when inspecting the isolated project. `depends_on: condition: service_healthy` orders startup. Health status alone does not automatically reconnect a client, restart an unhealthy running process or provide failover. `restart: unless-stopped` addresses a stopped/crashed container, not a health-check failure alone.

To stop the default setup and preserve its data:

```bash
docker compose down
```

To stop the isolated verification setup and preserve its fixtures:

```bash
GATEWAY_PORT=31300 docker compose -p chula-fondue-person1 down
```

Keep the same project name when starting again to reuse the named volumes. Changing project name creates a distinct network/volume set. Avoid `down -v` unless deliberately deleting that project's data.

## Limits and next integration

- This is single-host local/demo discovery. It does not establish high availability, dynamic multi-host load balancing or the proposal's uptime/concurrency targets.
- SQLite is the prototype database; PostgreSQL/MongoDB remain target-design work. Volumes demonstrate persistence across container recreation, not disaster recovery or database backup/restore.
- Authentication, external photo uploads and asynchronous notifications are still outside this implementation.
- Person 2 preserves the database path variables and supplies the shared probe according to README. Rebuild and rerun health/dependency tests whenever that code changes.
- Person 3 can reuse these commands in its verification runner without opening Department/gRPC host ports. Existing direct REST/gRPC demo scripts continue to target the npm/local setup.

## References

- [Docker Compose networking](https://docs.docker.com/compose/how-tos/networking/)
- [Docker Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/)
- [Official Node Docker image best practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)
