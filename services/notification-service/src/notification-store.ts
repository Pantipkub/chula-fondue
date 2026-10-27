import { Logger } from '@nestjs/common';
import { Collection, Db, MongoClient } from 'mongodb';

// Hands out the notifications collection on a connected MongoClient.
// The driver recovers from outages after it has connected once, but a client whose FIRST connection
// fails stays closed for good. So a failed client is dropped here and the next call starts a new one:
// Notification Service can start while MongoDB is unreachable and begin recording once it is back.
export class NotificationStore {
  private readonly logger = new Logger('NotificationStore');
  private connecting?: Promise<{ db: Db; collection: Collection }>;

  constructor(private readonly url: string) {}

  async collection() {
    return (await this.connection()).collection;
  }

  async ping() {
    await (await this.connection()).db.command({ ping: 1 });
  }

  private connection() {
    this.connecting ??= this.connect().catch((error) => {
      this.connecting = undefined;
      throw error;
    });
    return this.connecting;
  }

  private async connect() {
    const client = new MongoClient(this.url, { serverSelectionTimeoutMS: 5000 });
    try {
      await client.connect();
    } catch (error) {
      await client.close().catch(() => undefined);
      throw error;
    }
    const db = client.db('notification');
    const collection = db.collection('notifications');
    // One record per event id (events from before Progress 3 have none, hence sparse).
    await collection.createIndex({ eventId: 1 }, { unique: true, sparse: true });
    this.logger.log('Connected to MongoDB');
    return { db, collection };
  }
}
