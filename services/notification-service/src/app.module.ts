import { EmailService } from './email.service.js';
import { InboxController } from './inbox.controller.js';
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { NotificationStore } from './notification-store.js';
import { NotificationsController } from './notifications.controller.js';
import { RecoveryController } from './recovery.controller.js';

@Module({
  controllers: [HealthController, NotificationsController, InboxController, RecoveryController],
  providers: [EmailService,
    {
      provide: NotificationStore,
      useFactory: () => new NotificationStore(process.env.MONGODB_URL ?? 'mongodb://localhost:27017'),
    },
  ],
})
export class AppModule {}
