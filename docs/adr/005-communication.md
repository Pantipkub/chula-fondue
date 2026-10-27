# ADR-005 Service communication boundaries

**Decision status:** Accepted in the original proposal; conflicting notification sentence removed. **Implementation:** REST/gRPC subset Implemented; other paths Proposed or Future. **Revision:** 27 October 2026. **Origin:** original proposal p. 17.

## Context

Browsers need HTTP APIs; ticket workflows benefit from a proto contract; department lookup is synchronous; notification recording should be asynchronous.

## Alternatives

REST everywhere simplifies tooling but changes the existing ticket contract. gRPC everywhere adds browser translation. Synchronous notification RPCs couple workflow completion to notification availability.

## Decision

- Implemented: client tools to Gateway via local HTTP REST; Gateway to Ticket via gRPC; Gateway/Ticket to Department via REST.
- Proposed: browser to Gateway via REST/HTTPS; Gateway to Auth via REST and Cloudinary via HTTPS; Ticket to RabbitMQ via AMQP; RabbitMQ to Notification consumer via AMQP; Notification to MongoDB via its driver.
- Future: Notification to Gmail via HTTPS; Analytics API integration.

The Gateway-to-Notification gRPC path from the original text is removed. No cross-service database access is allowed.

## Consequences

The team maintains HTTP DTOs, proto compatibility and a proposed event schema. Local HTTP/insecure gRPC is a development boundary, not proof of production transport security. Event publication is separate from ticket commit.

## Verification

PASS: implemented paths, request IDs and DNS. NOT_RUN: HTTPS deployment, Auth, media uploads and AMQP/MongoDB integrations. Three revised diagrams use these same boundaries.
