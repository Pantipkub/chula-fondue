# ADR-009 Service discovery

**Decision status:** Proposed; explicit team ratification pending. **Implementation:** Compose DNS implemented and verified locally. **Date:** 27 October 2026.

## Context

Local npm development uses localhost endpoints. Container localhost refers to the caller itself, and replacement containers should remain reachable without editing every client URL.

## Alternatives

Static container IPs require manual updates. Environment URLs configure an address but do not discover changing IPs. A dedicated registry adds deployment and client complexity. Platform DNS can provide stable logical names within its network.

## Decision

Use Docker Compose service-name DNS on one backend bridge network for local/demo: ticket-service:50051 and http://department-service:3001. Publish only Gateway on host loopback, default port 3000; allow an isolated test port. Keep root .env localhost defaults for npm development. Clients reconnect after replacement; do not encode observed IPs [R3].

For a potential Render deployment, evaluate the provider's private service hostnames in the same region and eligible service types [R7]. Do not reuse Compose-only names on the host or cloud, or assume free services can receive private traffic. Cloud deployment remains Proposed.

## Consequences

DNS, readiness and reconnection are distinct. Startup ordering uses service_healthy, but it is not runtime failover [R4]. A single host has no HA guarantee. Compose may reuse an IP; unchanged IPs do not invalidate stable-name discovery evidence.

## Verification

PASS: names resolve inside Gateway, configured URLs match the contract, Department/Ticket container IDs change, Gateway ID stays constant, fixture reads succeed after readiness/reconnection, and data persists. See discovery.json in run 20261027t084152z-c1ab. NOT_RUN: multi-host discovery, load balancing or Render deployment.
