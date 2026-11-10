# Platform hardening — 10 November 2026

This change implements the first four items of the follow-up plan: department notifications, safe department retirement, account lifecycle, and idempotent reporting. Priority/SLA, individual assignees, discussion threads, actor audit fields, building-based routing, production migrations and backups remain future work.

## Department notifications

Ticket events now identify a department recipient using `recipientDepartmentId`, separately from the email address used for delivery. A Staff inbox includes their personal notifications and notifications addressed to their current department. Gateway derives both scopes from the freshly validated account, ignoring browser-supplied recipient filters. Reporter inboxes remain personal; Admin can see all ticket notifications.

Read state is stored per user, not per department. `PUT /notifications/:eventId/read` returns 204 and checks the same audience as listing; inaccessible events return 404. The UI links to the detail page for the signed-in role. The inbox shows the latest 100 records. Historical events without a department audience are not backfilled automatically.

## Department retirement

`DELETE /departments/:id` now retires the department (`active=false`) rather than removing its identity. It returns 409 while enabled routing rules, active Staff accounts, or Assigned/In Progress/Resolved tickets still reference it. Dependency checks fail closed with 503 if usage cannot be verified. Move or disable accounts, move/finish open work, and disable/move rules before retirement.

Inactive departments are hidden from default lists/lookups and cannot receive new staff or manual/automatic assignments. Admin can list/read them with `includeInactive=true`, or restore them with `PUT /departments/:id {"active":true}`. Historical tickets and disabled accounts keep their references. These checks span independent services; retaining the department row preserves historical identity without requiring a cross-database delete transaction.

## Account lifecycle

| Gateway endpoint | Access | Behavior |
| --- | --- | --- |
| `PUT /auth/users/:id` | Admin | Update role, department or active flag; validate Staff department |
| `POST /auth/password` | Signed-in account | `{currentPassword,password}`; change password and revoke all sessions |
| `POST /auth/logout` | Signed-in account | Revoke all existing tokens for this account |
| `POST /auth/forgot-password` | Public, rate limited | `{email}`; same reply for an unknown or disabled account |
| `POST /auth/reset-password` | Public, rate limited | `{token,password}`; consume a recovery link once |

Account changes increment `tokenVersion`. Gateway verifies JWT signatures and checks current account status with Auth Service on each authenticated account request. Old tokens, including tokens issued before this upgrade, stop working after account changes. If Auth Service is unavailable, protected account requests fail with 503 rather than trusting stale rights. Existing local logout still clears browser state when the backend is offline; server revocation requires a successful request.

Self-disable and removal/demotion of the final active Admin are refused. An account-write transaction lock serializes these changes, recovery consumption, logout and password changes. Account-list responses exclude password hashes, token versions and recovery data.

Recovery links use a random 256-bit token, expire after 30 minutes, and are stored as SHA-256 hashes for validation. New requests replace older links. Role/department/account/password changes invalidate outstanding links. Issuance and email outbox insertion commit atomically in PostgreSQL. A worker retries transfer to Notification Service, where event IDs deduplicate requests. Recovery emails are excluded from every public notification inbox, including Admin's. MongoDB recovery records have an expiry index.

Set `WEB_PUBLIC_URL` to the browser-facing origin (default `http://localhost:8080`) in the environment shared by Auth and Notification services. This fixed value builds the recovery link; HTTP Host headers are not used. Gmail delivery still requires the existing OAuth configuration and `EMAIL_MODE=gmail`. `EMAIL_MODE=record` records mail privately for demo verification and does not send an email or return a reset token through the API. Live Gmail account delivery is not claimed by these tests.

UI routes: `/forgot-password`, `/reset-password?token=...`, `/account`, and the account-management dialog under `/admin/users`.

### Sign-in across browser tabs

A successful login creates a new browser-session ID, including when the same account receives an identical JWT. Existing signed-in tabs on the same origin/browser profile clear their own credentials, navigate to `/login`, and display a replacement notice. Reloading an evicted tab preserves its signed-out state. A newly opened tab can initially inherit the active browser session; explicit login replaces the previous session in other signed-in tabs.

Each tab captures its own credentials in memory/sessionStorage. An atomic shared envelope in localStorage announces the current browser session, while `fondue.token` remains a compatibility mirror for existing sessions. Storage events synchronize tabs; focus/visibility and a check before each API request also detect a replacement after suspension. An old screen cannot silently start sending requests under the new account.

Replacement clears the old tab locally. It does not call the account-wide logout endpoint or erase the winning tab's credentials. Guest access in an evicted tab stays local to that tab. A 401 from an earlier request clears credentials only if its captured session ID/token still matches the current session. Failed login attempts leave other tabs signed in. Browser profiles/isolated contexts have separate session ownership.

Run `npm run test:ui:auth-tabs` against the frontend (`WEB_URL` defaults to `http://127.0.0.1:8080`). This suite uses real same-origin browser tabs and controlled HTTP responses to cover account replacement, identical JWTs, refresh isolation, private guests, separate contexts, late 401s and deferred browser events. CI includes the suite. Existing tabs need one refresh after deploying the new frontend bundle.

## Retry-safe reporting

The browser supplies a UUID `Idempotency-Key` for each report payload and retains it across failed attempts on the current form. Editing the payload creates a new key. Other API clients should supply this header when retrying; requests without it retain their previous create-every-time behavior.

Gateway hashes the actual validated photo bytes and report fields. It looks up an accepted submission before uploading again. Ticket Service scopes the key to the reporter and serializes competing requests with a PostgreSQL transaction lock and unique index. Ticket, history, routing job and outbox commit together. The same key/content returns the same ticket ID; changed content returns 409. A rollback permits a later retry. New keys or reporters represent independent submissions. Photo URLs and submission fingerprints are never treated as interchangeable user content, and internal submission fields are omitted from ticket responses/events.

## Verification

Run against the isolated demo:

```sh
npm test
npm run typecheck
docker compose --env-file .env.demo -p fondue-demo up -d --build --wait
npm run test:platform
npm run test:platform:e2e
npm run test:platform:ui
```

`test:platform` creates and drops only random PostgreSQL schemas and a random MongoDB database. It also accepts explicit `PLATFORM_TEST_DATABASE_URL` and `PLATFORM_TEST_MONGODB_URL`. Without explicit URLs or the demo environment, these integration tests skip during `npm test`.

API/browser suites create uniquely named fixtures in the demo. They require `FONDUE_ENV_FILE=.env.demo`; do not point them at production. Browser tests use installed Chrome on macOS or Playwright Chromium elsewhere, with `BROWSER_CHANNEL` available to override. CI uses a higher authentication limit for repeated fixture creation; the application default remains 30/minute/IP.

Platform tests generate fixture passwords, replacement passwords and the isolated integration-test JWT secret with `node:crypto` at runtime. API/browser suites require the seeded admin's `ADMIN_PASSWORD` from the environment (normally the ignored `.env.demo`); they have no hardcoded admin-password fallback. Keep real credentials out of tracked files.

The browser suite simulates a 504 after a successful report commit, then retries the same form and checks that only one report exists. Screenshots and JSON evidence are saved under ignored `test-results/`. Local results are separate from a future CI run.

### Local results — 10 November 2026

| Check | Result |
| --- | --- |
| Production builds | All six services and frontend pass; updated demo containers started successfully |
| `npm run typecheck` | All workspaces pass |
| `node --test tests/domain.test.mjs` | 7 pass, including recovery MIME and mocked Gmail |
| `npm run test:platform` | 10 pass with real PostgreSQL/MongoDB; no skipped tests |
| Existing PostgreSQL routing integration | 15 pass including the parent test |
| `npm run test:e2e` | 57 successful API assertions |
| `npm run test:platform:e2e` | 63 successful API assertions, including the recovery outbox → Notification Service → MongoDB path |
| `npm run test:platform:ui` | 8 responsive views at 1440/390 px; actual notification/read/link, account disable, password change and lost-response retry pass |
| `npm run test:ui:auth-tabs` | Real browser tabs with controlled HTTP: different/same account and identical JWT replacement, failed login, old-tab reload, private guests, isolated contexts, late 401 and deferred events pass |
| Visual inspection | Desktop account form and mobile account dialog/notification views inspected |

API/UI JSON evidence: `test-results/platform-e2e.json`, `test-results/platform-ui.json`, and `test-results/e2e.json`. Gmail delivery remains record-only in this demo. CI includes the new suites, but a remote CI result has not been checked in this task.
