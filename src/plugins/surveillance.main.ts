import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database.module';
import { AdminController } from '../http/admin.controller';
import { AdminService } from '../infrastructure/admin.service';
import { bootstrapService } from './bootstrap';
import { CamerasController } from '../http/cameras.controller';
import { CameraService } from '../infrastructure/camera.service';
import { CameraEventBus } from '../domain/camera.events';
import { SurveillanceCasesController, CasesService } from './cases';
@Module({ imports: [DatabaseModule], controllers: [CamerasController, AdminController, SurveillanceCasesController], providers: [CameraService, AdminService, CameraEventBus, CasesService] })
class SurveillanceModule {}
void bootstrapService(SurveillanceModule, 'surveillance');
