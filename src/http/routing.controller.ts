import { Body, Controller, Post } from '@nestjs/common';
import { RoutingInput, RoutingService } from '../domain/routing.service';

@Controller('routing')
export class RoutingController {
  constructor(private readonly routing: RoutingService) {}

  @Post('simulate')
  simulate(@Body() body: RoutingInput) {
    return this.routing.simulate(body);
  }
}
