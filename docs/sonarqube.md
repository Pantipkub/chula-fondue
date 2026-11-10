# SonarQube verification

Run commands from the repository root. `sonar-project.properties` analyzes `frontend/src` and `services`, with `tests` classified as test code. Generated build files, dependencies and uploads are excluded; application code is included in coverage.

## Generate coverage and scan

```sh
npm run test:coverage
```

This builds every workspace, runs the Node tests through c8 with TypeScript source maps, and runs the frontend tests through Vitest. It produces repository-relative source paths in:

- `coverage/backend/lcov.info`
- `coverage/frontend/lcov.info`

For a scan that includes integration coverage, start the isolated demo using the README instructions, then run:

```sh
# Builds, runs unit/frontend tests, then collects real database integration coverage.
npm run test:coverage:demo
```

The integration command reads `.env.demo`, uses separate randomly named PostgreSQL schemas and MongoDB databases, and merges its coverage into the backend report. With `FONDUE_ENV_FILE=.env.demo`, test URLs default to the local demo ports. `ROUTING_TEST_DATABASE_URL`, `PLATFORM_TEST_DATABASE_URL` and `PLATFORM_TEST_MONGODB_URL` can explicitly override them. Outside demo mode, all three test URLs are required so a skipped suite cannot look like complete coverage. CI performs the same collection after starting the demo. A new unit coverage run clears the previous backend coverage collection; `test:coverage:demo` runs both steps in the required order.

Then scan using an existing analysis token in the current terminal:

```sh
export SONAR_HOST_URL='http://localhost:9000'
# Set SONAR_TOKEN in your terminal; do not commit it or paste it into reports.
npx @sonar/scan
```

Coverage collection alone does not guarantee the 80% new-code coverage gate. The server computes that value against its configured new-code baseline. Check the new analysis before reporting the gate as passed. Historical `CLOSED` issues can also disappear because of changes to scan scope; use open issues when comparing results.

## Security changes

- Auth, Department, Ticket and Analytics require their corresponding `*_DATABASE_URL` environment variable. Missing or whitespace-only values stop startup with a named configuration error; there are no embedded password fallbacks. Docker Compose already provides these values.
- Recovery and routing email validation use bounded string checks instead of a backtracking email regex. Notification URL trimming uses a linear trailing-slash scan.
- Toast IDs use `crypto.randomUUID()`.
- Cloudinary uploads use SHA-256 for the same signed `timestamp` field. [Cloudinary supports SHA-256 signatures](https://cloudinary.com/documentation/authentication_signatures); the regression test checks the signature against the exact transmitted timestamp without uploading to an external account.

Do not mark security findings as reviewed merely to change a score. Re-scan the changed code and inspect any remaining hotspots in SonarQube.

## Browser regression checks

With the frontend running, set `WEB_URL` to its URL and `BROWSER_CHANNEL` to `chrome` on macOS or `chromium` for an installed Playwright browser:

```sh
npm run test:ui:sonar
npm run test:ui:queue
```

These checks use intercepted API fixtures and never modify live tickets. They cover native dialog focus containment/restoration, Escape and backdrop dismissal, dropdown portals inside dialogs, keyboard confirmation without navigation, and queue filtering/pagination across 10 viewport sizes. Screenshots are saved under `test-results/sonar` and `test-results/staff-queue`.
