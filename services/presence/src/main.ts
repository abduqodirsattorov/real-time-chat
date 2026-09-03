import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import { applyHttpHardening } from './common/http-hardening';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  applyHttpHardening(app);
  app.enableShutdownHooks();
  app.useLogger(app.get(Logger));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(process.env.PORT ?? 3003);
}

bootstrap();
