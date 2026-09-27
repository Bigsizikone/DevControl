import { ModulesService } from './plugins/modules.service';
import { ModulesController } from './plugins/modules.controller';
import { IntegrationsService } from './infrastructure/integrations.service';
import { IntegrationsController } from './http/integrations.controller';
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

@Module({
  imports: [DatabaseModule],
  controllers: [AccessController, RoutingController, HealthController, AdminController, TicketsController, ModulesController, IntegrationsController],
  providers: [AccessService, RoutingService, AdminService, TicketsService, ModulesService, IntegrationsService],
})
export class AppModule {}
