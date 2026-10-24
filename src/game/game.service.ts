import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { AppConfig, loadConfig } from '../config/config';
import content from '../content/content.json';
import { Pick, RoundScore, scoreRound, standings, TeamStanding } from '../scoring/scoring';
import { Game, Player, Reflection, RoundContent, RoundResult, RoundState } from './types';

const ROUNDS = content.rounds as RoundContent[];

/**
 * Whole game state lives in memory (one class, one room) and is snapshotted to a JSON file
 * after every mutation so a crash/restart does not lose the session.
 * Emits: 'state' after any change, 'reveal' (round number) when a round is revealed.
 */
@Injectable()
export class GameService extends EventEmitter {
  private readonly log = new Logger(GameService.name);
  readonly config: AppConfig;
  private game: Game;
  /** transient: playerId -> socket ids */
  private readonly sockets = new Map<string, Set<string>>();
  private readonly socketToPlayer = new Map<string, string>();
  /** transient and NOT persisted, so reflections stay unlinked from players */
  private readonly reflected = new Set<string>();

  constructor() {
    super();
    this.config = loadConfig();
    this.game = this.load() ?? this.fresh();
    this.log.log(`Room code: ${this.game.code}`);
  }

  // ---------- persistence ----------
  private fresh(): Game {
    return {
      code: this.config.roomCode,
      phase: 'lobby',
      currentRound: 0,
      openingPercent: null,
      rounds: ROUNDS.map((r) => ({ n: r.n, phase: 'idle', voided: false, picks: {}, guesses: {}, excused: [], closedConnected: {} })),
      players: {},
      reflections: [],
      reflectionOpen: false,
      finaleRevealed: 0,
      createdAt: new Date().toISOString(),
    };
  }

  private load(): Game | null {
    const f = this.config.dataFile;
    if (!f || !existsSync(f)) return null;
    try {
      const g = JSON.parse(readFileSync(f, 'utf8')) as Game;
      if (g.rounds?.length !== ROUNDS.length) throw new Error('snapshot does not match content.json rounds');
      this.log.warn(`Restored game from ${f} (phase=${g.phase}, players=${Object.keys(g.players).length})`);
      return g;
    } catch (e) {
      // fail loud rather than silently starting an empty game over a real session
      throw new Error(`Cannot restore ${f}: ${(e as Error).message}. Fix or delete the file.`);
    }
  }

  private save(): void {
    const f = this.config.dataFile;
    if (!f) return;
    mkdirSync(dirname(f), { recursive: true });
    const tmp = `${f}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.game));
    renameSync(tmp, f);
  }

  private commit(): void {
    this.save();
    this.emit('state');
  }

  // ---------- helpers ----------
  private roundOf(n: number): { r: RoundState; c: RoundContent } {
    const r = this.game.rounds.find((x) => x.n === n);
    const c = ROUNDS.find((x) => x.n === n);
    if (!r || !c) throw new NotFoundException(`Round ${n} does not exist`);
    return { r, c };
  }

  private current(): { r: RoundState; c: RoundContent } | null {
    return this.game.currentRound ? this.roundOf(this.game.currentRound) : null;
  }

  private isScored(r: RoundState): boolean {
    return r.phase === 'revealed' && !r.voided && !!r.result;
  }

  /** first round that counts for someone who joins right now */
  private nextJoinRound(): number {
    const g = this.game;
    if (g.phase === 'lobby' || g.phase === 'joining') return 1;
    if (g.phase === 'announce' || g.phase === 'ended') return ROUNDS.length + 1;
    const cur = this.current()!;
    return cur.r.phase === 'pick' ? cur.r.n : cur.r.n + 1;
  }

  // ---------- connection tracking ----------
  attach(playerId: string, socketId: string): void {
    const set = this.sockets.get(playerId) ?? new Set<string>();
    set.add(socketId);
    this.sockets.set(playerId, set);
    this.socketToPlayer.set(socketId, playerId);
  }

  detach(socketId: string): void {
    const pid = this.socketToPlayer.get(socketId);
    if (!pid) return;
    this.socketToPlayer.delete(socketId);
    const set = this.sockets.get(pid);
    set?.delete(socketId);
    if (set && set.size === 0) this.sockets.delete(pid);
    this.emit('stats');
  }

  isConnected(playerId: string): boolean {
    return (this.sockets.get(playerId)?.size ?? 0) > 0;
  }

  playerIds(): string[] {
    return Object.keys(this.game.players);
  }

  // ---------- player actions ----------
  join(input: { code?: string; name?: string; team?: number; playerId?: string }): Player {
    const g = this.game;
    if ((input.code ?? '').toUpperCase() !== g.code) throw new ForbiddenException('Wrong room code');
    if (g.phase === 'lobby') throw new ConflictException('Room is not open yet');

    const existing = input.playerId ? g.players[input.playerId] : undefined;
    if (existing) return existing; // auto-rejoin after a dropped connection

    if (g.phase === 'ended') throw new ConflictException('Session has ended');
    const name = (input.name ?? '').trim();
    if (name.length < 1 || name.length > 30) throw new BadRequestException('name must be 1..30 characters');
    const team = Number(input.team);
    if (!Number.isInteger(team) || team < 1 || team > this.config.teams) throw new BadRequestException(`team must be 1..${this.config.teams}`);

    const p: Player = { id: randomUUID(), name, team, joinedRound: this.nextJoinRound(), createdAt: new Date().toISOString() };
    g.players[p.id] = p;
    this.commit();
    return p;
  }

  private requirePlayer(playerId: string | undefined): Player {
    const p = playerId ? this.game.players[playerId] : undefined;
    if (!p) throw new ForbiddenException('Join the room first');
    return p;
  }

  private requireOpenRound(n: number, phase: 'pick' | 'guess'): { r: RoundState; c: RoundContent } {
    const x = this.roundOf(n);
    if (x.r.n !== this.game.currentRound || x.r.phase !== phase) throw new ConflictException(`Round ${n} is not accepting ${phase === 'pick' ? 'picks' : 'guesses'}`);
    return x;
  }

  pick(playerId: string | undefined, n: number, option: string): void {
    const p = this.requirePlayer(playerId);
    const { r, c } = this.requireOpenRound(n, 'pick');
    if (!(option in c.step1.options)) throw new BadRequestException(`option must be one of ${Object.keys(c.step1.options).join(', ')}`);
    r.picks[p.id] = option;
    this.save();
    this.emit('stats');
  }

  guess(playerId: string | undefined, n: number, value: number): void {
    const p = this.requirePlayer(playerId);
    const { r } = this.requireOpenRound(n, 'guess');
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) throw new BadRequestException('value must be a number in 0..100');
    if (p.joinedRound > n) throw new ConflictException(`You joined after round ${n}; you are scored from round ${p.joinedRound}`);
    r.guesses[p.id] = value;
    this.save();
    this.emit('stats');
  }

  submitReflection(playerId: string | undefined, text: string): void {
    const p = this.requirePlayer(playerId);
    if (!this.game.reflectionOpen) throw new ConflictException('Reflection wall is not open');
    const t = (text ?? '').trim();
    if (t.length < 1 || t.length > this.config.reflectionMax) throw new BadRequestException(`text must be 1..${this.config.reflectionMax} characters`);
    if (this.reflected.has(p.id)) throw new ConflictException('You already wrote a reflection');
    this.reflected.add(p.id);
    // anonymous: no player id stored on the reflection
    this.game.reflections.push({ id: randomUUID(), text: t, approved: false, createdAt: new Date().toISOString() });
    this.save();
    this.emit('stats');
  }

  // ---------- host actions ----------
  openJoining(): void {
    if (this.game.phase !== 'lobby') throw new ConflictException(`Cannot open joining from phase ${this.game.phase}`);
    this.game.phase = 'joining';
    this.commit();
  }

  setOpeningPercent(percent: number): void {
    if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) throw new BadRequestException('percent must be a number in 0..100');
    this.game.openingPercent = percent;
    // a result already revealed may show the comparison: refresh it
    for (const r of this.game.rounds) if (this.isScored(r)) r.result = this.computeResult(r);
    this.commit();
  }

  openPick(n: number): void {
    const g = this.game;
    const { r } = this.roundOf(n);
    if (g.phase !== 'joining' && g.phase !== 'rounds') throw new ConflictException(`Cannot open a round from phase ${g.phase}`);
    if (n !== g.currentRound + 1) throw new ConflictException(`Next round to open is ${g.currentRound + 1}`);
    if (g.currentRound > 0 && this.current()!.r.phase !== 'revealed') throw new ConflictException(`Round ${g.currentRound} is not finished`);
    r.phase = 'pick';
    g.phase = 'rounds';
    g.currentRound = n;
    this.commit();
  }

  openGuess(n: number): void {
    const { r } = this.roundOf(n);
    if (n !== this.game.currentRound || r.phase !== 'pick') throw new ConflictException(`Round ${n} is not in the pick step`);
    r.phase = 'guess';
    this.commit();
  }

  reveal(n: number): RoundResult {
    const { r } = this.roundOf(n);
    if (n !== this.game.currentRound || r.phase !== 'guess') throw new ConflictException(`Round ${n} is not in the guess step`);
    r.closedConnected = {};
    for (const id of this.playerIds()) r.closedConnected[id] = this.isConnected(id);
    r.result = this.computeResult(r);
    r.phase = 'revealed';
    this.commit();
    this.emit('reveal', n);
    return r.result;
  }

  voidRound(n: number, voided = true): void {
    const { r } = this.roundOf(n);
    if (n > this.game.currentRound) throw new ConflictException(`Round ${n} has not started`);
    r.voided = voided;
    if (voided && (r.phase === 'pick' || r.phase === 'guess')) r.phase = 'revealed'; // close without result
    this.commit();
  }

  excuse(playerId: string, n: number, excused = true): void {
    if (!this.game.players[playerId]) throw new NotFoundException('Unknown player');
    const { r } = this.roundOf(n);
    const has = r.excused.includes(playerId);
    if (excused && !has) r.excused.push(playerId);
    if (!excused && has) r.excused = r.excused.filter((id) => id !== playerId);
    if (this.isScored(r)) r.result = this.computeResult(r);
    this.commit();
    if (this.isScored(r)) this.emit('reveal', n);
  }

  startAnnounce(): void {
    if (this.game.phase !== 'rounds') throw new ConflictException(`Cannot announce from phase ${this.game.phase}`);
    if (this.game.rounds.some((r) => r.phase !== 'revealed')) throw new ConflictException('All rounds must be revealed (or voided) first');
    if (this.ranking().length === 0) throw new ConflictException('No scored rounds yet');
    this.game.phase = 'announce';
    this.game.finaleRevealed = 0;
    this.commit();
  }

  nextFinale(): void {
    if (this.game.phase !== 'announce') throw new ConflictException('Not in announce phase');
    const total = this.ranking().length;
    if (this.game.finaleRevealed >= total) throw new ConflictException('Everything is already revealed');
    this.game.finaleRevealed++;
    this.commit();
  }

  setReflectionOpen(open: boolean): void {
    this.game.reflectionOpen = open;
    this.commit();
  }

  approveReflection(id: string, approved: boolean): void {
    const ref = this.game.reflections.find((x) => x.id === id);
    if (!ref) throw new NotFoundException('Unknown reflection');
    ref.approved = approved;
    this.commit();
  }

  end(): void {
    this.game.phase = 'ended';
    this.game.reflectionOpen = false;
    this.commit();
  }

  // ---------- scoring ----------
  private computeResult(r: RoundState): RoundResult {
    const c = ROUNDS.find((x) => x.n === r.n)!;
    const players = this.game.players;
    const picks: Pick[] = Object.entries(r.picks)
      .filter(([id]) => players[id])
      .map(([id, option]) => ({ playerId: id, team: players[id].team, option }));
    const participants = Object.values(players)
      .filter((p) => p.joinedRound <= r.n && !r.excused.includes(p.id))
      .map((p) => ({ playerId: p.id, team: p.team, connected: r.closedConnected[p.id] ?? false }));
    const guesses = Object.entries(r.guesses).map(([playerId, value]) => ({ playerId, value }));

    const { scores, autoExcused, skipped } = scoreRound({ target: c.step2.target, picks, guesses, participants });

    const counts: Record<string, number> = Object.fromEntries(Object.keys(c.step1.options).map((k) => [k, 0]));
    for (const p of picks) counts[p.option] = (counts[p.option] ?? 0) + 1;
    const distribution = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, picks.length ? (v / picks.length) * 100 : 0]));

    const byTeam = new Map<number, number[]>();
    for (const s of scores) byTeam.set(s.team, [...(byTeam.get(s.team) ?? []), s.score]);
    const teamScores = Object.fromEntries([...byTeam].map(([t, xs]) => [t, xs.reduce((a, b) => a + b, 0) / xs.length]));

    const result: RoundResult = { distribution, scores, teamScores, autoExcused, skipped };
    if (c.compareOpening && this.game.openingPercent !== null) result.comparison = { x: this.game.openingPercent, y: distribution[c.step2.target] };
    if (c.correctOption) result.correctOption = c.correctOption;
    return result;
  }

  ranking(): TeamStanding[] {
    return standings(
      this.game.rounds.filter((r) => this.isScored(r)).map((r) => ({ round: r.n, scores: r.result!.scores })),
      2,
    );
  }

  // ---------- views ----------
  /** Safe for every player: never contains picks, guesses or actual numbers before reveal. */
  publicState() {
    const g = this.game;
    const cur = this.current();
    const total = this.ranking().length;
    const hidden = g.phase === 'announce' || g.phase === 'ended';
    return {
      phase: g.phase,
      teams: this.config.teams,
      opening: content.opening,
      round: cur
        ? {
            n: cur.r.n,
            title: cur.c.title,
            phase: cur.r.phase,
            voided: cur.r.voided,
            step1: cur.c.step1,
            step2: { ask: cur.c.step2.ask },
          }
        : null,
      reflection: { open: g.reflectionOpen, prompt: content.reflection.prompt, max: this.config.reflectionMax },
      finale: hidden
        ? {
            total,
            revealed: g.finaleRevealed,
            standings: this.ranking().map((s) => {
              const shown = s.rank > total - g.finaleRevealed;
              return {
                rank: s.rank,
                team: shown ? s.team : null,
                score: shown ? s.score : null,
                // rank 1 comes with per-round scores
                perRound: shown && s.rank === 1 ? s.perRound : null,
              };
            }),
          }
        : null,
    };
  }

  /** What one player sees once a round is revealed. */
  revealFor(playerId: string, n: number) {
    const { r, c } = this.roundOf(n);
    if (!this.isScored(r)) return null;
    const res = r.result!;
    const you: RoundScore | null = res.scores.find((s) => s.playerId === playerId) ?? null;
    return {
      round: n,
      title: c.title,
      target: c.step2.target,
      distribution: res.distribution,
      comparison: res.comparison ?? null,
      correctOption: res.correctOption ?? null,
      you: you ? { guess: you.guess, actual: you.actual, score: you.score } : null,
      excused: r.excused.includes(playerId) || res.autoExcused.includes(playerId),
    };
  }

  /** Controller dashboard: counts only, no leaking of distribution before reveal. */
  hostStats() {
    const g = this.game;
    const players = Object.values(g.players);
    const cur = this.current();
    const byTeam: Record<number, { joined: number; online: number }> = {};
    for (let t = 1; t <= this.config.teams; t++) byTeam[t] = { joined: 0, online: 0 };
    for (const p of players) {
      byTeam[p.team].joined++;
      if (this.isConnected(p.id)) byTeam[p.team].online++;
    }
    return {
      code: g.code,
      phase: g.phase,
      openingPercent: g.openingPercent,
      joined: players.length,
      online: players.filter((p) => this.isConnected(p.id)).length,
      byTeam,
      currentRound: g.currentRound,
      roundPhase: cur?.r.phase ?? null,
      picks: cur ? Object.keys(cur.r.picks).length : 0,
      guesses: cur ? Object.keys(cur.r.guesses).length : 0,
      rounds: g.rounds.map((r) => ({ n: r.n, phase: r.phase, voided: r.voided, excused: r.excused.length })),
      reflections: { open: g.reflectionOpen, total: g.reflections.length, approved: g.reflections.filter((x) => x.approved).length },
      finale: { revealed: g.finaleRevealed, total: this.ranking().length },
    };
  }

  /** Full detail for the host after a reveal (distribution + per-team scores). */
  hostRound(n: number) {
    const { r, c } = this.roundOf(n);
    return { n, title: c.title, phase: r.phase, voided: r.voided, target: c.step2.target, result: r.result ?? null, excused: r.excused };
  }

  hostPlayers() {
    return Object.values(this.game.players).map((p) => ({ ...p, online: this.isConnected(p.id) }));
  }

  hostReflections(): Reflection[] {
    return this.game.reflections;
  }

  wall(): { id: string; text: string }[] {
    return this.game.reflections.filter((x) => x.approved).map(({ id, text }) => ({ id, text }));
  }

  /** Export for F08: answers + anonymised reflections. */
  exportResults() {
    const g = this.game;
    return {
      code: g.code,
      exportedAt: new Date().toISOString(),
      openingPercent: g.openingPercent,
      players: Object.values(g.players).map((p) => ({ id: p.id, name: p.name, team: p.team, joinedRound: p.joinedRound })),
      rounds: g.rounds.map((r) => ({
        n: r.n,
        voided: r.voided,
        picks: r.picks,
        guesses: r.guesses,
        excused: r.excused,
        result: r.result ?? null,
      })),
      standings: this.ranking(),
      reflections: g.reflections.map(({ text, approved, createdAt }) => ({ text, approved, createdAt })),
    };
  }
}
