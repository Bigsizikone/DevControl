import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { TicketsService } from '../infrastructure/tickets.service';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get('users')
  users() { return this.tickets.listUsers(); }

  @Get('catalog')
  catalog() { return this.tickets.listCatalog(); }

  @Get('development-boards')
  developmentBoards() { return this.tickets.listDevelopmentBoards(); }

  @Get('development-statuses')
  developmentStatuses() { return this.tickets.listDevelopmentStatuses(); }

  @Get('development-users')
  developmentUsers(@Query('role') role: string, @Query('q') search?: string) { return this.tickets.listDevelopmentUsers(role, search); }

  @Get('development')
  development(@Query() query: { boardId?: string; analystId?: string; developerId?: string; watcherId?: string; status?: string; startDate?: string; releaseDate?: string; rootTicketId?: string; hasSubtasks?: string; mine?: string; q?: string }, @Headers('x-user-id') actorId?: string) { return this.tickets.listDevelopmentDocuments(query.boardId, query, actorId); }

  @Get('development/tasks/:id')
  developmentTask(@Param('id') id: string, @Headers('x-user-id') actorId?: string, @Headers('x-role') role?: string) { return this.tickets.getDevelopmentTask(id, actorId, role); }

  @Post('development/tasks')
  createDevelopmentTask(@Body() body: { ticketId?: string; boardId?: string; systemId?: string; title?: string; description?: string }, @Headers('x-user-id') actorId?: string, @Headers('x-role') role?: string) { return this.tickets.createDevelopmentTask({ ...body, actorId, role }); }

  @Put('development/tasks/:id')
  updateDevelopmentTask(@Param('id') id: string, @Body() body: Record<string, unknown>, @Headers('x-user-id') actorId?: string, @Headers('x-role') role?: string) { return this.tickets.updateDevelopmentTask(id, body, actorId, role); }

  @Patch('development/tasks/:id/status')
  updateDevelopmentStatus(@Param('id') id: string, @Body() body: { statusId?: string; status?: string }, @Headers('x-user-id') actorId?: string, @Headers('x-role') role?: string) { return this.tickets.updateDevelopmentStatus(id, String(body.statusId ?? body.status ?? ''), actorId, role); }

  @Post('development/tasks/:id/subtasks')
  createSubtask(@Param('id') id: string, @Body() body: { title?: string; description?: string }, @Headers('x-user-id') actorId?: string, @Headers('x-role') role?: string) { return this.tickets.createSubtask(id, { ...body, actorId, role }); }

  @Get('development/tasks/:id/subtasks')
  subtasks(@Param('id') id: string, @Headers('x-user-id') actorId?: string, @Headers('x-role') role?: string) { return this.tickets.getDevelopmentTask(id, actorId, role).then((result) => ({ subtasks: result.task.subtasks })); }

  @Post('development/tasks/:id/comments')
  developmentComment(@Param('id') id: string, @Body() body: { comment?: string; body?: string }, @Headers('x-user-id') actorId?: string, @Headers('x-role') role?: string) { return this.tickets.addDevelopmentComment(id, body.comment ?? body.body ?? '', actorId, role); }

  @Put('development/tasks/:id/comments/:commentId')
  updateDevelopmentComment(@Param('id') id: string, @Param('commentId') commentId: string, @Body() body: { comment?: string; body?: string }, @Headers('x-user-id') actorId?: string, @Headers('x-role') role?: string) { return this.tickets.updateDevelopmentComment(id, commentId, body.comment ?? body.body ?? '', actorId, role); }

  @Delete('development/tasks/:id/comments/:commentId')
  deleteDevelopmentComment(@Param('id') id: string, @Param('commentId') commentId: string, @Headers('x-user-id') actorId?: string, @Headers('x-role') role?: string) { return this.tickets.deleteDevelopmentComment(id, commentId, actorId, role); }

  @Get('development/tasks/:id/watchers')
  watchers(@Param('id') id: string, @Headers('x-user-id') actorId?: string, @Headers('x-role') role?: string) { return this.tickets.getDevelopmentTask(id, actorId, role).then((result) => ({ watchers: result.task.watchers })); }

  @Post('development/tasks/:id/watchers')
  addWatcher(@Param('id') id: string, @Body() body: { userId?: string }, @Headers('x-user-id') actorId?: string, @Headers('x-role') role?: string) { return this.tickets.addWatcher(id, body.userId ?? '', actorId, role); }

  @Delete('development/tasks/:id/watchers/:userId')
  removeWatcher(@Param('id') id: string, @Param('userId') userId: string, @Headers('x-user-id') actorId?: string, @Headers('x-role') role?: string) { return this.tickets.removeWatcher(id, userId, actorId, role); }

  @Get()
  list() { return this.tickets.listDocuments(); }

  @Get(':id')
  get(@Param('id') id: string) { return this.tickets.getDocument(id); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { visitRequired?: boolean; visitScheduledAt?: string | null; purchaseRequired?: boolean; erpRequestNumbers?: string[]; repairRequired?: boolean }) { return this.tickets.updateDocument(id, body); }

  @Post(':id/comments')
  comment(@Param('id') id: string, @Body() body: { body?: string }, @Headers('x-user-id') authorId: string) { return this.tickets.addComment(id, { body: body.body, authorId }); }

  @Post()
  create(@Body() body: { userId?: string; subject?: string; description?: string; ticketTypeId?: string; ticketKindId?: string; equipmentId?: string; developmentRequired?: boolean; developmentBoardId?: string }) { return this.tickets.createDocument(body); }
}
