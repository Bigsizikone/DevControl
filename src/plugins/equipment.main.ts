import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database.module';
import { AdminController } from '../http/admin.controller';
import { AdminService } from '../infrastructure/admin.service';
import { bootstrapService } from './bootstrap';
import { AssetsController } from '../http/assets.controller';
import { AssetsService } from '../infrastructure/assets.service';
import { EquipmentCasesController, CasesService } from './cases';
@Module({ imports: [DatabaseModule], controllers: [AssetsController, AdminController, EquipmentCasesController], providers: [AssetsService, AdminService, CasesService] })
class EquipmentModule {}
void bootstrapService(EquipmentModule, 'equipment');
