# ADR-004 Asynchronous notification processing

**Decision status:** Accepted in the original proposal; contradictory delivery wording clarified. **Implementation:** Proposed; current Ticket Service has a notification log stub. **Revision:** 27 October 2026. **Origin:** original proposal p. 16 and UC-05 p. 6.

## Context

Ticket updates should complete independently of notification processing. The original document selected RabbitMQ/MongoDB but retained stale Gmail postconditions and a synchronous notification route.

## Alternatives

Portal polling needs repeated visits. A synchronous notification RPC couples ticket latency to the consumer. Direct email delivery requires credentials and provider failure handling. Asynchronous events separate these responsibilities but introduce delivery uncertainty.

## Decision

The target is Ticket Service publishing AMQP events to RabbitMQ; Notification Service consumes and stores records in its own MongoDB. UC-05 succeeds when a notification record is stored and the message acknowledged. Gmail delivery is Future. Gateway does not orchestrate notification RPCs.

## Consequences

Consumer failure must not roll back committed ticket changes. Publishing after commit can lose events on failure; logging alone is not reliable delivery. An outbox/publisher recovery design is future work before any guaranteed-delivery claim. Broker redelivery requires idempotent record creation.

## Verification

NOT_RUN: broker publication, consumer delivery, MongoDB persistence or deduplication. Current logs prove only stub execution. UC-05 is not implemented by that stub.
