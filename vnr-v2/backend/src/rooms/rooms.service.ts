import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import type { GameOptions } from '../../../src/game/engine';
import { QUESTION_BANK } from '../../../src/game/questions';
import {
  claimSlot, createRoom, getRoom, projectRoom, runCommand, viewerFor,
  type LobbyPlayer, type RoomCommand, type RoomMap, type RoomRecord, type Viewer
} from '../../../src/shared/room-core';

const ROOM_TTL_MS = 12 * 60 * 60 * 1000;

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

  create(title: string, questionSeconds: number, winHome: number, exitRule?: string): RoomRecord {
    const options: GameOptions = {};
    if (Number.isFinite(questionSeconds) && questionSeconds >= 10 && questionSeconds <= 90) options.questionMs = questionSeconds * 1000;
    if (Number.isInteger(winHome) && winHome >= 1 && winHome <= 6) options.winHome = winHome;
    options.exitRolls = exitRule === 'six' ? [6] : [1, 6];
    return createRoom(this.rooms, title, options);
  }

  find(code: string): RoomRecord {
    const room = getRoom(this.rooms, code);
    if (!room) throw new NotFoundException('Không tìm thấy phòng. Kiểm tra lại mã phòng.');
    return room;
  }

  view(code: string, hostToken?: string, teamToken?: string) {
    const room = this.find(code);
    return projectRoom(room, viewerFor(room, hostToken, teamToken));
  }

  join(code: string, name: string, slot: number | undefined, teamToken?: string): { player: LobbyPlayer; view: ReturnType<typeof projectRoom> } {
    const room = this.find(code);
    const existing = teamToken ? room.players.find((x) => x.token === teamToken) : undefined;
    const player = this.guard(() => claimSlot(room, name, slot, existing));
    return { player, view: projectRoom(room, viewerFor(room, undefined, player.token)) };
  }

  /** Questions with answers: host only, so players cannot read the answers before the game. */
  bank(code: string, hostToken?: string) {
    const room = this.find(code);
    if (viewerFor(room, hostToken).role !== 'host') throw new ForbiddenException('Chỉ người điều khiển phòng mới xem được đáp án.');
    return { questions: QUESTION_BANK };
  }

  command(code: string, command: RoomCommand, hostToken?: string, teamToken?: string) {
    const room = this.find(code);
    const viewer: Viewer = viewerFor(room, hostToken, teamToken);
    this.guard(() => runCommand(room, viewer, command));
    return projectRoom(room, viewer);
  }
}
