import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
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

  /** Projector: class-wide result of one revealed round (409 before reveal, 404 for an unknown round). */
  @Get('stage/rounds/:n') stageRound(@Param('n', ParseIntPipe) n: number) {
    return this.game.stageRound(n);
  }

  /** Projector: finale ranking view, same as `state.finale` (409 before the announcement). */
  @Get('stage/finale') stageFinale() {
    return this.game.stageFinale();
  }

  /** Approved, anonymous reflections for the /stage wall. */
  @Get('wall') wall() {
    return this.game.wall();
  }
}
