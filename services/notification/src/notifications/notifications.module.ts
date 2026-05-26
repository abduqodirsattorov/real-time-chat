import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { I18nService } from './i18n.service';

@Module({
  providers: [NotificationsService, I18nService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
