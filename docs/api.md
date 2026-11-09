# Gateway API

Use `Authorization: Bearer <accessToken>`. Local demo base: `http://localhost:3100`. The web frontend proxies `/api/*` to these paths.

| Method / path | Access | Body / behavior |
| --- | --- | --- |
| POST /auth/register | Public | `{email,password}`; always Reporter |
| POST /auth/login | Public | `{email,password}` → `{accessToken,user}` |
| POST /auth/guest | Public | Guest token |
| GET /auth/me | Any token | Current claims |
| GET /auth/users | Admin | Safe account fields, no hashes |
| POST /auth/users | Admin | `{email,password,role,departmentId?}` |
| GET/POST /departments | Admin | List / `{name,contactEmail,buildings}` |
| GET/PUT/DELETE /departments/:id | Admin | Department CRUD |
| GET/POST /routing-rules | Admin | List / `{category,departmentId,enabled?}`; one enabled rule per canonical category |
| PUT /routing-rules/:id | Admin | Update category, department or enabled; no null values |
| POST /routing-rules/match | Admin | `{category}` → MATCHED with rule/department snapshot, NO_RULE or AMBIGUOUS_RULES |
| POST /tickets | Reporter/Guest | Multipart: category, location, description, photos; Guest contactEmail |
| GET /tickets | Reporter/Staff/Admin | Scoped list; status, departmentId, reporterEmail, includeCancelled filters |
| GET /tickets/:id/history | Authorized owner/Staff/Admin | Ticket and ordered timeline; Guest requires original subject |
| DELETE /tickets/:id | Reporter owner | Cancel Submitted/Assigned before staff starts; notify assigned department |
| POST /tickets/:id/category | Admin | `{category}` while Submitted/Assigned |
| POST /tickets/:id/assign | Admin | `{departmentId}` while Submitted/Assigned |
| POST /tickets/:id/reject | Admin | `{reason}` while Submitted/Assigned; notify reporter and assigned department |
| POST /tickets/:id/retry-routing | Admin | Requeue Submitted ticket; requires AUTO_ROUTING_ENABLED=true |
| POST /tickets/:id/start | Assigned Staff | Assigned → In Progress |
| POST /tickets/:id/resolve | Assigned Staff | Multipart photos; In Progress → Resolved |
| POST /tickets/:id/confirm | Reporter owner | Resolved → Closed |
| POST /tickets/:id/reopen | Reporter owner | `{reason}`; Resolved → In Progress; department notification |
| GET /analytics | Admin | `from=YYYY-MM-DD&to=YYYY-MM-DD&category=&departmentId=` |
| GET /notifications | Reporter/Staff/Admin | Recipient-scoped; Admin sees all; most recent 100 |
| GET /health, /health/ready | Public | Gateway health/dependency status |

Errors: 400 invalid data, 401 missing/expired token, 403 ownership/role, 404 missing record, 409 invalid state/concurrent change, 429 rate limit, 503 unavailable dependency, 504 timeout. `X-Request-Id` correlates HTTP, gRPC and events.

When auto-routing is enabled, POST /tickets saves the ticket and a durable routing job atomically, then returns 201 without waiting for Department Service. Ticket responses include `assignmentSource` (empty for legacy, AUTO or ADMIN), `routingRuleId`, `routingStatus` (NONE/PENDING/RETRY/REVIEW/DONE/STOPPED) and `routingReason`. Clients may poll history while PENDING/RETRY. Department contact snapshots and worker leases remain internal.

Other/unknown categories go to manual review. Rule changes affect future evaluations, including retries, and do not move already assigned tickets. A department with an enabled rule cannot be deleted (409); disable or move its rules first. See [routing implementation](auto-routing-plan.md) for retry timing and concurrency behavior.
