// Prints the notifications Notification Service recorded in MongoDB for one ticket.
// Usage: node --env-file=.env demo-progress2/show-notifications.js <ticketId> [expectedCount]
// Notifications arrive through RabbitMQ a moment after the status change, so this waits for them.
const { MongoClient } = require('mongodb');

const [ticketId, expected = '1'] = process.argv.slice(2);
if (!ticketId) {
  console.error('Usage: node --env-file=.env demo-progress2/show-notifications.js <ticketId> [expectedCount]');
  process.exit(1);
}

async function main() {
  const client = new MongoClient(process.env.MONGODB_URL ?? 'mongodb://localhost:27017');
  const notifications = client.db('notification').collection('notifications');
  let found = [];
  let lastError;
  for (let attempt = 0; attempt < 20 && found.length < Number(expected); attempt++) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      found = await notifications.find({ ticketId }, { projection: { _id: 0 } }).sort({ receivedAt: 1 }).toArray();
    } catch (error) {
      lastError = error; // a dropped connection is retried like "not there yet"
    }
  }
  await client.close();
  if (!found.length && lastError) console.log(`MongoDB could not be read: ${lastError.message}`);
  console.log(`$ db.notifications.find({ ticketId: "${ticketId}" })`);
  console.log(JSON.stringify(found, null, 2));
  const ok = found.length === Number(expected);
  console.log(`-> ${found.length} notification(s) in MongoDB (expected ${expected})${ok ? '' : ' FAILED'}`);
  process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
