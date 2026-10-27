# ADR-003 Manual department routing

**Decision status:** Accepted in the original proposal. **Implementation:** Assignment/reassignment API implemented; authenticated admin UI is Proposed. **Revision:** 27 October 2026. **Origin:** original proposal pp. 15-16.

## Context

Campus departments have overlapping responsibilities. Incorrect automated routing can bounce tickets between teams, so an administrator must review and choose a department.

## Alternatives

Automatic classification may reduce dispatch work but requires evaluation and a correction workflow. Human review costs staff time and depends on administrator availability.

## Decision

Retain human selection of the department. Ticket Service validates the department via REST and permits assignment from SUBMITTED or ASSIGNED. No AI routing or automatic spam classification is introduced.

## Consequences

Human oversight supports correction and reassignment but does not guarantee routing accuracy or eliminate spam. RBAC must eventually protect assignment; currently the API does not enforce the conceptual actor role.

## Verification

PASS: assignment and missing-department non-mutation in current evidence. Reassignment capability exists in source; NOT_RUN as a dedicated case in Person 3's latest suite. Admin permission enforcement is not implemented.
