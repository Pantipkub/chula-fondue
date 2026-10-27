# Verification 20261027t083522z-e1d3

Status: **FAIL**. UTC: 2026-10-27T08:35:22.855Z to 2026-10-27T08:38:53.975Z.

Command: `node scripts/verification/run.mjs`

Project: `chula-fondue-person3-20261027t083522z-e1d3`, Gateway: http://127.0.0.1:31320. Fresh isolated volumes; data retained after shutdown.

Required load profile: **YES**. See [environment](environment.json), [fixtures](fixtures.json), [events](events.jsonl), [commands](commands.log) and [summary](summary.json).

| Check | Status | Detail |
| --- | --- | --- |
| setup | PASS | 35132 ms |
| fixtures | PASS | 1261 ms |
| performance | PASS | 140310 ms |
| functional | PASS | 137 ms |
| discovery-and-persistence | PASS | 14241 ms |
| dependency-failures | FAIL | GET /tickets: {"statusCode":504,"message":"Ticket Service timed out"}  504 !== 503  |
| request-correlation | FAIL | trace reaches api-gateway |
| restoration | FAIL | docker compose -p chula-fondue-person3-20261027t083522z-e1d3 start failed (exit 1):  Container chula-fondue-person3-20261027t083522z-e1d3-department-service-1  Waiting  Container chula-fondue-person3-20261027t083522z-e1d3-ticket-service-1  Waiting  Container chula-fondue-person3-20261027t083522z-e1d3-department-service-1  Error  Container chula-fondue-person3-20261027t083522z-e1d3-ticket-service-1  Healthy dependency failed to start: container chula-fondue-person3-20261027t083522z-e1d3-department-service-1 is unhealthy  |
| shutdown | PASS | NaN ms |

| Endpoint | Result | Requests | req/s | p50 ms | p95 ms | p99 ms | Error |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tickets-list | PASS | 71601 | 1193.18 | 13.01 | 23.62 | 43.86 | 0.000% |
| ticket-history | PASS | 88492 | 1474.71 | 6.45 | 16.53 | 42.14 | 0.000% |

Load uses 20 closed-loop workers per endpoint, 10s warm-up and 60s measurement, serial endpoint runs and 100 tickets. Warm-up is excluded. Requests start within the measurement window; in-flight requests drain and remain in the sample/throughput denominator. Latency includes full HTTP body, JSON parsing and payload verification; nearest-rank percentiles use all attempts, including errors. Raw CSV and endpoint summaries permit recalculation. Targets: p95 <1,000 ms AND errors <1%.

- Single local Docker host, SQLite, no authentication or external integrations.
- 20 closed-loop workers are not 1,000 active users.
- No sustained uptime, HA, multi-host discovery, backup/restore or write-load claim.
- Other Compose projects remain running; CPU, memory and load-generator resources are shared.

NOT_RUN: 1,000-user capacity, 99.5% uptime observation, cloud/HA, concurrent mutation load, security assessment and a real network-delay/packet-loss experiment. Frozen-container faults exercise a nonresponsive peer.
