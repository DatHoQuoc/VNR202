import { BadRequestException, Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { RoomCommand } from '../../../src/shared/room-core';
import { cookie, requireJson, setCookie } from '../http-util';
import { RoomsService } from './rooms.service';

/** Player-facing API: no admin powers, identity comes from the player cookie only. */
@Controller('api/rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  private token(req: Request, code: string): string | undefined {
    return cookie(req, `vnr_team_${code.toUpperCase()}`);
  }

  @Get(':code')
  get(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Param('code') code: string) {
    res.set('Cache-Control', 'no-store');
    return this.rooms.playerView(code, this.token(req, code));
  }

  @Post(':code/join')
  join(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Param('code') code: string, @Body() body: { name?: string; slot?: number }) {
    requireJson(req);
    const slot = body?.slot === undefined ? undefined : Number(body.slot);
    const { player, view } = this.rooms.join(code, String(body?.name ?? ''), slot, this.token(req, code));
    setCookie(req, res, `vnr_team_${view.code}`, player.token);
    return view;
  }

  @Post(':code/command')
  command(@Req() req: Request, @Param('code') code: string, @Body() body: { command?: RoomCommand }) {
    requireJson(req);
    if (!body?.command || typeof body.command.type !== 'string') throw new BadRequestException('Thiếu lệnh.');
    return this.rooms.playerCommand(code, body.command, this.token(req, code));
  }
}
