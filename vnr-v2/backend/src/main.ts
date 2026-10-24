import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ErrorFilter } from './error.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  console.log(`Cá Ngựa Cách Mạng API (NestJS) đang chạy tại http://0.0.0.0:${port}/api`);
}
void bootstrap();
