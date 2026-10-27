# ADR-006 RabbitMQ broker

**Decision status:** Accepted in the original proposal. **Implementation:** Proposed; no broker or consumer is deployed. **Revision:** 27 October 2026. **Origin:** original proposal p. 18.

## Context

Notification records should be processed independently of Ticket Service availability and support safe redelivery.

## Alternatives

A direct synchronous call adds availability coupling. A stream platform adds operational scope beyond this iteration. RabbitMQ supports the queue/acknowledgement model selected in the original design.

## Decision

Retain RabbitMQ for AMQP ticket notification events. The first target consumer stores MongoDB records using a unique eventId and acknowledges after successful storage. Suggested event fields are eventId, eventType, ticketId, recipient, occurredAt and schemaVersion; these are proposed contracts, not existing proto fields.

## Consequences

Manual acknowledgements can allow redelivery after consumer failure, so consumers must deduplicate. Publisher confirms and consumer acknowledgements cover different sides of delivery [R6]. Neither alone makes the SQL commit and broker publication atomic. Durable configuration, publisher confirms and failure policy must be verified during integration. Application publisher retries/outbox are not implemented; no exactly-once guarantee is claimed.

## Verification

NOT_RUN: broker restart, publish failure, redelivery, deduplication and backlog handling. Add these checks before claiming asynchronous notification reliability. [R6] is listed in the proposal references.
