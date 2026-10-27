# ADR-008 JWT authentication and RBAC

**Decision status:** Accepted in the original proposal. **Implementation:** Proposed; no Auth Service, JWT validation or RBAC guards. **Revision:** 27 October 2026. **Origin:** original proposal pp. 18-19.

## Context

Registered users and guest reporters have different permissions. Central Admin routes tickets/manages departments; Department Staff handles its own queue; Reporters act on their own reports.

## Alternatives

Server sessions require shared/session persistence across API instances. JWT supports explicit claims but needs signature, expiry, issuer/audience and lifecycle controls. Anonymous email fields alone do not establish identity.

## Decision

Retain JWT for registered sessions, restricted guest credentials and RBAC plus ownership/department checks. The target Gateway authenticates incoming requests; services must enforce applicable resource permissions rather than trusting arbitrary reporterEmail/departmentId input. Detailed token lifecycle and guest ownership rules still require specification.

## Consequences

Current APIs accept caller-supplied identities without guards, so the three actors describe requirements, not enforced permissions. Local benchmark traffic is unauthenticated. Authentication work will change latency and needs renewed measurements.

## Verification

NOT_RUN: JWT signature/expiry, guest restrictions, Reporter ownership, Admin-only routing/CRUD and cross-department denial. Add positive and negative authorization tests before exposing the application as a user-facing service.
