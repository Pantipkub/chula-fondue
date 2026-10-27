// Used by the Docker healthchecks: exits 0 when the URL answers 2xx within 3 s, otherwise 1.
//   node /app/healthcheck.mjs http://localhost:3002/health/ready
const url = process.argv[2];
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  process.exit(response.ok ? 0 : 1);
} catch {
  process.exit(1);
}
