# Chula Fondue diagrams (Mermaid source)

Each `.mmd` file is editable Mermaid source. Flow diagrams use a consistent blue/gray palette, grouped system boundaries, and legends where color distinguishes element types. Open a file in a Mermaid-compatible editor or renderer (Mermaid Live Editor, GitHub Markdown, or a Mermaid extension in VS Code) to view it or export PNG/SVG.

## C4 architecture

- `01-system-context.mmd` — C4 Level 1 system context
- `02-container-architecture.mmd` — C4 Level 2 container architecture
- `03-ticket-service-components.mmd` — C4 Level 3 ticket-service components

## Sequence diagrams

- `04a-sequence-ticket-assignment.mmd` — Admin assignment and department validation
- `04b-sequence-event-delivery.mmd` — Outbox and asynchronous notification / analytics delivery
- `05-sequence-register-login.mmd` — Reporter registration and login
- `06-sequence-create-ticket-auto-routing.mmd` — Ticket submission and optional automatic routing
- `07-sequence-work-and-resolution.mmd` — Staff work, resolution, reporter confirmation or reopen

The assignment and event-delivery sequences cover architecture decisions. The additional flows show the main user journeys. There is no need to create a separate sequence for every CRUD endpoint unless the presentation requires it.
