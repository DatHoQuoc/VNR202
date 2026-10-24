import { Controller, Get } from '@nestjs/common';
import { GameService } from './game.service';

@Controller()
export class PublicController {
  constructor(private readonly game: GameService) {}

  @Get('health') health() {
    return { ok: true };
  }

  /** Current public state (same payload as the websocket `state` event). */
  @Get('state') state() {
    return this.game.publicState();
  }

  /** Approved, anonymous reflections for the /stage wall. */
  @Get('wall') wall() {
    return this.game.wall();
  }
}
