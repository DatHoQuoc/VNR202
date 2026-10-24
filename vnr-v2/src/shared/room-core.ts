import { randomBytes, randomInt } from 'node:crypto';
import {
  applyAction, createGame, endGame, homeCount, MAX_MEMBERS, pauseGame, resumeGame, tick, type GameOptions
} from '../game/engine.ts';
import { QUESTION_BANK, questionById } from '../game/questions.ts';
import { COLOR_NAMES, TEAM_COLORS, type GameAction, type GameState, type SkillCard, type TeamColor } from '../game/types.ts';

/** A person at a laptop. `slot` 0-5 is their team: fixed seat and colour on the board. */
export interface LobbyPlayer { id: string; name: string; slot: number; token: string; lastSeen: number }

export interface RoomRecord {
  code: string;
  title: string;
  createdAt: number;
  players: LobbyPlayer[];
  status: 'lobby' | 'playing' | 'finished';
  game: GameState | null;
  options: GameOptions;
  revision: number;
}

export type Viewer = { role: 'host' } | { role: 'team'; teamId: string; playerId: string } | { role: 'spectator' };

export type RoomCommand =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'end' }
  | { type: 'rematch' }
  | { type: 'remove-player'; playerId: string }
  | { type: 'leave' }
  | { type: 'game'; action: GameAction };

export type RoomMap = Map<string, RoomRecord>;
const rng = (): number => randomInt(0, 2 ** 32) / 2 ** 32;
const token = (): string => randomBytes(18).toString('base64url');
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const bump = (room: RoomRecord): void => { room.revision += 1; };

export const teamIdOf = (slot: number): string => `t${slot + 1}-${TEAM_COLORS[slot]}`;
export const teamNameOf = (slot: number): string => `Đội ${COLOR_NAMES[TEAM_COLORS[slot]]}`;

export function createRoom(rooms: RoomMap, title: string, options: GameOptions = {}): RoomRecord {
  let code = '';
  do { code = Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join(''); } while (rooms.has(code));
  const room: RoomRecord = {
    code, title: title.trim().slice(0, 60) || 'Cá Ngựa Cách Mạng', createdAt: Date.now(),
    players: [], status: 'lobby', game: null, options, revision: 1
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

/**
 * Joins team `slot` (0-5), or moves to it when the player already holds a seat. Each person gets
 * their own horse; a team holds up to 6 people. Without a slot the emptiest team is chosen.
 */
export function claimSlot(room: RoomRecord, name: string, slot: number | undefined, existing?: LobbyPlayer): LobbyPlayer {
  if (room.status !== 'lobby') throw new Error('Phòng đã bắt đầu, không thể đổi hoặc vào thêm đội.');
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 24);
  if (clean.length < 2) throw new Error('Tên người chơi cần ít nhất 2 ký tự.');
  const size = (i: number) => room.players.filter((p) => p.slot === i && p !== existing).length;
  const pick = slot ?? [0, 1, 2, 3, 4, 5].sort((a, b) => size(a) - size(b))[0];
  if (!Number.isInteger(pick) || pick < 0 || pick >= TEAM_COLORS.length) throw new Error('Đội không hợp lệ.');
  if (size(pick) >= MAX_MEMBERS) throw new Error(`${teamNameOf(pick)} đã đủ ${MAX_MEMBERS} người.`);
  if (room.players.some((p) => p !== existing && p.name.toLocaleLowerCase('vi') === clean.toLocaleLowerCase('vi'))) throw new Error('Tên này đã có người dùng.');
  if (existing) { Object.assign(existing, { name: clean, slot: pick }); bump(room); return existing; }
  const player: LobbyPlayer = { id: `p${randomBytes(4).toString('hex')}`, name: clean, slot: pick, token: token(), lastSeen: Date.now() };
  room.players.push(player);
  bump(room);
  return player;
}

export function leaveSlot(room: RoomRecord, existing: LobbyPlayer): void {
  if (room.status !== 'lobby') throw new Error('Không thể rời đội khi ván đấu đã bắt đầu.');
  room.players = room.players.filter((p) => p !== existing);
  bump(room);
}

/** Player-facing identity from the player cookie; admins get `{ role: 'host' }` from the admin API instead. */
export function playerViewer(room: RoomRecord, playerToken?: string): Viewer {
  const p = playerToken ? room.players.find((x) => x.token === playerToken) : undefined;
  if (p) { p.lastSeen = Date.now(); return { role: 'team', teamId: teamIdOf(p.slot), playerId: p.id }; }
  return { role: 'spectator' };
}

function teamInputs(room: RoomRecord) {
  return TEAM_COLORS.map((_, slot) => ({
    id: teamIdOf(slot), seat: slot,
    members: room.players.filter((p) => p.slot === slot).map((p) => ({ id: p.id, name: p.name }))
  })).filter((t) => t.members.length > 0);
}

export function runCommand(room: RoomRecord, viewer: Viewer, command: RoomCommand): void {
  const now = Date.now();
  if (command.type === 'leave') {
    if (viewer.role !== 'team') throw new Error('Bạn chưa vào đội nào.');
    const me = room.players.find((x) => x.id === viewer.playerId);
    if (me) leaveSlot(room, me);
  } else if (command.type === 'game') {
    if (viewer.role !== 'team') throw new Error('Chỉ người chơi mới thao tác được.');
    if (!room.game) throw new Error('Ván đấu chưa bắt đầu.');
    room.game = applyAction(room.game, viewer.playerId, command.action, now, rng, QUESTION_BANK);
  } else {
    if (viewer.role !== 'host') throw new Error('Chỉ người điều khiển phòng mới dùng được lệnh này.');
    switch (command.type) {
      case 'start':
        if (room.status !== 'lobby') throw new Error('Ván đấu đã bắt đầu.');
        room.game = createGame(teamInputs(room), QUESTION_BANK, now, rng, room.options);
        room.status = 'playing';
        break;
      case 'pause': if (room.game) room.game = pauseGame(room.game, now); break;
      case 'resume': if (room.game) room.game = resumeGame(room.game, now); break;
      case 'end': if (room.game) room.game = endGame(room.game, now); break;
      case 'rematch':
        if (room.status !== 'finished') throw new Error('Chỉ chơi lại được khi ván đã kết thúc.');
        room.game = createGame(teamInputs(room), QUESTION_BANK, now, rng, room.options);
        room.status = 'playing';
        break;
      case 'remove-player':
        if (room.status !== 'lobby') throw new Error('Chỉ xóa người chơi được khi chưa bắt đầu.');
        room.players = room.players.filter((p) => p.id !== command.playerId);
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
  const myTeam = viewer.role === 'team' ? viewer.teamId : null;
  const now = Date.now();
  return {
    code: room.code, title: room.title, status: room.status, revision: room.revision, serverNow: now,
    settings: { winHome: room.options.winHome ?? 1, exitRolls: room.options.exitRolls ?? [1, 6] },
    viewer: viewer.role === 'team' ? { role: 'team' as const, teamId: viewer.teamId, playerId: viewer.playerId } : { role: viewer.role },
    teams: TEAM_COLORS.map((color: TeamColor, slot) => ({
      id: teamIdOf(slot), slot, color, name: teamNameOf(slot),
      members: room.players.filter((p) => p.slot === slot).map((p) => ({ id: p.id, name: p.name, online: now - p.lastSeen < 15_000 }))
    })),
    game: g && {
      phase: g.phase, deadline: g.deadline, paused: g.paused, pausedRemaining: g.pausedRemaining, finish: g.finish,
      order: g.order, turnTeamId: g.turnTeamId, actingMemberId: g.actingMemberId, turnNumber: g.turnNumber, dice: g.dice,
      skillUsed: g.skillUsed, winHome: g.winHome, exitRolls: g.exitRolls, streak: g.streak,
      deckCount: g.skillDeck.length, skillLog: g.skillLog.slice(-12),
      question: g.question && {
        id: g.question.id, text: g.question.text, options: g.question.options, removed: g.question.removed,
        hint: g.question.hintShown ? hintFor(g.question.id) : null
      },
      resolution: g.resolution, events: g.events.slice(-30), winnerId: g.winnerId, ranking: g.ranking, endedBy: g.endedBy,
      players: Object.fromEntries(Object.values(g.players).map((p) => [p.teamId, {
        seat: p.seat, members: p.members, horses: p.horses, handCount: p.hand.length, boost: p.boost,
        doubleDice: p.doubleDice, shield: p.shield, correct: p.correct, answered: p.answered,
        home: homeCount(p, g.finish), lead: Math.max(0, ...p.horses.map((h) => h.progress))
      }]))
    },
    hand: (myTeam && g?.players[myTeam]?.hand ? g.players[myTeam].hand : []) as SkillCard[]
  };
}

function hintFor(id: string): string { return questionById.get(id)?.hint ?? ''; }
