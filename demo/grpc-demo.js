// gRPC CRUD demo on ticket-service (checks G1-G8). Stands in for grpcurl and loads the same proto file.
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const idsFile = join(__dirname, '.ids');
if (!existsSync(idsFile)) {
  console.error('demo/.ids not found: run demo/rest-demo.sh first, it creates the departments.');
  process.exit(1);
}
const { DEPT_A, DEPT_B } = Object.fromEntries(
  readFileSync(idsFile, 'utf8').trim().split(/\r?\n/).map((line) => line.split('=')),
);

const definition = protoLoader.loadSync(join(__dirname, '../proto/ticket.proto'), { defaults: true });
const { ticket } = grpc.loadPackageDefinition(definition);
const address = process.env.TICKET_SERVICE_URL ?? 'localhost:50051';
const client = new ticket.TicketService(address, grpc.credentials.createInsecure());

let failed = false;
const step = (title) => console.log(`\n=== ${title} ===`);

function check(label, ok) {
  console.log(`   ${ok ? 'ok    ' : 'FAILED'} ${label}`);
  if (!ok) failed = true;
}

// Prints the call, then the response or gRPC error. Resolves to the response (undefined on error).
function call(expected, method, request) {
  console.log(`$ grpc ${address} ticket.TicketService/${method} ${JSON.stringify(request)}`);
  return new Promise((resolve) => {
    client[method](request, (error, response) => {
      const code = error ? grpc.status[error.code] : 'OK';
      console.log(error ? `ERROR ${code}: ${error.details}` : JSON.stringify(response, null, 2));
      check(`-> ${code} (expected ${expected})`, code === expected);
      resolve(response);
    });
  });
}

async function main() {
  step('G1 CreateTicket twice');
  const t1 = await call('OK', 'CreateTicket', {
    category: 'Electrical',
    location: 'ENG3 room 315',
    description: 'Ceiling light is flickering',
    photoUrl: 'https://example.com/photos/light.jpg',
    reporterEmail: 'student1@student.chula.ac.th',
  });
  const t2 = await call('OK', 'CreateTicket', {
    category: 'Grounds',
    location: 'Walkway behind the Central Library',
    description: 'Broken paving stone',
    reporterEmail: 'student2@student.chula.ac.th',
  });
  check('both tickets are SUBMITTED', t1?.status === 'SUBMITTED' && t2?.status === 'SUBMITTED');

  step('G2 ListTickets');
  let list = await call('OK', 'ListTickets', {});
  check('lists both tickets', list?.tickets.length === 2);

  step('G3 AssignTicket T1 to department A (watch the ticket-service log)');
  const assigned = await call('OK', 'AssignTicket', { id: t1.id, departmentId: DEPT_A });
  check('T1 is ASSIGNED with departmentName', assigned?.status === 'ASSIGNED' && !!assigned.departmentName);

  step('G4 GetTicketHistory T1');
  const t1History = await call('OK', 'GetTicketHistory', { id: t1.id });
  check(
    'history is SUBMITTED then ASSIGNED',
    t1History?.history.map((entry) => entry.toStatus).join() === 'SUBMITTED,ASSIGNED',
  );

  step('G5 AssignTicket T2 to department B (deleted in R6)');
  await call('NOT_FOUND', 'AssignTicket', { id: t2.id, departmentId: DEPT_B });
  const t2History = await call('OK', 'GetTicketHistory', { id: t2.id });
  check('T2 is still SUBMITTED', t2History?.ticket.status === 'SUBMITTED');

  step('G6 CancelTicket T2 (soft delete)');
  const cancelled = await call('OK', 'CancelTicket', { id: t2.id });
  check('T2 is CANCELLED', cancelled?.status === 'CANCELLED');

  step('G7 ListTickets');
  list = await call('OK', 'ListTickets', {});
  check('lists only T1', list?.tickets.length === 1 && list.tickets[0].id === t1.id);

  step('G8 CancelTicket T1 (not allowed once ASSIGNED)');
  await call('FAILED_PRECONDITION', 'CancelTicket', { id: t1.id });
}

main()
  .catch((error) => {
    console.error(error);
    failed = true;
  })
  .finally(() => {
    client.close();
    process.exitCode = failed ? 1 : 0;
  });
