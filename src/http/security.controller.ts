import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Res, Delete } from '@nestjs/common';
import { SecurityService, type SecurityContext } from '../infrastructure/security.service';

@Controller('security')
export class SecurityController {
  constructor(private readonly security: SecurityService) {}
  @Get('meta') meta() { return this.security.meta(); }
  @Get('dashboard') dashboard(@Headers('x-role') role?: string, @Headers('x-user-id') userId?: string) { return this.security.dashboard(this.context(role, userId)); }
  @Get('records') list(@Query('type') type: string | undefined, @Query() query: Record<string, string | undefined>, @Headers('x-role') role?: string, @Headers('x-user-id') userId?: string) { return this.security.list(type, query, this.context(role, userId)); }
  @Get('records/:id') get(@Param('id') id: string, @Headers('x-role') role?: string, @Headers('x-user-id') userId?: string) { return this.security.get(id, this.context(role, userId)); }
  @Post('records') create(@Body() body: Record<string, unknown>, @Headers('x-role') role?: string, @Headers('x-user-id') userId?: string) { return this.security.create(body, this.context(role, userId)); }
  @Patch('records/:id') update(@Param('id') id: string, @Body() body: Record<string, unknown>, @Headers('x-role') role?: string, @Headers('x-user-id') userId?: string) { return this.security.update(id, body, this.context(role, userId)); }
  @Delete('records/:id') remove(@Param('id') id: string, @Headers('x-role') role?: string, @Headers('x-user-id') userId?: string) { return this.security.remove(id, this.context(role, userId)); }
  @Post('records/:id/comments') comment(@Param('id') id: string, @Body() body: Record<string, unknown>, @Headers('x-role') role?: string, @Headers('x-user-id') userId?: string) { return this.security.comment(id, body, this.context(role, userId)); }
  @Post('records/:id/attachments') attachment(@Param('id') id: string, @Body() body: Record<string, unknown>, @Headers('x-role') role?: string, @Headers('x-user-id') userId?: string) { return this.security.addAttachment(id, body, this.context(role, userId)); }
  @Get('records/:id/attachments/:attachmentId/download') async download(@Param('id') recordId: string, @Param('attachmentId') attachmentId: string, @Headers('x-role') role: string | undefined, @Headers('x-user-id') userId: string | undefined, @Res() response: any) { const file = await this.security.download(recordId, attachmentId, this.context(role, userId)); response.setHeader('Content-Type', file.attachment.mime_type); response.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.attachment.original_file_name)}"`); response.send(file.data); }
  @Post('/webhooks/security-event') webhook(@Body() body: Record<string, unknown>, @Headers('x-role') role?: string, @Headers('x-user-id') userId?: string) { return this.security.webhook(body, this.context(role, userId)); }
  private context(role?: string, userId?: string): SecurityContext { return { role: role ?? '', userId: userId ?? '' }; }
}
