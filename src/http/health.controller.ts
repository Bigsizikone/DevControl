import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../infrastructure/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async getHealth() {
    const database = await this.database.ping();
    return {
      status: database ? 'ok' : 'degraded',
      service: 'service-desk-api',
      database: database ? 'up' : 'down',
    };
  }
}
