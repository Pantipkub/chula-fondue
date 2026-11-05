# Verification — 5 November 2026

Verified locally against the isolated `fondue-demo` Docker Compose project. The existing `.env` and shared databases were not used.

| Check | Result |
| --- | --- |
| TypeScript + production frontend build | All six backend services and frontend pass |
| Unit checks | 5 pass: exact MTTR, empty/reopened data, rate limiting, MIME safety, mocked Gmail OAuth/send |
| API end-to-end | 59 assertions pass, including ownership, roles, workflow, concurrent start, guest email impersonation, department CRUD, and invalid media |
| Broker outage | Ticket assignment commits while RabbitMQ is stopped; event stays in PostgreSQL outbox and is recorded after recovery |
| Seven-day closure | A local fixture aged past seven days closes with an audit-history entry |
| Public UI | 10 responsive route checks at 1440 and 390 px |
| Authenticated UI | Admin/Reporter/Staff login, 20 responsive route checks, and actual browser photo-report submission |
| Dependency audit | 0 reported vulnerabilities after updating the lockfile |
| Container health | 10 running containers healthy; volume initialization job exits successfully |
| History-read workload | 50 concurrent clients for 60 seconds, 21,163 requests, 0 failures, p95 110.8 ms, maximum 555.0 ms |

The workload result describes one local read endpoint with short pacing between requests. It does not prove 1,000-user capacity, submission latency under load, or term-long uptime. Gmail calls were tested using a mock HTTP transport; actual email delivery needs sender OAuth credentials and a live verification run. Cloudinary remains optional and was not exercised with a real account.

Reproduce from the root:

```sh
npm test
npm run setup:demo
docker compose --env-file .env.demo -p fondue-demo up -d --build --wait
npm run test:e2e
npm run test:recovery
npm run seed:demo
# WEB_URL=http://127.0.0.1:8080 for both UI commands
npm run test:ui
npm run test:ui:live
node --env-file=.env.demo tests/performance.mjs
```

Set `BROWSER_CHANNEL=chromium` after `npx playwright install chromium` on Linux. Windows defaults to installed Edge. JSON results and screenshots are written to ignored `test-results/`; CI uploads its own results as an artifact. Historical milestone evidence is retained separately under `docs/` and `demo-progress3/`.
