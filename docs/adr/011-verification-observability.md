# ADR-011 NFR verification and observability

**Decision status:** Proposed; explicit team ratification pending. **Implementation:** Runner/evidence and request correlation implemented. **Date:** 27 October 2026.

## Context

The original proposal includes query latency, availability, security and 1,000 active users, but local smoke checks cannot establish all of them. Claims need a declared workload, provenance and limitations.

## Alternatives

Single manual requests lack repeatability. A production load suite offers broader evidence but requires deployment, identity and resource isolation. A bounded local runner provides a reproducible progress baseline without pretending to prove production capacity.

## Decision

Use node scripts/verification/run.mjs on fresh isolated Compose projects. Benchmark GET /tickets and history separately with 100 tickets, 10s warm-up, 20 closed-loop workers and 60s measurement each. Provisionally require p95 below 1s and error below 1%; retain the original requirements rather than redefining them. Record all attempts, nearest-rank percentiles, drain-inclusive throughput, environment, commit/dirty flag, source hashes and raw CSV. Audit calculations independently.

Propagate/echo validated x-request-id across HTTP and gRPC. Capture structured service logs for correlation; this is not full distributed tracing. Distinguish PASS, FAIL and NOT_RUN; keep previous failed runs.

## Consequences

Host load generation and shared Docker resources constrain inference. Closed-loop traffic reduces its arrival rate when responses slow down. Passing p95 does not prove all responses below 1s, 1,000 active users or 99.5% uptime. New authentication/database/infrastructure work requires new measurements.

## Verification

PASS: both provisional performance criteria, raw CSV audit, workflow/filters, correlation, discovery/persistence and restoration. Overall FAIL remains due to stopped-Ticket status classification. NOT_RUN: production capacity, soak/uptime, concurrent writes, security and cloud/HA validation. Use run 20261027t084152z-c1ab and preserve its open finding.
