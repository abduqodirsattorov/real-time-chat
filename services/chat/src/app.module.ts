import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';

import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { CentrifugoModule } from './centrifugo/centrifugo.module';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { MeilisearchModule } from './meilisearch/meilisearch.module';

import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { JwtStrategy } from './common/guards/jwt.strategy';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

import { RoomsService } from './rooms/rooms.service';
import { RoomsController } from './rooms/rooms.controller';
import { MessagesService } from './messages/messages.service';
import { MessagesController } from './messages/messages.controller';
import { SupportService } from './support/support.service';
import { SupportController } from './support/support.controller';
import { SearchController } from './search/search.controller';
import { HealthController } from './health/health.controller';
import { ProductsController } from './products/products.controller';
import { ProductsService } from './products/products.service';
import { CustomersController } from './customers/customers.controller';
import { CustomersService } from './customers/customers.service';
import { TransactionsController } from './transactions/transactions.controller';
import { TransactionsService } from './transactions/transactions.service';
import { TagsController } from './tags/tags.controller';
import { TagsService } from './tags/tags.service';
import { FieldConfigsController } from './field-configs/field-configs.controller';
import { FieldConfigsService } from './field-configs/field-configs.service';
import { NovaController } from './nova/nova.controller';
import { NovaService } from './nova/nova.service';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport: process.env.LOG_PRETTY === 'true'
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
      },
    }),
    PassportModule,
    JwtModule.register({}),
    PrismaModule,
    RedisModule,
    CentrifugoModule,
    RabbitMQModule,
    MeilisearchModule,
  ],
  controllers: [
    RoomsController,
    MessagesController,
    SupportController,
    SearchController,
    HealthController,
    ProductsController,
    CustomersController,
    TransactionsController,
    TagsController,
    FieldConfigsController,
    NovaController,
  ],
  providers: [
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    RoomsService,
    MessagesService,
    SupportService,
    ProductsService,
    CustomersService,
    TransactionsService,
    TagsService,
    FieldConfigsService,
    NovaService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
