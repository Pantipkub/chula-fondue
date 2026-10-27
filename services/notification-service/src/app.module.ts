import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { NotificationStore } from './notification-store.js';
import { NotificationsController } from './notifications.controller.js';

@Module({
  controllers: [HealthController, NotificationsController],
  providers: [
    {
      provide: NotificationStore,
      useFactory: () => new NotificationStore(process.env.MONGODB_URL ?? 'mongodb://localhost:27017'),
    },
  ],
})
export class AppModule {}
