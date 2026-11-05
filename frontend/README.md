# Frontend

React + TypeScript with role-specific Thai-language views. This folder is an npm workspace in the root monorepo.

From the repository root:

```sh
npm ci
npm run dev:web
```

Vite serves port 5173 and proxies `/api` and `/uploads` to `http://localhost:3000`. Set `GATEWAY_URL=http://localhost:3100` when using the isolated demo stack. For the complete application use Docker Compose as described in the root README; nginx serves port 8080.

Routes cover login/register, guest reports and tracking, reporter history/confirmation, department work queues, admin routing/departments/accounts, backend analytics and notification records. Guest tracking requires the same JWT subject that created the report. Analytics data comes from the dedicated service, not browser-side estimates.

Verification commands and current evidence are documented in the root README and `docs/verification.md`.
