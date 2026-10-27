# Verification 20261027t084152z-c1ab

Status: **FAIL**. UTC: 2026-10-27T08:41:52.866Z to 2026-10-27T08:45:22.498Z.

Command: `node scripts/verification/run.mjs`

Project: `chula-fondue-person3-20261027t084152z-c1ab`, Gateway: http://127.0.0.1:31320. Fresh isolated volumes; data retained after shutdown.

Required load profile: **YES**. See [environment](environment.json), [fixtures](fixtures.json), [events](events.jsonl), [commands](commands.log) and [summary](summary.json).

| Check | Status | Detail |
| --- | --- | --- |
| setup | PASS | 33733 ms |
| fixtures | PASS | 986 ms |
| performance | PASS | 140352 ms |
| raw-evidence-audit | PASS | 280 ms |
| functional | PASS | 199 ms |
| request-correlation | PASS | 295 ms |
| discovery-and-persistence | PASS | 15454 ms |
| dependency-failures | FAIL | one or more dependency fault checks failed; see failure.json |
| restoration | PASS | 203 ms |
| shutdown | PASS | 650 ms |

| Endpoint | Result | Requests | req/s | p50 ms | p95 ms | p99 ms | Error |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tickets-list | PASS | 67200 | 1119.31 | 13.42 | 27.68 | 72.86 | 0.000% |
| ticket-history | PASS | 69113 | 1151.57 | 9.42 | 23.37 | 54.97 | 0.000% |

Load uses 20 closed-loop workers per endpoint, 10s warm-up and 60s measurement, serial endpoint runs and 100 tickets. Warm-up is excluded. Requests start within the measurement window; in-flight requests drain and remain in the sample/throughput denominator. Latency includes full HTTP body, JSON parsing and payload verification; nearest-rank percentiles use all attempts, including errors. Raw CSV and endpoint summaries permit recalculation. Targets: p95 <1,000 ms AND errors <1%.

- Single local Docker host, SQLite, no authentication or external integrations.
- 20 closed-loop workers are not 1,000 active users.
- No sustained uptime, HA, multi-host discovery, backup/restore or write-load claim.
- Other Compose projects remain running; CPU, memory and load-generator resources are shared.

NOT_RUN: 1,000-user capacity, 99.5% uptime observation, cloud/HA, concurrent mutation load, security assessment and a real network-delay/packet-loss experiment. Frozen-container faults exercise a nonresponsive peer.
