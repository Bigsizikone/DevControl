import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database.module';
import { AdminController } from '../http/admin.controller';
import { AdminService } from '../infrastructure/admin.service';
import { bootstrapService } from './bootstrap';
import { SecurityController } from '../http/security.controller';
import { SecurityService } from '../infrastructure/security.service';
@Module({ imports: [DatabaseModule], controllers: [SecurityController, AdminController], providers: [SecurityService, AdminService] })
class SecurityModule {}
void bootstrapService(SecurityModule, 'security');
