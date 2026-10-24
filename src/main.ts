import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadConfig } from './config/config';

async function bootstrap() {
  const cfg = loadConfig();
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: cfg.corsOrigin });
  await app.listen(cfg.port);
  console.log(`VNR202 backend listening on :${cfg.port}`);
}

bootstrap();
