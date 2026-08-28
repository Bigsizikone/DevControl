import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
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

  @Get('development')
  development(@Query('boardId') boardId?: string) { return this.tickets.listDevelopmentDocuments(boardId); }

  @Get()
  list() { return this.tickets.listDocuments(); }

  @Get(':id')
  get(@Param('id') id: string) { return this.tickets.getDocument(id); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { visitRequired?: boolean; visitScheduledAt?: string | null; purchaseRequired?: boolean; erpRequestNumbers?: string[]; repairRequired?: boolean }) { return this.tickets.updateDocument(id, body); }

  @Post(':id/comments')
  comment(@Param('id') id: string, @Body() body: { body?: string; authorId?: string }) { return this.tickets.addComment(id, body); }

  @Post()
  create(@Body() body: { userId?: string; subject?: string; description?: string; ticketTypeId?: string; ticketKindId?: string; equipmentId?: string; developmentRequired?: boolean; developmentBoardId?: string }) { return this.tickets.createDocument(body); }
}
