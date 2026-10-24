import { randomBytes, randomInt } from 'node:crypto';
import {
  applyAction, createGame, endGame, pauseGame, resumeGame, tick, type GameOptions
} from '../game/engine.ts';
import { QUESTION_BANK, questionById } from '../game/questions.ts';
import { TEAM_COLORS, type GameAction, type GameState, type SkillCard, type TeamColor } from '../game/types.ts';

/** One player (device) per horse. `slot` 0-5 is the fixed seat and colour on the board. */
export interface LobbyTeam { id: string; name: string; slot: number; color: TeamColor; token: string; lastSeen: number }

export interface RoomRecord {
  code: string;
  title: string;
  createdAt: number;
  hostToken: string;
  teams: LobbyTeam[];
  status: 'lobby' | 'playing' | 'finished';
  game: GameState | null;
  options: GameOptions;
  revision: number;
}

export type Viewer = { role: 'host' } | { role: 'team'; teamId: string } | { role: 'spectator' };

export type RoomCommand =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'end' }
  | { type: 'rematch' }
  | { type: 'remove-team'; teamId: string }
  | { type: 'leave' }
  | { type: 'game'; action: GameAction };

export type RoomMap = Map<string, RoomRecord>;
const rng = (): number => randomInt(0, 2 ** 32) / 2 ** 32;
const token = (): string => randomBytes(18).toString('base64url');
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function createRoom(rooms: RoomMap, title: string, options: GameOptions = {}): RoomRecord {
  let code = '';
  do { code = Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join(''); } while (rooms.has(code));
  const room: RoomRecord = {
    code, title: title.trim().slice(0, 60) || 'Cá Ngựa Cách Mạng', createdAt: Date.now(), hostToken: token(),
    teams: [], status: 'lobby', game: null, options, revision: 1
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(rooms: RoomMap, code: string): RoomRecord | null {
  const room = rooms.get(code.toUpperCase());
  if (!room) return null;
  if (room.game) {
    const next = tick(room.game, Date.now(), rng, QUESTION_BANK);
    if (next !== room.game) { room.game = next; bump(room); }
    if (room.game.phase === 'finished') room.status = 'finished';
  }
  return room;
}

const bump = (room: RoomRecord): void => { room.revision += 1; };

/**
 * Claims a horse slot (0-5). A player who already holds a slot moves to the new one,
 * so people can change their mind until the host starts the game.
 */
export function claimSlot(room: RoomRecord, name: string, slot: number | undefined, existing?: LobbyTeam): LobbyTeam {
  if (room.status !== 'lobby') throw new Error('Phòng đã bắt đầu, không thể đổi hoặc chọn thêm ngựa.');
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 24);
  if (clean.length < 2) throw new Error('Tên người chơi cần ít nhất 2 ký tự.');
  const free = (i: number) => !room.teams.some((t) => t.slot === i && t !== existing);
  const wanted = slot === undefined ? [0, 1, 2, 3, 4, 5].find(free) : slot;
  if (wanted === undefined || !Number.isInteger(wanted) || wanted < 0 || wanted >= TEAM_COLORS.length) throw new Error('Phòng đã đủ 6 người chơi.');
  if (!free(wanted)) throw new Error(`Ngựa số ${wanted + 1} đã có người chọn.`);
  if (room.teams.some((t) => t !== existing && t.name.toLocaleLowerCase('vi') === clean.toLocaleLowerCase('vi'))) throw new Error('Tên này đã có người dùng.');
  const color = TEAM_COLORS[wanted];
  if (existing) { Object.assign(existing, { name: clean, slot: wanted, color, id: `t${wanted + 1}-${color}` }); bump(room); return existing; }
  const team: LobbyTeam = { id: `t${wanted + 1}-${color}`, name: clean, slot: wanted, color, token: token(), lastSeen: Date.now() };
  room.teams.push(team);
  room.teams.sort((x, y) => x.slot - y.slot);
  bump(room);
  return team;
}

export function leaveSlot(room: RoomRecord, existing: LobbyTeam): void {
  if (room.status !== 'lobby') throw new Error('Không thể rời phòng khi ván đấu đã bắt đầu.');
  room.teams = room.teams.filter((t) => t !== existing);
  bump(room);
}

export function viewerFor(room: RoomRecord, hostToken?: string, teamToken?: string): Viewer {
  if (hostToken && hostToken === room.hostToken) return { role: 'host' };
  const team = teamToken ? room.teams.find((t) => t.token === teamToken) : undefined;
  if (team) { team.lastSeen = Date.now(); return { role: 'team', teamId: team.id }; }
  return { role: 'spectator' };
}

export function runCommand(room: RoomRecord, viewer: Viewer, command: RoomCommand): void {
  const now = Date.now();
  if (command.type === 'leave') {
    if (viewer.role !== 'team') throw new Error('Bạn chưa chọn ngựa.');
    const me = room.teams.find((x) => x.id === viewer.teamId);
    if (me) leaveSlot(room, me);
  } else if (command.type === 'game') {
    if (viewer.role !== 'team') throw new Error('Chỉ đội chơi mới thao tác được.');
    if (!room.game) throw new Error('Ván đấu chưa bắt đầu.');
    room.game = applyAction(room.game, viewer.teamId, command.action, now, rng, QUESTION_BANK);
  } else {
    if (viewer.role !== 'host') throw new Error('Chỉ người điều khiển phòng mới dùng được lệnh này.');
    switch (command.type) {
      case 'start':
        if (room.status !== 'lobby') throw new Error('Ván đấu đã bắt đầu.');
        room.game = createGame(room.teams.map((x) => ({ id: x.id, seat: x.slot })), QUESTION_BANK, now, rng, room.options);
        room.status = 'playing';
        break;
      case 'pause': if (room.game) room.game = pauseGame(room.game, now); break;
      case 'resume': if (room.game) room.game = resumeGame(room.game, now); break;
      case 'end': if (room.game) room.game = endGame(room.game, now); break;
      case 'rematch':
        if (room.status !== 'finished') throw new Error('Chỉ chơi lại được khi ván đã kết thúc.');
        room.game = createGame(room.teams.map((x) => ({ id: x.id, seat: x.slot })), QUESTION_BANK, now, rng, room.options);
        room.status = 'playing';
        break;
      case 'remove-team':
        if (room.status !== 'lobby') throw new Error('Chỉ xóa đội được khi chưa bắt đầu.');
        room.teams = room.teams.filter((t) => t.id !== command.teamId);
        break;
      default: throw new Error('Lệnh không hợp lệ.');
    }
  }
  if (room.game?.phase === 'finished') room.status = 'finished';
  bump(room);
}

/** What a client may see. Never includes the correct answer or other teams' hands. */
export function projectRoom(room: RoomRecord, viewer: Viewer) {
  const g = room.game;
  const mySeat = viewer.role === 'team' ? viewer.teamId : null;
  return {
    code: room.code, title: room.title, status: room.status, revision: room.revision, serverNow: Date.now(),
    viewer: viewer.role === 'team' ? { role: 'team' as const, teamId: viewer.teamId } : { role: viewer.role },
    teams: room.teams.map((t) => ({ id: t.id, name: t.name, slot: t.slot, color: t.color, online: Date.now() - t.lastSeen < 15_000 })),
    game: g && {
      phase: g.phase, deadline: g.deadline, paused: g.paused, pausedRemaining: g.pausedRemaining, finish: g.finish,
      order: g.order, turnTeamId: g.turnTeamId, turnNumber: g.turnNumber, dice: g.dice, skillUsed: g.skillUsed,
      question: g.question && {
        id: g.question.id, text: g.question.text, options: g.question.options, removed: g.question.removed,
        hint: g.question.hintShown ? hintFor(g.question.id) : null
      },
      resolution: g.resolution, events: g.events.slice(-30), winnerId: g.winnerId, ranking: g.ranking, endedBy: g.endedBy,
      players: Object.fromEntries(Object.values(g.players).map((p) => [p.teamId, {
        seat: p.seat, progress: p.progress, handCount: p.hand.length, stunned: p.stunned, cap: p.cap, boost: p.boost,
        doubleDice: p.doubleDice, shield: p.shield, correct: p.correct, answered: p.answered
      }]))
    },
    hand: (mySeat && g?.players[mySeat]?.hand ? g.players[mySeat].hand : []) as SkillCard[]
  };
}

function hintFor(id: string): string { return questionById.get(id)?.hint ?? ''; }
