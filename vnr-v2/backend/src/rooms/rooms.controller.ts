import { BadRequestException, Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { RoomCommand } from '../../../src/shared/room-core';
import { RoomsService } from './rooms.service';

const MAX_AGE_MS = 12 * 60 * 60 * 1000;

function cookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

@Controller('api/rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  private tokens(req: Request, code: string) {
    const c = code.toUpperCase();
    return { host: cookie(req, `vnr_host_${c}`), team: cookie(req, `vnr_team_${c}`) };
  }

  private setCookie(req: Request, res: Response, name: string, value: string): void {
    // Forwarded by the Next proxy, so trust x-forwarded-proto to decide on Secure.
    const secure = (req.headers['x-forwarded-proto'] ?? req.protocol) === 'https';
    res.cookie(name, value, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: MAX_AGE_MS, secure });
  }

  /** Writes need a JSON body; browsers cannot send that cross-site without a CORS preflight. */
  private requireJson(req: Request): void {
    if (!req.is('application/json')) throw new BadRequestException('Yêu cầu phải ở dạng JSON.');
  }

  @Post()
  create(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: { title?: string; questionSeconds?: number }) {
    this.requireJson(req);
    const room = this.rooms.create(String(body?.title ?? ''), Number(body?.questionSeconds));
    this.setCookie(req, res, `vnr_host_${room.code}`, room.hostToken);
    return { code: room.code };
  }

  @Get(':code')
  get(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Param('code') code: string) {
    res.set('Cache-Control', 'no-store');
    const t = this.tokens(req, code);
    return this.rooms.view(code, t.host, t.team);
  }

  @Get(':code/bank')
  bank(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Param('code') code: string) {
    res.set('Cache-Control', 'no-store');
    return this.rooms.bank(code, this.tokens(req, code).host);
  }

  @Post(':code/join')
  join(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Param('code') code: string, @Body() body: { name?: string; color?: string }) {
    this.requireJson(req);
    const { team, view } = this.rooms.join(code, String(body?.name ?? ''), body?.color);
    this.setCookie(req, res, `vnr_team_${view.code}`, team.token);
    return view;
  }

  @Post(':code/command')
  command(@Req() req: Request, @Param('code') code: string, @Body() body: { command?: RoomCommand }) {
    this.requireJson(req);
    if (!body?.command || typeof body.command.type !== 'string') throw new BadRequestException('Thiếu lệnh.');
    const t = this.tokens(req, code);
    return this.rooms.command(code, body.command, t.host, t.team);
  }
}
