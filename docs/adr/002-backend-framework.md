# ADR-002 Backend framework

**Decision status:** Accepted in the original proposal. **Implementation:** Implemented for Gateway, Ticket and Department. **Revision:** 27 October 2026. **Origin:** original proposal pp. 14-15.

## Context

The team needs independently structured services with validation, dependency injection, REST and gRPC while keeping TypeScript across the stack.

## Alternatives

Go offers compiled services but adds a language and learning cost. Express is minimal but leaves conventions to the team. NestJS supplies modules, injection and transport integrations with decorator/configuration overhead.

## Decision

Retain Node.js, NestJS and TypeScript in separate applications. Share the versioned ticket proto contract and npm workspace tooling without sharing database access. RabbitMQ notification processing remains target work, and Gmail remains future work.

## Consequences

Each service needs its own configuration, deployment, health and monitoring. Shared source/tooling does not remove service boundaries or operating costs.

## Verification

PASS: current Docker builds compile all three applications and actual Gateway REST-to-REST/gRPC paths were tested. Auth/Notification applications are not implemented. See evidence run 20261027t084152z-c1ab.
