import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { loadConfig } from './config/config';
import { serveStatic } from './config/static';

async function bootstrap() {
  const cfg = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  serveStatic(app);
  app.enableCors({ origin: cfg.corsOrigin });
  await app.listen(cfg.port);
  console.log(`VNR202 backend listening on :${cfg.port}`);
}

bootstrap();
