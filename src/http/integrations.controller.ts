import { Body, Controller, ForbiddenException, Get, Headers, Post } from '@nestjs/common';
import { IntegrationsService } from '../infrastructure/integrations.service';
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}
  private admin(role: string) { if (role !== 'admin') throw new ForbiddenException('Требуется роль администратора'); }
  @Get('overview') async overview(@Headers('x-role') role: string) { this.admin(role); return { integrations: await this.integrations.listIntegrations() }; }
  @Get('api-description') description(@Headers('x-role') role: string) { this.admin(role); return this.integrations.apiDescription(); }
  @Post() create(@Headers('x-role') role: string, @Body() body: Parameters<IntegrationsService['createIntegration']>[0]) { this.admin(role); return this.integrations.createIntegration(body); }
}
