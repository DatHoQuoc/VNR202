import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import type { GameOptions } from '../../../src/game/engine';
import { QUESTION_BANK } from '../../../src/game/questions';
import {
  claimSlot, createRoom, getRoom, playerViewer, projectRoom, runCommand,
  type LobbyPlayer, type RoomCommand, type RoomMap, type RoomRecord, type Viewer
} from '../../../src/shared/room-core';

const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
const HOST: Viewer = { role: 'host' };

/**
 * Owns all live rooms. One Node process is plenty for 20-30 players: every action is a
 * synchronous in-memory step, so commands from different teams can never interleave.
 * To scale past one process, back `rooms` with Redis and keep the same methods.
 */
@Injectable()
export class RoomsService implements OnModuleDestroy {
  private readonly rooms: RoomMap = new Map();
  private readonly sweeper = setInterval(() => this.sweep(), 10 * 60 * 1000);

  constructor() { this.sweeper.unref(); }
  onModuleDestroy(): void { clearInterval(this.sweeper); }

  private sweep(): void {
    const cutoff = Date.now() - ROOM_TTL_MS;
    for (const [code, room] of this.rooms) if (room.createdAt < cutoff) this.rooms.delete(code);
  }

  private guard<T>(fn: () => T): T {
    try { return fn(); } catch (e) { throw new BadRequestException(e instanceof Error ? e.message : 'Yêu cầu không hợp lệ.'); }
  }

  find(code: string): RoomRecord {
    const room = getRoom(this.rooms, code);
    if (!room) throw new NotFoundException('Không tìm thấy phòng. Kiểm tra lại mã phòng.');
    return room;
  }

  /* ---------------------------------------------------------------- admin */
  create(title: string, questionSeconds: number, winHome: number, exitRule?: string): RoomRecord {
    const options: GameOptions = {};
    if (Number.isFinite(questionSeconds) && questionSeconds >= 10 && questionSeconds <= 90) options.questionMs = questionSeconds * 1000;
    if (Number.isInteger(winHome) && winHome >= 1 && winHome <= 6) options.winHome = winHome;
    options.exitRolls = exitRule === 'six' ? [6] : [1, 6];
    return createRoom(this.rooms, title, options);
  }

  list() {
    return [...this.rooms.values()].map((r) => getRoom(this.rooms, r.code)!).sort((a, b) => b.createdAt - a.createdAt).map((r) => ({
      code: r.code, title: r.title, status: r.status, createdAt: r.createdAt,
      players: r.players.length, teams: new Set(r.players.map((p) => p.slot)).size,
      turn: r.game?.turnNumber ?? 0, winHome: r.options.winHome ?? 1
    }));
  }

  remove(code: string): void {
    if (!this.rooms.delete(code.toUpperCase())) throw new NotFoundException('Không tìm thấy phòng.');
  }

  adminView(code: string) { return projectRoom(this.find(code), HOST); }

  adminCommand(code: string, command: RoomCommand) {
    const room = this.find(code);
    this.guard(() => runCommand(room, HOST, command));
    return projectRoom(room, HOST);
  }

  /** Questions with answers: admin only, so players cannot read the answers before the game. */
  bank() { return { questions: QUESTION_BANK }; }

  /* --------------------------------------------------------------- players */
  playerView(code: string, playerToken?: string) {
    const room = this.find(code);
    return projectRoom(room, playerViewer(room, playerToken));
  }

  join(code: string, name: string, slot: number | undefined, playerToken?: string): { player: LobbyPlayer; view: ReturnType<typeof projectRoom> } {
    const room = this.find(code);
    const existing = playerToken ? room.players.find((x) => x.token === playerToken) : undefined;
    const player = this.guard(() => claimSlot(room, name, slot, existing));
    return { player, view: projectRoom(room, playerViewer(room, player.token)) };
  }

  playerCommand(code: string, command: RoomCommand, playerToken?: string) {
    const room = this.find(code);
    const viewer = playerViewer(room, playerToken);
    if (viewer.role === 'host') throw new ForbiddenException('Không có quyền.');
    this.guard(() => runCommand(room, viewer, command));
    return projectRoom(room, viewer);
  }
}
