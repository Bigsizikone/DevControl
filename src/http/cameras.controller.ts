import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query, Res } from '@nestjs/common';
import { CameraService, type CameraContext } from '../infrastructure/camera.service';

@Controller('cameras')
export class CamerasController {
  constructor(private readonly cameras: CameraService) {}

  @Get('meta') meta(@Headers('x-role') role?: string, @Headers('x-user-id') userId?: string) { return this.cameras.meta(this.context(role, userId)); }
  @Get('schedule') schedule(@Headers('x-role') role: string | undefined, @Headers('x-user-id') userId: string | undefined, @Query() query: Record<string, string | undefined>) { return this.cameras.listSchedule(this.context(role, userId), query); }
  @Post('schedule') createSchedule(@Headers('x-role') role: string | undefined, @Headers('x-user-id') userId: string | undefined, @Body() body: Record<string, unknown>) { return this.cameras.createSchedule(body, this.context(role, userId)); }
  @Post('schedule/generate') generate(@Headers('x-role') role: string | undefined, @Headers('x-user-id') userId: string | undefined, @Body() body: Record<string, unknown>) { return this.cameras.generateSchedule(body, this.context(role, userId)); }
  @Post('schedule/recommend') recommend(@Headers('x-role') role: string | undefined, @Headers('x-user-id') userId: string | undefined, @Body() body: Record<string, unknown>) { return this.cameras.recommend(body, this.context(role, userId)); }
  @Get('schedule/:id') getSchedule(@Headers('x-role') role: string | undefined, @Headers('x-user-id') userId: string | undefined, @Param('id') id: string) { return this.cameras.getSchedule(id, this.context(role, userId)); }
  @Put('schedule/:id') updateSchedule(@Headers('x-role') role: string | undefined, @Headers('x-user-id') userId: string | undefined, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.cameras.updateSchedule(id, body, this.context(role, userId)); }
  @Delete('schedule/:id') deleteSchedule(@Headers('x-role') role: string | undefined, @Headers('x-user-id') userId: string | undefined, @Param('id') id: string) { return this.cameras.deleteSchedule(id, this.context(role, userId)); }

  @Get('violations') violations(@Headers('x-role') role: string | undefined, @Headers('x-user-id') userId: string | undefined, @Query() query: Record<string, string | undefined>) { return this.cameras.listViolations(this.context(role, userId), query); }
  @Post('violations') createViolation(@Headers('x-role') role: string | undefined, @Headers('x-user-id') userId: string | undefined, @Body() body: Record<string, unknown>) { return this.cameras.createViolation(body, this.context(role, userId)); }
  @Get('violations/:id') getViolation(@Headers('x-role') role: string | undefined, @Headers('x-user-id') userId: string | undefined, @Param('id') id: string) { return this.cameras.getViolation(id, this.context(role, userId)); }
  @Put('violations/:id') updateViolation(@Headers('x-role') role: string | undefined, @Headers('x-user-id') userId: string | undefined, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.cameras.updateViolation(id, body, this.context(role, userId)); }
  @Delete('violations/:id') deleteViolation(@Headers('x-role') role: string | undefined, @Headers('x-user-id') userId: string | undefined, @Param('id') id: string) { return this.cameras.deleteViolation(id, this.context(role, userId)); }
  @Post('violations/:id/attachments') addAttachment(@Headers('x-role') role: string | undefined, @Headers('x-user-id') userId: string | undefined, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.cameras.addAttachment(id, body, this.context(role, userId)); }
  @Delete('violations/:id/attachments/:attachmentId') deleteAttachment(@Headers('x-role') role: string | undefined, @Headers('x-user-id') userId: string | undefined, @Param('id') id: string, @Param('attachmentId') attachmentId: string) { return this.cameras.deleteAttachment(id, attachmentId, this.context(role, userId)); }
  @Get('violations/:id/attachments/:attachmentId/download') async download(@Headers('x-role') role: string | undefined, @Headers('x-user-id') userId: string | undefined, @Param('id') id: string, @Param('attachmentId') attachmentId: string, @Res() response: any) { const file = await this.cameras.readAttachment(id, attachmentId, this.context(role, userId)); response.setHeader('Content-Type', file.attachment.mime_type); response.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.attachment.original_file_name)}"`); response.send(file.data); }

  private context(role?: string, userId?: string): CameraContext { return { role, userId: userId || '00000000-0000-0000-0000-000000000001' }; }
}
