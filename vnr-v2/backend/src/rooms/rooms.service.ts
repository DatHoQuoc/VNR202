import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import {
  createRoom, getRoom, joinRoom, projectRoom, runCommand, viewerFor,
  type LobbyTeam, type RoomCommand, type RoomMap, type RoomRecord, type Viewer
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

  create(title: string, questionSeconds: number): RoomRecord {
    const ok = Number.isFinite(questionSeconds) && questionSeconds >= 10 && questionSeconds <= 90;
    return createRoom(this.rooms, title, ok ? { questionMs: questionSeconds * 1000 } : {});
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

  join(code: string, name: string, color?: string): { team: LobbyTeam; view: ReturnType<typeof projectRoom> } {
    const room = this.find(code);
    const team = this.guard(() => joinRoom(room, name, color));
    return { team, view: projectRoom(room, viewerFor(room, undefined, team.token)) };
  }

  command(code: string, command: RoomCommand, hostToken?: string, teamToken?: string) {
    const room = this.find(code);
    const viewer: Viewer = viewerFor(room, hostToken, teamToken);
    this.guard(() => runCommand(room, viewer, command));
    return projectRoom(room, viewer);
  }
}
