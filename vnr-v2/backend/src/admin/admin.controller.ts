import { Body, Controller, Delete, Get, Param, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { RoomCommand } from '../../../src/shared/room-core';
import { clientId, cookie, requireJson, setCookie } from '../http-util';
import { RoomsService } from '../rooms/rooms.service';
import { AdminService } from './admin.service';

@Controller('api/admin')
export class AdminController {
  constructor(private readonly admin: AdminService, private readonly rooms: RoomsService) {}

  private auth(req: Request, res?: Response): void {
    res?.set('Cache-Control', 'no-store');
    if (!this.admin.isValid(cookie(req, AdminService.cookieName))) throw new UnauthorizedException('Cần đăng nhập quản trị.');
  }

  @Get('session')
  session(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.set('Cache-Control', 'no-store');
    return { authenticated: this.admin.isValid(cookie(req, AdminService.cookieName)) };
  }

  @Post('session')
  login(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: { password?: string }) {
    requireJson(req);
    const token = this.admin.login(String(body?.password ?? ''), clientId(req));
    setCookie(req, res, AdminService.cookieName, token, AdminService.maxAgeMs);
    return { authenticated: true };
  }

  @Delete('session')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(AdminService.cookieName, { path: '/' });
    return { authenticated: false };
  }

  @Get('rooms')
  list(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.auth(req, res);
    return { rooms: this.rooms.list() };
  }

  @Post('rooms')
  create(@Req() req: Request, @Body() body: { title?: string; questionSeconds?: number; winHome?: number; exitRule?: string; horses?: number; timeLimitMin?: number }) {
    requireJson(req); this.auth(req);
    const room = this.rooms.create(String(body?.title ?? ''), Number(body?.questionSeconds), Number(body?.winHome), body?.exitRule, Number(body?.horses), Number(body?.timeLimitMin));
    return { code: room.code };
  }

  @Delete('rooms/:code')
  remove(@Req() req: Request, @Param('code') code: string) {
    this.auth(req); this.rooms.remove(code);
    return { ok: true };
  }

  @Get('rooms/:code')
  view(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Param('code') code: string) {
    this.auth(req, res);
    return this.rooms.adminView(code);
  }

  @Post('rooms/:code/command')
  command(@Req() req: Request, @Param('code') code: string, @Body() body: { command?: RoomCommand }) {
    requireJson(req); this.auth(req);
    if (!body?.command || typeof body.command.type !== 'string') throw new UnauthorizedException('Thiếu lệnh.');
    return this.rooms.adminCommand(code, body.command);
  }

  @Get('rooms/:code/bank')
  bank(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Param('code') code: string) {
    this.auth(req, res);
    this.rooms.find(code);
    return this.rooms.bank();
  }
}
