import { Body, Controller, Delete, ForbiddenException, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { AdminService } from '../infrastructure/admin.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('tables')
  listTables(@Headers('x-role') role?: string) {
    this.assertAdmin(role);
    return this.admin.listTables();
  }

  @Get('tables/:table/rows')
  rows(@Headers('x-role') role: string | undefined, @Param('table') table: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    this.assertAdmin(role);
    return this.admin.getRows(table, Number(limit ?? 100), Number(offset ?? 0));
  }

  @Post('tables/:table/rows')
  create(@Headers('x-role') role: string | undefined, @Param('table') table: string, @Body() body: Record<string, unknown>) {
    this.assertAdmin(role);
    return this.admin.createRow(table, body);
  }

  @Patch('tables/:table/rows')
  update(@Headers('x-role') role: string | undefined, @Param('table') table: string, @Body() body: { key: Record<string, unknown>; values: Record<string, unknown> }) {
    this.assertAdmin(role);
    return this.admin.updateRow(table, body.key, body.values);
  }

  @Delete('tables/:table/rows')
  delete(@Headers('x-role') role: string | undefined, @Param('table') table: string, @Body() body: { key: Record<string, unknown> }) {
    this.assertAdmin(role);
    return this.admin.deleteRow(table, body.key);
  }

  private assertAdmin(role?: string) {
    if (role !== 'admin') throw new ForbiddenException('Требуется роль администратора');
  }
}
