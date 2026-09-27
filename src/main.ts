import { installReferenceEndpoint, installServiceGateway } from './plugins/gateway';
import { ModulesService } from './plugins/modules.service';
import { AdminService } from './infrastructure/admin.service';
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { join, resolve } from 'node:path';
import { AppModule } from './app.module';
import { DatabaseService } from './infrastructure/database.service';
import { installAuthentication } from './http/auth';

async function bootstrap() {
  const maxFileSizeMb = Number(process.env.MAX_VIOLATION_FILE_SIZE_MB ?? 200);
  // Вложения передаются как base64, поэтому JSON примерно на 33% больше файла.
  const requestBodyLimitMb = Math.max(10, Math.ceil(maxFileSizeMb * 1.4));
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser('json', { limit: `${requestBodyLimitMb}mb` });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const httpServer = app.getHttpAdapter().getInstance();
  httpServer.disable('x-powered-by');
  httpServer.set('trust proxy', 'loopback');
  const frontendDist = resolve(process.cwd(), 'frontend', 'dist');

  // Frontend использует единый origin и обращается к backend через /api/*.
  httpServer.use((request: { url: string }, _response: unknown, next: () => void) => {
    const base = process.env.APP_BASE_PATH || '/ServiceDesk';
    if (request.url === base) request.url = '/';
    else if (request.url.startsWith(`${base}/`)) request.url = request.url.slice(base.length);
    if (request.url === '/api') request.url = '/';
    else if (request.url.startsWith('/api/')) request.url = request.url.slice(4);
    next();
  });
  installReferenceEndpoint(httpServer, app.get(DatabaseService));
  await installAuthentication(httpServer, app.get(DatabaseService));
  installServiceGateway(httpServer, app.get(ModulesService), app.get(AdminService));
  app.useStaticAssets(frontendDist);
  httpServer.use((request: { method: string; headers: Record<string, string | undefined> }, response: { sendFile: (path: string) => void }, next: () => void) => {
    const acceptsHtml = request.headers.accept?.includes('text/html');
    if (request.method === 'GET' && acceptsHtml) response.sendFile(join(frontendDist, 'index.html'));
    else next();
  });
  await app.init();
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
