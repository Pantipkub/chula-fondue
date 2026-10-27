# Architecture decision register

Revised 27 October 2026 for this progress submission. Original ADR-001 through ADR-008 were marked Accepted in the supplied proposal; that recorded decision status is retained with a separate implementation status. Clarifying contradictions does not imply new team approval. ADR-009 through ADR-011 remain Proposed because explicit team ratification has not been recorded, although their local mechanisms have been implemented and tested.

| ADR | Decision | Recorded status | Implementation |
| --- | --- | --- | --- |
| [001](001-frontend-framework.md) | React and TypeScript | Accepted in original proposal | Proposed; frontend absent |
| [002](002-backend-framework.md) | NestJS and TypeScript | Accepted in original proposal | Implemented for 3 services |
| [003](003-manual-routing.md) | Human department routing | Accepted in original proposal | Assignment API implemented; role enforcement absent |
| [004](004-notification-processing.md) | Asynchronous notification records | Accepted in original proposal | Proposed; current log stub only |
| [005](005-communication.md) | REST, gRPC and AMQP boundaries | Accepted in original proposal | REST/gRPC subset implemented |
| [006](006-message-broker.md) | RabbitMQ broker | Accepted in original proposal | Proposed; broker/consumer absent |
| [007](007-data-storage.md) | Service-owned PostgreSQL and MongoDB | Accepted in original proposal | SQLite prototype implemented; migration proposed |
| [008](008-authentication.md) | JWT, RBAC and restricted guests | Accepted in original proposal | Proposed; no authentication/guards |
| [009](009-service-discovery.md) | Compose DNS for local development | Proposed; team ratification pending | Local mechanism implemented and verified |
| [010](010-resilience-health.md) | Bounded calls, readiness and safe mutations | Proposed; team ratification pending | Implemented; stopped-Ticket finding open |
| [011](011-verification-observability.md) | Reproducible NFR evidence and request IDs | Proposed; team ratification pending | Implemented; full suite FAIL remains visible |

The decision text and implementation status answer different questions. Accepted does not mean a feature is implemented or its NFR is achieved. See [the consolidated proposal](../proposal.md) and [actual verification](../nfr-verification.md).
