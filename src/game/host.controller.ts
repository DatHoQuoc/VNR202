import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { GameService } from './game.service';
import { HostGuard } from './host.guard';

/** MC / controller API. Every route needs the `x-host-key` header. */
@Controller('host')
@UseGuards(HostGuard)
export class HostController {
  constructor(private readonly game: GameService) {}

  @Get('state') state() {
    return this.game.hostStats();
  }
  @Get('players') players() {
    return this.game.hostPlayers();
  }
  @Get('rounds/:n') round(@Param('n', ParseIntPipe) n: number) {
    return this.game.hostRound(n);
  }
  @Get('ranking') ranking() {
    return this.game.ranking();
  }
  @Get('results') results() {
    return this.game.exportResults();
  }

  @Post('joining/open') @HttpCode(200) openJoining() {
    this.game.openJoining();
    return this.game.hostStats();
  }

  /** Station 0 show-of-hands result, e.g. 12 of 30 chose D => { "percent": 40 } */
  @Post('opening') @HttpCode(200) opening(@Body() b: { percent: number }) {
    this.game.setOpeningPercent(b?.percent);
    return this.game.hostStats();
  }

  @Post('rounds/:n/open-pick') @HttpCode(200) openPick(@Param('n', ParseIntPipe) n: number) {
    this.game.openPick(n);
    return this.game.hostStats();
  }
  @Post('rounds/:n/open-guess') @HttpCode(200) openGuess(@Param('n', ParseIntPipe) n: number) {
    this.game.openGuess(n);
    return this.game.hostStats();
  }
  @Post('rounds/:n/reveal') @HttpCode(200) reveal(@Param('n', ParseIntPipe) n: number) {
    this.game.reveal(n);
    return this.game.hostRound(n);
  }
  @Post('rounds/:n/void') @HttpCode(200) voidRound(@Param('n', ParseIntPipe) n: number, @Body() b: { voided?: boolean }) {
    this.game.voidRound(n, b?.voided ?? true);
    return this.game.hostStats();
  }
  @Post('rounds/:n/excuse') @HttpCode(200) excuse(@Param('n', ParseIntPipe) n: number, @Body() b: { playerId: string; excused?: boolean }) {
    this.game.excuse(b?.playerId, n, b?.excused ?? true);
    return this.game.hostRound(n);
  }

  @Post('announce/start') @HttpCode(200) startAnnounce() {
    this.game.startAnnounce();
    return this.game.hostStats();
  }
  @Post('announce/next') @HttpCode(200) nextFinale() {
    this.game.nextFinale();
    return this.game.hostStats();
  }

  @Post('reflection/open') @HttpCode(200) openReflection() {
    this.game.setReflectionOpen(true);
    return this.game.hostStats();
  }
  @Post('reflection/close') @HttpCode(200) closeReflection() {
    this.game.setReflectionOpen(false);
    return this.game.hostStats();
  }
  @Get('reflections') reflections() {
    return this.game.hostReflections();
  }
  @Post('reflections/:id/approve') @HttpCode(200) approve(@Param('id') id: string, @Body() b: { approved?: boolean }) {
    this.game.approveReflection(id, b?.approved ?? true);
    return this.game.hostReflections();
  }

  @Post('end') @HttpCode(200) end() {
    this.game.end();
    return this.game.hostStats();
  }
}
