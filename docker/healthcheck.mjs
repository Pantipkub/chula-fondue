import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const sharedProbe = fileURLToPath(new URL('../scripts/healthcheck.mjs', import.meta.url));
const service = process.argv[2];
const services = ['api-gateway', 'department-service', 'ticket-service'];

if (!services.includes(service)) {
  console.error(`Usage: node docker/healthcheck.mjs <${services.join('|')}>`);
  process.exit(1);
}

// Person 2 owns the application health/readiness contract. Prefer that probe
// as soon as it is included in the image; keep infrastructure runnable meanwhile.
if (existsSync(sharedProbe)) {
  const result = spawnSync(process.execPath, [sharedProbe, service], {
    cwd: root,
    stdio: 'inherit',
    timeout: 4000,
  });
  process.exit(result.status === 0 ? 0 : 1);
}

async function checkHttp(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  await response.json();
}

async function checkTicket() {
  const grpc = await import('@grpc/grpc-js');
  const protoLoader = await import('@grpc/proto-loader');
  const proto = fileURLToPath(new URL('../proto/ticket.proto', import.meta.url));
  const definition = protoLoader.loadSync(proto);
  const { ticket } = grpc.loadPackageDefinition(definition);
  const address = (process.env.TICKET_GRPC_URL ?? '0.0.0.0:50051')
    .replace(/^0\.0\.0\.0:/, '127.0.0.1:')
    .replace(/^\[::\]:/, '[::1]:');
  const client = new ticket.TicketService(address, grpc.credentials.createInsecure());
  try {
    await new Promise((resolve, reject) => {
      client.listTickets({}, { deadline: Date.now() + 2000 }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  } finally {
    client.close();
  }
}

try {
  if (service === 'department-service') {
    await checkHttp(`http://127.0.0.1:${process.env.DEPARTMENT_PORT ?? 3001}/departments`);
  } else if (service === 'ticket-service') {
    await checkTicket();
  } else {
    const url = `http://127.0.0.1:${process.env.GATEWAY_PORT ?? 3000}`;
    await Promise.all([checkHttp(`${url}/departments`), checkHttp(`${url}/tickets`)]);
  }
  console.log(`PASS ${service}: bootstrap read probe (application health probe pending)`);
} catch (error) {
  console.error(`FAIL ${service}: ${error.message}`);
  process.exitCode = 1;
}
