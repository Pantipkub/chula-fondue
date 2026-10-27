# Person 1 handoff

- Status: READY
- Completed: Docker/Compose/DNS/volumes implementation, bootstrap probe integration, DB path configuration, build scripts, discovery guide and deployment diagram.
- Files changed: `Dockerfile`, `.dockerignore`, `compose.yaml`, `docker/healthcheck.mjs`, `docker/discovery-demo.mjs`, root/service package scripts, `.env.example`, `.gitignore`, README, `docs/discovery.md`, `docs/diagrams/deployment.mmd`, this handoff. Minimal shared-source changes in Department/Ticket `app.module.ts` add the agreed DB path variables and create parent directories so Person 1 can verify persistent volumes before Person 2's other work arrives.
- How to run: `docker compose up --build -d --wait --wait-timeout 120`; see `docs/discovery.md` for isolated verification and normal shutdown.
- Verification: PASS for Compose config, all three TypeScript builds, all three Docker image builds/startup, DNS, fixture assignment, Department/Ticket recreate with persisted data/history, gRPC reconnection through the original Gateway, wrapper delegation/failure/timeout, runtime user/config exclusion and host HTTP access. Commands/results are recorded below.
- Contract changes: Compose invokes `docker/healthcheck.mjs`, which delegates to Person 2's `/app/scripts/healthcheck.mjs` with its service argument when included in the image. Until present, the wrapper exercises existing read APIs with bounded probes; application health/readiness is still pending. Local database defaults and existing RPCs remain unchanged.
- Remaining dependencies: Person 2's health/readiness endpoints, CheckHealth RPC, shared probe, request timeouts/deadlines and tracing remain its work. Rebuild images and rerun checks after that integration.
- Next person: Person 2 preserve DB env support and implement its probe; Person 3 reuse the isolated project for NFR evidence; Person 4/5 use discovery guide and deployment source with the explicit bootstrap-probe limitation.

## Verified environment

- Verification date: 2026-10-27, Asia/Bangkok.
- Docker Engine: 27.4.0; Docker Compose: v2.31.0-desktop.2.
- Container runtime: Node v22.23.4, Linux arm64, uid 1000 (`node`).
- Isolated project: `chula-fondue-person1`; network: `chula-fondue-person1_backend`.
- Gateway is left running at `http://localhost:31300`; Department and Ticket do not publish host ports. All three containers were healthy after verification, using the bootstrap read probes.
- Volumes: `chula-fondue-person1_department-data`, `chula-fondue-person1_ticket-data`. Fixtures are retained for inspection; no existing local SQLite database or unrelated Compose project was reset.

## Commands and actual results

| Command/check | Result | Evidence |
| --- | --- | --- |
| `docker compose -p chula-fondue-person1 config --quiet` | PASS | Compose parses and validates |
| `npm run build` | PASS | API Gateway, Department and Ticket workspaces compile |
| `docker compose -p chula-fondue-person1 build` | PASS | All three Linux images built; Gateway image was rebuilt after adding the demo helper |
| `GATEWAY_PORT=31300 docker compose -p chula-fondue-person1 up -d --wait --wait-timeout 120` | PASS | All 3 services healthy; only `127.0.0.1:31300->3000/tcp` published |
| `docker compose -p chula-fondue-person1 exec -T api-gateway node /app/docker/discovery-demo.mjs seed` | PASS | DNS resolved; Department and Ticket created; assign succeeded through REST -> gRPC -> REST; history has SUBMITTED, ASSIGNED |
| `docker compose -p chula-fondue-person1 up -d --no-deps --force-recreate --wait --wait-timeout 120 department-service` followed by helper `verify` | PASS | Same Department, ticket and 2 history entries returned unchanged |
| `docker compose -p chula-fondue-person1 up -d --no-deps --force-recreate --wait --wait-timeout 120 ticket-service` followed by helper `verify` | PASS | Same ticket/history returned unchanged; original Gateway gRPC client reconnected |
| `docker inspect chula-fondue-person1-api-gateway-1` before/after Department/Ticket recreation | PASS | Gateway container ID and start timestamp were identical; it was not recreated during the persistence checks |
| `docker compose -p chula-fondue-person1 exec -T <service> node /app/docker/healthcheck.mjs <service>` for all 3 services | PASS | Each reported `bootstrap read probe (application health probe pending)` |
| Isolated Node fixture harness for `docker/healthcheck.mjs` | PASS | Invalid name fails; shared probe receives service argument and root cwd; failed delegate does not fall back; stuck delegate is stopped at its 4-second limit |
| Runtime filesystem/user checks inside Gateway | PASS | uid 1000; `/app/.env` absent; shared application probe absent as expected |
| `curl --fail --silent --show-error --max-time 5 http://localhost:31300/tickets` from host | PASS | HTTP 200 with the assigned fixture ticket |
| `git diff --check`, `node --check docker/healthcheck.mjs`, `node --check docker/discovery-demo.mjs` | PASS | No whitespace/syntax errors |

The host HTTP check required execution outside the filesystem/network sandbox. The first sandboxed curl could not connect; the permitted host check succeeded. The Docker checks likewise used the approved Docker Desktop socket access.

### Retained fixture

```text
Department ID: 85a710d8-18ec-4465-bda2-29617e2d9c4f
Ticket ID:     6bfd2e3b-73e2-4a23-ba45-ca18a38fdfa1
Ticket status: ASSIGNED
History:       SUBMITTED -> ASSIGNED (2 entries)
Snapshot:      /tmp/chula-fondue-discovery.json inside the running Gateway
DNS observed:  department-service=172.30.0.2, ticket-service=172.30.0.3
```

Docker reused the same IPs in these recreations. The verified claims are service-name resolution, connectivity after replacement and data persistence; this run does not demonstrate an actual IP change.

The Gateway container ID before/after the two recreations was `01627d0136fd196ecb5280115fd90dba0b325db93005788847ee38d000e54eb4`, started at `2026-10-27T07:35:55.718742461Z` (UTC).

To inspect the retained fixture again:

```bash
docker compose -p chula-fondue-person1 exec -T api-gateway node /app/docker/discovery-demo.mjs verify
```

To stop this isolated setup while keeping its data:

```bash
docker compose -p chula-fondue-person1 down
```

## Checks not claimed complete

- `NOT_RUN`: Person 2's real health/readiness endpoints, CheckHealth RPC, bounded application calls and correlation behavior; these are not implemented by the bootstrap probes.
- `NOT_RUN`: Person 3's performance/concurrency, failure-budget and uptime measurement. No p95/1,000-user/99.5%-uptime claim is made.
- `NOT_RUN`: A full local `npm run dev` smoke test in this turn; all local TypeScript workspaces built and original DB defaults/start workflow are preserved.
- `NOT_RUN`: Render deployment, HA/failover and multi-host discovery.
- `NOT_RUN`: Diagram rendering; `docs/diagrams/deployment.mmd` is the editable source for Person 4 to render and include in the PDF.
- Build output reports 4 high-severity production dependency advisories from the existing lockfile. Package versions were not changed in this role; dependency review remains follow-up security work.
