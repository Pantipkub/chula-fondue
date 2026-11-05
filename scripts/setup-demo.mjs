import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (!existsSync('.env.demo')) {
  writeFileSync('.env.demo', `# Local demonstration only; never commit this file.\nFONDUE_ENV_FILE=.env.demo\nJWT_SECRET=${randomBytes(32).toString('hex')}\nADMIN_EMAIL=admin@fondue.test\nADMIN_PASSWORD=FondueDemo!2026\nEMAIL_MODE=record\nGATEWAY_PORT_HOST=3100\nWEB_PORT=8080\nPOSTGRES_PORT=5435\nMONGO_PORT=27020\nRABBITMQ_PORT=5674\nRABBITMQ_MANAGEMENT_PORT=15674\n`);
}
console.log('Local configuration ready: .env.demo (existing .env preserved).');
console.log('Start: docker compose --env-file .env.demo -p fondue-demo up -d --build');
console.log('Open http://localhost:8080');
