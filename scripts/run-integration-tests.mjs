import { spawnSync } from 'node:child_process';

// Loaded by node --env-file-if-exists=.env.demo. Defaults are permitted only for the isolated local demo.
const env = { ...process.env };
if (env.FONDUE_ENV_FILE === '.env.demo') {
  const postgres = `postgresql://fondue:fondue@127.0.0.1:${env.POSTGRES_PORT ?? 5435}/ticket`;
  env.ROUTING_TEST_DATABASE_URL ??= postgres;
  env.PLATFORM_TEST_DATABASE_URL ??= postgres;
  env.PLATFORM_TEST_MONGODB_URL ??= `mongodb://127.0.0.1:${env.MONGO_PORT ?? 27020}`;
}
for (const key of ['ROUTING_TEST_DATABASE_URL', 'PLATFORM_TEST_DATABASE_URL', 'PLATFORM_TEST_MONGODB_URL']) {
  if (!env[key]?.trim()) throw new Error(`${key} is required: start the local demo or provide explicit test database URLs`);
}

const result = spawnSync(process.execPath, ['--test', 'tests/platform.integration.test.mjs', 'tests/routing.integration.test.mjs'], {
  env, stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
