# ADR-007 Service-owned data storage

**Decision status:** Accepted in the original proposal for the target design. **Implementation:** SQLite per service Implemented; PostgreSQL/MongoDB migration Proposed. **Revision:** 27 October 2026. **Origin:** original proposal p. 18.

## Context

Auth, Ticket and Department require relational data. Notification records are event-oriented. The runnable prototype currently uses independent SQLite files rather than the target hosted databases.

## Alternatives

A shared database allows accidental cross-service coupling. SQLite makes local setup simple but does not demonstrate multi-replica write scaling or hosted availability. Separate PostgreSQL databases retain ownership while requiring migrations and operations.

## Decision

Retain PostgreSQL on Render as the original relational target, with a separate owned database/schema and credentials per Auth, Ticket and Department boundary. Retain MongoDB for Notification. Current Ticket/Department use TypeORM with better-sqlite3, separate /data paths and named volumes. Services collaborate through APIs/events, never another service's tables.

## Consequences

Prototype persistence across container recreation is not backup/restore. A PostgreSQL migration needs explicit migrations, export/import, record/history reconciliation, staging tests, credentials, backup/restore checks and a rollback plan. Disable schema synchronization in a production migration plan. Render deployment feasibility and database operations remain unverified.

## Verification

PASS: selected Department and ticket/history fixtures survive both container recreations in run 20261027t084152z-c1ab. NOT_RUN: PostgreSQL/MongoDB migration, backup recovery, HA and concurrent write capacity.
