import { Body, Controller, Post } from '@nestjs/common';
import { AccessService } from '../domain/access.service';
import { Permission, Ticket, User } from '../domain/models';

@Controller('access')
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Post('check')
  check(@Body() body: { user: User; permission: Permission; ticket: Ticket }) {
    return this.access.check(body.user, body.permission, body.ticket);
  }
}
