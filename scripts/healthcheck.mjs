import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const service = process.argv[2];
const requestId = `health-${randomUUID()}`;

async function checkHttp(port) {
  const response = await fetch(`http://127.0.0.1:${port}/ready`, {
    signal: AbortSignal.timeout(2000),
    headers: { 'x-request-id': requestId },
  });
  const result = await response.json();
  if (!response.ok || result.status !== 'ready' || result.service !== service) {
    throw new Error(`${service} readiness failed (HTTP ${response.status})`);
  }
}

async function checkGrpc() {
  const grpc = await import('@grpc/grpc-js');
  const loader = await import('@grpc/proto-loader');
  const definition = loader.loadSync(fileURLToPath(new URL('../proto/ticket.proto', import.meta.url)));
  const { ticket } = grpc.loadPackageDefinition(definition);
  const address = (process.env.TICKET_GRPC_URL ?? '0.0.0.0:50051')
    .replace(/^0\.0\.0\.0:/, '127.0.0.1:')
    .replace(/^\[::\]:/, '[::1]:');
  const client = new ticket.TicketService(address, grpc.credentials.createInsecure(), { 'grpc.enable_retries': 0 });
  const metadata = new grpc.Metadata();
  metadata.set('x-request-id', requestId);
  try {
    const result = await new Promise((resolve, reject) => {
      client.checkHealth({}, metadata, { deadline: Date.now() + 2000 }, (error, response) => error ? reject(error) : resolve(response));
    });
    if (result.status !== 'SERVING' || result.service !== 'ticket-service') throw new Error('Ticket database is not ready');
  } finally {
    client.close();
  }
}

try {
  if (service === 'api-gateway') await checkHttp(process.env.GATEWAY_PORT ?? 3000);
  else if (service === 'department-service') await checkHttp(process.env.DEPARTMENT_PORT ?? 3001);
  else if (service === 'ticket-service') await checkGrpc();
  else throw new Error('Expected api-gateway, department-service or ticket-service');
  console.log(`PASS ${service}: application readiness`);
} catch (error) {
  console.error(`FAIL ${service ?? 'unknown'}: ${error.message}`);
  process.exitCode = 1;
}
