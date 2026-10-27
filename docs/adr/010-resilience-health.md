# ADR-010 Resilience and health

**Decision status:** Proposed; explicit team ratification pending. **Implementation:** Implemented with one open error-classification finding. **Date:** 27 October 2026.

## Context

An unreachable or unresponsive dependency must not hold requests indefinitely or leave a failed pre-commit assignment partially saved. Liveness and dependency readiness serve different operational decisions.

## Alternatives

Unbounded calls risk accumulating requests. Retry-all may duplicate mutations. A single health flag hides partial route availability. A circuit breaker could reduce repeated work but adds state and tuning beyond this prototype.

## Decision

Use HTTP /health and /ready on Gateway/Department, and application-specific TicketService.CheckHealth with a database check. Bound REST calls including body reads to 2s; Gateway gRPC uses a native 3s deadline; Ticket's Department lookup is at most 2s and shortened to its remaining incoming deadline. Readiness checks use 750ms budgets. Propagate cancellation and check it before writes [R5].

Map UNAVAILABLE to HTTP 503 and DEADLINE_EXCEEDED to 504. Keep automatic mutation retries disabled. Save ticket and history in one local transaction; a Department failure before commit leaves both unchanged.

## Consequences

Readiness 503 can coexist with working independent routes. Deadlines may expire after commit, leaving the client uncertain; reconcile before another mutation. The current Ticket health RPC is not grpc.health.v1. No circuit breaker, failover or idempotency scheme is implemented.

## Verification

PASS: Department stopped/frozen, Ticket frozen, non-mutation, recovery and health probes. FAIL: stopped Ticket returned 504 in 3,027.05ms rather than the stronger smoke expectation 503, repeated twice. Existing code maps the observed deadline to 504; the transport cause remains open. Do not claim all stopped peers return 503. See findings.md; no target was relaxed.
