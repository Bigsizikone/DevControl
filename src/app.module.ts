import { Module } from '@nestjs/common';
import { AccessService } from './domain/access.service';
import { RoutingService } from './domain/routing.service';
import { AccessController } from './http/access.controller';
import { RoutingController } from './http/routing.controller';
import { HealthController } from './http/health.controller';
import { DatabaseModule } from './infrastructure/database.module';
import { AdminService } from './infrastructure/admin.service';
import { AdminController } from './http/admin.controller';
import { TicketsController } from './http/tickets.controller';
import { TicketsService } from './infrastructure/tickets.service';
import { AssetsController } from './http/assets.controller';
import { AssetsService } from './infrastructure/assets.service';
import { CamerasController } from './http/cameras.controller';
import { CameraService } from './infrastructure/camera.service';
import { CameraEventBus } from './domain/camera.events';
import { SecurityController } from './http/security.controller';
import { SecurityService } from './infrastructure/security.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AccessController, RoutingController, HealthController, AdminController, TicketsController, AssetsController, CamerasController, SecurityController],
  providers: [AccessService, RoutingService, AdminService, TicketsService, AssetsService, CameraService, CameraEventBus, SecurityService],
})
export class AppModule {}
