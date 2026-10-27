# Open finding: Ticket stopped returns a deadline response

- Status: **OPEN / FAIL against the stopped-service HTTP 503 expectation**.
- Owner for follow-up: Person 2 (Gateway/Ticket client and resilience contract); Person 3 supplies reproduction/evidence.
- No application source, timeout budget or expected HTTP status was changed to make this check pass.

## Observed

On 2026-10-27, the full runner completed the normal functional checks and recreated Department/Ticket while retaining the original Gateway. It then stopped Ticket with `docker compose -p <isolated-project> stop ticket-service`. Gateway remained live, readiness returned 503 with Ticket down, and the independent Department route remained usable. However, `GET /tickets` returned **HTTP 504 after 3,027.05 ms**, where the smoke expectation for a stopped service was **503**.

The same case returned 504 after **3,007 ms** in the first run's Gateway dependency log. That actual log has `grpcCode=4` (`DEADLINE_EXCEEDED`) for `listTickets`, request ID `p3-0284adf5-2db3-4991-bce7-a7030b86aef7`, in [the first command log](../20261027t083522z-e1d3/commands.log). The latest [HTTP events](events.jsonl) and [fault evidence](failure.json) record the repeated HTTP outcome. The current client maps gRPC DEADLINE_EXCEEDED to 504 and UNAVAILABLE to 503.

This establishes the observed deadline response, not the underlying transport cause. A stopped container need not produce an immediate connection-refused signal on every Docker/network/channel state. Determining why this path waits for its deadline requires further channel/network diagnostics. No claim is made that the timeout mapping itself is wrong.

## Reproduce and assess

```bash
node scripts/verification/run.mjs
```

This creates a new isolated project, uses the required load profile, recreates both dependencies, then runs faults sequentially. A free default port 31320 is required; use `--port 31321` if occupied. The process exits 1 while the strict stopped-service expectation fails. Both observed runs restored all dependencies; the latest final restoration passed and the runner removed only its own containers/network, preserving volumes.

`--mode failure` is available for focused fault investigation, but skips the preceding workload/recreation and may produce a different channel state. Use the full command when reproducing this sequence.

Person 2 should distinguish two requirements before changing implementation or expectations:

1. Correct mapping of a known gRPC code: UNAVAILABLE → 503 and DEADLINE_EXCEEDED → 504 (current behavior).
2. A stronger requirement that any stopped dependency always produces HTTP 503, even when transport failure is detected only by deadline. This stronger outcome was not achieved in these two runs.

Do not relabel this strict check PASS merely because the request is bounded. It is bounded and recovery succeeds, while the expected error classification remains open. Any agreed contract change should be documented and rerun; any implementation change should preserve the frozen-service 504 deadline and mutation safety.
