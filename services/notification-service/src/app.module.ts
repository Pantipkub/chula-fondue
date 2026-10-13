import { Module } from '@nestjs/common';
import { MongoClient } from 'mongodb';
import { NotificationsController } from './notifications.controller.js';

@Module({
  controllers: [NotificationsController],
  providers: [
    {
      provide: 'NOTIFICATIONS',
      // The driver connects on first use and retries, so a brief MongoDB outage at startup is not fatal.
      useFactory: () =>
        new MongoClient(process.env.MONGODB_URL ?? 'mongodb://localhost:27017')
          .db('notification')
          .collection('notifications'),
    },
  ],
})
export class AppModule {}
