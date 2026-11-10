# Chula Fondue diagrams (Mermaid source)

Each `.mmd` file is editable Mermaid source. Flow diagrams use a consistent blue/gray palette, grouped system boundaries, and legends where color distinguishes element types. Open a file in a Mermaid-compatible editor or renderer (Mermaid Live Editor, GitHub Markdown, or a Mermaid extension in VS Code) to view it or export PNG/SVG.

## C4 architecture

- `01-system-context.mmd` — C4 Level 1 system context
- `02-container-architecture.mmd` — C4 Level 2 container architecture (runtime responsibilities and communication)
- `03-ticket-service-components.mmd` — C4 Level 3 ticket-service components

## Deployment overview

- `02b-deployment-overview.mmd` — deployment topology (Docker Compose host, published ports, private network, Docker DNS service discovery, persistent volumes, optional external services)

## Sequence diagrams

- `04a-sequence-ticket-assignment.mmd` — Admin assignment and department validation
- `04b-sequence-event-delivery.mmd` — Outbox and asynchronous notification / analytics delivery
- `05-sequence-register-login.mmd` — Reporter registration and login
- `06-sequence-create-ticket-auto-routing.mmd` — Ticket submission and optional automatic routing
- `07-sequence-work-and-resolution.mmd` — Staff work, resolution, reporter confirmation or reopen
- `08-sequence-password-reset.mmd` — Password reset mail outbox and optional Gmail delivery

The assignment and event-delivery sequences cover architecture decisions. The additional flows show the main user journeys and account recovery. Guests can view their own existing ticket history but cannot submit new tickets. The container diagram shows the system containers and their primary communication paths. The deployment diagram separately shows where containers run, which ports are published, internal service discovery via Docker DNS, and persistent volumes. Department retirement is an admin-only flow that checks Auth and Ticket usage; it is not expanded in the main architecture view.
