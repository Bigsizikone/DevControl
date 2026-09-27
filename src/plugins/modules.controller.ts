import { Body, Controller, ForbiddenException, Get, Headers, Param, Patch } from '@nestjs/common';
import { ModulesService } from './modules.service';
@Controller('modules')
export class ModulesController {
  constructor(private readonly modules: ModulesService) {}
  @Get() list() { return this.modules.list(); }
  @Patch(':code') update(@Param('code') code: string, @Headers('x-role') role: string, @Headers('x-user-id') userId: string, @Body() body: { enabled: boolean; revision: number }) {
    if (role !== 'admin') throw new ForbiddenException('Требуется роль администратора');
    return this.modules.setEnabled(code, body.enabled, body.revision, userId);
  }
}
