# Verification evidence index

| Run (UTC) | Overall | Required load profile | Notes |
| --- | --- | --- | --- |
| [20261027t084152z-c1ab](20261027t084152z-c1ab/report.md) | **FAIL** | 100 tickets, 10s warm-up, 20 workers, 60s per endpoint | Latest complete run. Performance, functional, correlation, discovery/persistence, restoration/shutdown PASS. Department stopped/frozen and Ticket frozen PASS. Ticket stopped returned 504 instead of expected 503: [finding](20261027t084152z-c1ab/findings.md). |
| [20261027t083522z-e1d3](20261027t083522z-e1d3/report.md) | **FAIL** | Same required profile | Original run retained unchanged. Both endpoint targets PASS; Ticket stopped 504 also observed. Harness trace parsing/capture order and stale-health restoration failed, then were corrected and verified by the latest run. Ticket frozen was not reached in this first run. Its [raw audit](20261027t083522z-e1d3/audit.json) was run offline afterward. |

Use the latest report together with [the Thai guide](../nfr-verification.md). Never describe the complete suite as PASS while the finding remains open. Endpoint performance PASS refers only to the measured local workload and the provisional p95/error targets.

Every run has separate fixture volumes and evidence. Raw CSV contains all measured requests, excluding warm-up. JSON includes the full precision results, environment, source hashes and observed failure timings. These are actual results, not example numbers.
