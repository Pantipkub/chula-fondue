# ADR-001 Frontend framework

**Decision status:** Accepted in the original proposal. **Implementation:** Proposed; no frontend application in this repository. **Revision:** 27 October 2026. **Origin:** original proposal pp. 13-14.

## Context

Reporter, Central Admin and Department Staff need reusable reporting forms, ticket timelines and queues, with a mobile-friendly Thai interface.

## Alternatives

React offers reusable components and TypeScript; Vue offers approachable components/reactivity; Angular supplies more built-in structure with greater setup and learning work.

## Decision

Retain React with TypeScript as the target frontend. Define routing, form validation and shared API types when frontend work begins. The current deliverable exposes backend JSON APIs and terminal verification.

## Consequences

UI consistency and shared types can reduce duplication. Routing, accessibility, responsive layout and browser support still require implementation and testing. A backend response benchmark is not a page-load or usability test.

## Verification

NOT_RUN: Thai/mobile usability, supported browsers and the original public-page load target below 2 seconds. No UI completion is claimed.
