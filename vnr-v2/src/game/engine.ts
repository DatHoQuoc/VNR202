import { SKILLS, skillByKind } from './skills.ts';
import type {
  GameAction, GameEvent, GameState, Horse, Member, MoveOption, PlayerState, Question, Resolution, SkillCard, SkillKind
} from './types.ts';

export type Rng = () => number;

/**
 * Track: a six-armed star. Each arm has a left column (ARM_LEN cells, outward), a tip cell and a
 * right column (ARM_LEN cells, inward). A team's start cell is the tip of its own arm. After a
 * full lap the horse turns into its private home lane. Two dice are rolled and added together.
 */
export const ARM_LEN = 2;
export const CELLS_PER_ARM = ARM_LEN * 2 + 1;
export const RING_SIZE = CELLS_PER_ARM * 6;
export const RING_MAX = RING_SIZE;
export const HOME_LANE = 3;
export const FINISH = RING_MAX + HOME_LANE;
export const MAX_MEMBERS = 6;
export const MIN_HORSES = 2;
export const MAX_HORSES = 3;
export const PUSHBACK = 5;
export const HAND_MAX = 5;
export const BOOST_STEPS = 4;
export const BARRICADE_CAP = 3;
export const MAX_STREAK = 2;
export const DEFAULT_ROLL_MS = 15_000;
export const DEFAULT_QUESTION_MS = 25_000;
export const MOVE_MS = 12_000;
export const DEFAULT_TIME_LIMIT_MS = 18 * 60_000;

export const MILESTONES = [
  '1858 – Pháp nổ súng tấn công Đà Nẵng, mở đầu cuộc xâm lược Việt Nam.',
  '1911 – Nguyễn Tất Thành ra đi tìm đường cứu nước.',
  '1920 – Đại hội Tours: Nguyễn Ái Quốc tán thành Quốc tế III.',
  '1925 – Thành lập Hội Việt Nam Cách mạng Thanh niên ở Quảng Châu.',
  '1929 – Ba tổ chức cộng sản ra đời, đòi hỏi phải hợp nhất.'
];

/** Ring cell (clockwise) of a horse; null in the stable or the home lane. */
export function ringCell(seat: number, progress: number): number | null {
  if (progress < 1 || progress > RING_MAX) return null;
  return (seat * CELLS_PER_ARM + ARM_LEN + progress - 1) % RING_SIZE;
}
/** Progress a team's horse would have when standing on `cell`. */
export function progressAt(seat: number, cell: number): number {
  return ((((cell - (seat * CELLS_PER_ARM + ARM_LEN)) % RING_SIZE) + RING_SIZE) % RING_SIZE) + 1;
}
/** Start (tip) cells are safe: nobody can be kicked there. */
export const isSafeCell = (cell: number): boolean => cell % CELLS_PER_ARM === ARM_LEN;
const onRing = (h: Horse): boolean => h.progress >= 1 && h.progress <= RING_MAX;
const lead = (t: PlayerState): number => Math.max(0, ...t.horses.map((h) => h.progress));
const total = (t: PlayerState): number => t.horses.reduce((n, h) => n + h.progress, 0);
export const homeCount = (t: PlayerState, finish = FINISH): number => t.horses.filter((h) => h.progress >= finish).length;
const needed = (s: GameState, t: PlayerState): number => Math.min(s.winHome, t.horses.length);
const findHorse = (s: GameState, horseId?: string): { team: PlayerState; horse: Horse } | null => {
  for (const team of Object.values(s.players)) { const horse = team.horses.find((h) => h.id === horseId); if (horse) return { team, horse }; }
  return null;
};

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function log(s: GameState, now: number, type: string, text: string, teamId?: string, targetId?: string): void {
  s.events.push({ id: ++s.eventSeq, at: now, type, text, teamId, targetId } satisfies GameEvent);
  if (s.events.length > 80) s.events.splice(0, s.events.length - 80);
}

function buildSkillDeck(s: GameState, rng: Rng): void {
  const cards: SkillCard[] = [];
  for (const def of SKILLS) for (let i = 0; i < def.copies; i++) cards.push({ id: `c${++s.cardSeq}`, kind: def.kind });
  s.skillDeck = shuffle(cards, rng);
}

function drawSkill(s: GameState, rng: Rng): SkillCard {
  if (!s.skillDeck.length) {
    s.skillDeck = shuffle(s.skillDiscard, rng);
    s.skillDiscard = [];
    if (!s.skillDeck.length) buildSkillDeck(s, rng);
  }
  return s.skillDeck.pop()!;
}

export interface GameOptions {
  rollMs?: number; questionMs?: number; finish?: number; winHome?: number; exitRolls?: number[];
  /** Horses per team (2 or 3). */
  horses?: number;
  timeLimitMs?: number;
}
export interface TeamInput { id: string; seat: number; members: Member[] }

const roll2 = (rng: Rng): [number, number] => [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)];

export function createGame(input: TeamInput[], bank: Question[], now: number, rng: Rng, options: GameOptions = {}): GameState {
  const teams = input.filter((t) => t.members.length > 0).sort((a, b) => a.seat - b.seat);
  if (teams.length < 2 || teams.length > 6) throw new Error('Cần từ 2 đến 6 đội (mỗi đội ít nhất 1 người) để bắt đầu.');
  const finish = options.finish ?? FINISH;
  const horseCount = Math.min(MAX_HORSES, Math.max(MIN_HORSES, options.horses ?? MIN_HORSES));
  const players: Record<string, PlayerState> = {};
  for (const t of teams) {
    if (t.members.length > MAX_MEMBERS) throw new Error(`Mỗi đội tối đa ${MAX_MEMBERS} người.`);
    players[t.id] = {
      teamId: t.id, seat: t.seat, members: t.members, actingIdx: 0,
      // One horse starts on the start cell so the first turns are not wasted waiting for a 1 or a 6.
      horses: Array.from({ length: horseCount }, (_, i) => ({ id: `${t.id}-h${i + 1}`, name: `Ngựa ${i + 1}`, progress: i === 0 ? 1 : 0, cap: null })),
      hand: [], stunned: false, boost: 0, doubleDice: false, shield: false, correct: 0, answered: 0
    };
  }
  const first = players[teams[0].id];
  const timeLimitMs = options.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS;
  const s: GameState = {
    phase: 'roll', deadline: null, paused: false, pausedRemaining: null,
    rollMs: options.rollMs ?? DEFAULT_ROLL_MS, questionMs: options.questionMs ?? DEFAULT_QUESTION_MS, finish,
    timeLimitMs, endsAt: now + timeLimitMs, pausedLeft: null,
    order: teams.map((t) => t.id), turnTeamId: first.teamId, actingMemberId: first.members[0].id, turnNumber: 1, streak: 0,
    winHome: Math.min(horseCount, Math.max(1, options.winHome ?? 2)), exitRolls: options.exitRolls ?? [1, 6], skillLog: [],
    players, skillDeck: [], skillDiscard: [], cardSeq: 0,
    questionDeck: shuffle(bank.map((q) => q.id), rng),
    skillUsed: false, dice: null, pending: null, question: null, resolution: null,
    events: [], eventSeq: 0, milestones: Object.fromEntries(teams.map((t) => [t.id, 0])),
    winnerId: null, ranking: null, endedBy: null
  };
  buildSkillDeck(s, rng);
  s.deadline = now + s.rollMs;
  log(s, now, 'start', `Cuộc đua bắt đầu! Mỗi đội có ${horseCount} ngựa, đưa ${s.winHome} ngựa về đích trước để thắng. Tung được ${s.exitRolls.join(' hoặc ')} thì đưa ngựa ra khỏi chuồng.`);
  return s;
}

/** Moves on to the next team (or lets the same member roll again after a bonus). */
function nextTurn(s: GameState, now: number, bonus: boolean): void {
  if (bonus && s.streak < MAX_STREAK) {
    s.streak += 1;
  } else {
    s.streak = 0;
    const n = s.order.length;
    let idx = s.order.indexOf(s.turnTeamId);
    for (let guard = 0; guard < n * 2; guard++) {
      idx = (idx + 1) % n;
      const candidate = s.players[s.order[idx]];
      if (candidate.stunned) {
        candidate.stunned = false;
        log(s, now, 'skip', 'bị “Chia Để Trị”, mất lượt này.', candidate.teamId);
        continue;
      }
      break;
    }
    s.turnTeamId = s.order[idx];
    const team = s.players[s.turnTeamId];
    team.actingIdx = (team.actingIdx + 1) % team.members.length;
    s.actingMemberId = team.members[team.actingIdx].id;
  }
  s.turnNumber += 1;
  s.phase = 'roll';
  s.skillUsed = false;
  s.dice = null;
  s.pending = null;
  s.question = null;
  s.deadline = now + s.rollMs;
}

function rollDice(s: GameState, now: number, rng: Rng, bank: Question[]): void {
  const team = s.players[s.turnTeamId];
  const who = team.members.find((m) => m.id === s.actingMemberId)!.name;
  let dice = roll2(rng);
  if (team.doubleDice) {
    team.doubleDice = false;
    const again = roll2(rng);
    log(s, now, 'roll', `(${who}) tung hai lần: ${dice[0]}+${dice[1]} và ${again[0]}+${again[1]}, lấy ${Math.max(dice[0] + dice[1], again[0] + again[1])}.`, team.teamId);
    if (again[0] + again[1] > dice[0] + dice[1]) dice = again;
  } else log(s, now, 'roll', `(${who}) tung ${dice[0]} + ${dice[1]} = ${dice[0] + dice[1]}${dice[0] === dice[1] ? ' (đôi!)' : ''}.`, team.teamId);
  s.dice = dice;

  if (!s.questionDeck.length) s.questionDeck = shuffle(bank.map((q) => q.id), rng);
  const id = s.questionDeck.pop()!;
  const q = bank.find((item) => item.id === id)!;
  const options = shuffle([q.correct, ...q.wrong], rng);
  s.question = { id: q.id, text: q.text, options, answerIndex: options.indexOf(q.correct), removed: [], hintShown: false };
  s.phase = 'question';
  s.deadline = now + s.questionMs;
}

function finishGame(s: GameState, now: number, winnerId: string | null, by: 'finish' | 'host' | 'time'): void {
  s.phase = 'finished';
  s.deadline = null;
  s.endsAt = null;
  s.paused = false;
  s.pausedRemaining = null;
  s.pausedLeft = null;
  s.question = null;
  s.pending = null;
  s.endedBy = by;
  s.ranking = [...s.order].sort((a, b) => {
    if (a === winnerId) return -1;
    if (b === winnerId) return 1;
    const A = s.players[a], B = s.players[b];
    return homeCount(B, s.finish) - homeCount(A, s.finish) || total(B) - total(A) || B.correct - A.correct;
  });
  s.winnerId = winnerId ?? s.ranking[0];
  log(s, now, 'finish', by === 'finish' ? 'đã đưa đủ ngựa về đích đầu tiên!' : by === 'time' ? 'dẫn đầu khi hết giờ ván đấu.' : 'dẫn đầu khi ván đấu kết thúc.', s.winnerId);
}

/** Every legal move for the current roll. Empty when nothing can move (e.g. all in the stable without an exit roll). */
function moveOptions(s: GameState, team: PlayerState): MoveOption[] {
  const dice = s.dice!;
  const canExit = dice.some((d) => s.exitRolls.includes(d));
  const sum = dice[0] + dice[1];
  const out: MoveOption[] = [];
  for (const h of team.horses) {
    if (h.progress >= s.finish) continue;
    if (h.progress === 0) {
      if (canExit) out.push({ horseId: h.id, kind: 'exit', from: 0, to: 1, capped: false, kicks: [], home: false });
      continue;
    }
    let steps = sum + team.boost;
    let capped = false;
    if (h.cap !== null && steps > h.cap) { steps = h.cap; capped = true; }
    const to = Math.min(h.progress + steps, s.finish);
    const kicks: MoveOption['kicks'] = [];
    const cell = ringCell(team.seat, to);
    if (cell !== null && !isSafeCell(cell)) {
      for (const other of Object.values(s.players)) {
        if (other.teamId === team.teamId) continue;
        for (const r of other.horses) if (ringCell(other.seat, r.progress) === cell) kicks.push({ horseId: r.id, teamId: other.teamId, name: r.name });
      }
    }
    out.push({ horseId: h.id, kind: 'advance', from: h.progress, to, capped, kicks, home: to >= s.finish });
  }
  return out;
}

/** Heuristic used when the player does not choose in time: kick > reach home > leave the stable > most advanced. */
function bestOption(options: MoveOption[]): MoveOption {
  const score = (o: MoveOption) => o.kicks.length * 1000 + (o.home ? 500 : 0) + (o.kind === 'exit' ? 200 : 0) + o.to;
  return [...options].sort((a, b) => score(b) - score(a))[0];
}

function onAnswer(s: GameState, now: number, rng: Rng, bank: Question[], picked: number | null): void {
  const team = s.players[s.turnTeamId];
  const active = s.question!;
  const q = bank.find((item) => item.id === active.id)!;
  const outcome: Resolution['outcome'] = picked === null ? 'timeout' : picked === active.answerIndex ? 'correct' : 'wrong';
  team.answered += 1;
  let gained: SkillKind | null = null;
  if (outcome === 'correct') {
    team.correct += 1;
    const card = drawSkill(s, rng);
    team.hand.push(card);
    gained = card.kind;
    if (team.hand.length > HAND_MAX) s.skillDiscard.push(team.hand.shift()!);
  }
  const options = moveOptions(s, team);
  s.pending = { outcome, picked, gained, questionText: active.text, correctText: q.correct, explain: q.explain, ref: q.ref, options };
  s.question = null;
  if (options.length <= 1) { applyMove(s, now, options[0] ?? null); return; }
  s.phase = 'move';
  s.deadline = now + MOVE_MS;
}

function applyMove(s: GameState, now: number, option: MoveOption | null): void {
  const team = s.players[s.turnTeamId];
  const member = team.members.find((m) => m.id === s.actingMemberId)!;
  const p = s.pending!;
  const dice = s.dice!;
  const horse = option ? team.horses.find((h) => h.id === option.horseId)! : null;
  const boost = team.boost;
  const kicked: Resolution['kicked'] = [];
  if (option && horse) {
    horse.progress = option.to;
    if (option.kind === 'advance') { team.boost = 0; horse.cap = null; }
    // Re-evaluate kicks on the live board (state may not have changed since the options were built, but be safe).
    const cell = ringCell(team.seat, horse.progress);
    if (cell !== null && !isSafeCell(cell)) {
      for (const other of Object.values(s.players)) {
        if (other.teamId === team.teamId) continue;
        for (const h of other.horses) if (ringCell(other.seat, h.progress) === cell) { h.progress = 0; kicked.push({ horseId: h.id, teamId: other.teamId, name: h.name }); }
      }
    }
  }
  const reachedHome = !!option && option.home;
  const bonus = dice[0] === dice[1] || kicked.length > 0 || reachedHome;
  s.resolution = {
    id: s.turnNumber, teamId: team.teamId, memberId: member.id, memberName: member.name, dice,
    horseId: horse?.id ?? null, horseName: horse?.name ?? null, steps: option ? option.to - option.from : 0,
    from: option?.from ?? 0, to: option?.to ?? 0, exited: option?.kind === 'exit', kicked, bonus,
    picked: p.picked, outcome: p.outcome, questionText: p.questionText, correctText: p.correctText, explain: p.explain, ref: p.ref,
    gained: p.gained, capped: !!option?.capped, boost: option?.kind === 'advance' ? boost : 0
  };

  const verdict = p.outcome === 'correct' ? 'trả lời đúng' : p.outcome === 'wrong' ? 'trả lời sai' : 'hết giờ';
  const move = !option ? 'không có ngựa nào đi được (cần ' + s.exitRolls.join(' hoặc ') + ' để xuất chuồng)'
    : option.kind === 'exit' ? `${horse!.name} xuất chuồng`
    : `${horse!.name} tiến ${option.to - option.from} bước${option.capped ? ' (bị Thuế Khóa giới hạn)' : ''}`;
  log(s, now, 'move', `(${member.name}) ${verdict}, ${move}.`, team.teamId);
  if (p.gained) log(s, now, 'card', `nhận thẻ “${skillByKind[p.gained].name}”.`, team.teamId);
  for (const k of kicked) log(s, now, 'kick', `ĐÁ ${k.name}! Ngựa bị đá về chuồng.`, team.teamId, k.teamId);
  if (reachedHome) log(s, now, 'home', `${horse!.name} về đích!`, team.teamId);

  const m = Math.min(MILESTONES.length, Math.floor((lead(team) / s.finish) * (MILESTONES.length + 1)));
  if (m > s.milestones[team.teamId] && lead(team) < s.finish) {
    s.milestones[team.teamId] = m;
    log(s, now, 'milestone', `qua mốc lịch sử: ${MILESTONES[m - 1]}`, team.teamId);
  }

  s.pending = null;
  s.dice = null;
  if (homeCount(team, s.finish) >= needed(s, team)) { finishGame(s, now, team.teamId, 'finish'); return; }
  if (bonus && s.streak < MAX_STREAK) log(s, now, 'bonus', `(${member.name}) được tung thêm một lượt!`, team.teamId);
  nextTurn(s, now, bonus);
}

function hostile(s: GameState, now: number, target: PlayerState, name: string): boolean {
  if (target.shield) {
    target.shield = false;
    log(s, now, 'block', `dùng Khiên “Chủ Nghĩa Làm Cốt” chặn “${name}”.`, target.teamId);
    return true;
  }
  return false;
}

const leadingRingHorse = (t: PlayerState): Horse | undefined => t.horses.filter(onRing).sort((a, b) => b.progress - a.progress)[0];

function playSkill(s: GameState, cardId: string, targetHorseId: string | undefined, now: number, rng: Rng): void {
  const actor = s.players[s.turnTeamId];
  const card = actor.hand.find((c) => c.id === cardId);
  if (!card) throw new Error('Đội bạn không có thẻ này.');
  const def = skillByKind[card.kind];
  if (def.timing === 'roll') {
    if (s.phase !== 'roll') throw new Error('Thẻ này chỉ dùng trước khi đổ xúc xắc.');
    if (s.skillUsed) throw new Error('Mỗi lượt chỉ được dùng 1 thẻ trước khi đổ xúc xắc.');
  } else if (s.phase !== 'question' || !s.question) throw new Error('Thẻ này chỉ dùng khi đang trả lời câu hỏi.');

  const myHorse = leadingRingHorse(actor);
  let target: { team: PlayerState; horse: Horse } | null = null;
  if (def.target === 'enemy') {
    target = findHorse(s, targetHorseId);
    if (!target || target.team.teamId === actor.teamId) throw new Error('Hãy chọn một con ngựa của đội đối thủ.');
    const h = target.horse;
    const horseLevel = ['barricade', 'push-back', 'swap'].includes(card.kind);
    if (horseLevel && h.progress >= s.finish) throw new Error('Ngựa này đã về đích.');
    if (card.kind === 'stun' && target.team.stunned) throw new Error('Đội này đã bị mất lượt rồi.');
    if (card.kind === 'barricade' && (h.cap !== null || h.progress === 0)) throw new Error(h.progress === 0 ? 'Ngựa này còn ở chuồng.' : 'Ngựa này đã bị Thuế Khóa rồi.');
    if (card.kind === 'push-back' && !onRing(h)) throw new Error('Chỉ đẩy lùi được ngựa đang trên vòng đua.');
    if (card.kind === 'swap' && (!onRing(h) || !myHorse)) throw new Error('Hoán đổi cần ngựa dẫn đầu vòng đua của bạn và ngựa mục tiêu đều đang trên vòng đua.');
    if (card.kind === 'steal' && !target.team.hand.length) throw new Error('Đội này chưa có thẻ nào để lấy.');
  }

  actor.hand = actor.hand.filter((c) => c.id !== cardId);
  s.skillDiscard.push(card);
  if (def.timing === 'roll') s.skillUsed = true;
  const member = actor.members.find((m) => m.id === s.actingMemberId)!;
  const blocked = !!target && hostile(s, now, target.team, def.name);
  s.skillLog.push({
    id: (s.skillLog.at(-1)?.id ?? 0) + 1, turn: s.turnNumber, kind: card.kind, teamId: actor.teamId, memberName: member.name,
    targetTeamId: target?.team.teamId, targetHorseId: target?.horse.id, targetName: target?.horse.name, blocked
  });
  if (s.skillLog.length > 30) s.skillLog.shift();
  const where = target ? (['stun', 'steal'].includes(card.kind) ? ' lên cả đội' : ` lên ${target.horse.name}`) : '';
  log(s, now, 'skill', `(${member.name}) dùng “${def.name}”${where}${blocked ? ' nhưng bị khiên chặn' : ''}.`, actor.teamId, target?.team.teamId);
  if (blocked) return;

  switch (card.kind) {
    case 'stun': target!.team.stunned = true; break;
    case 'barricade': target!.horse.cap = BARRICADE_CAP; break;
    case 'push-back': target!.horse.progress = Math.max(1, target!.horse.progress - PUSHBACK); break;
    case 'swap': {
      const mine = ringCell(actor.seat, myHorse!.progress)!;
      const other = ringCell(target!.team.seat, target!.horse.progress)!;
      myHorse!.progress = progressAt(actor.seat, other);
      target!.horse.progress = progressAt(target!.team.seat, mine);
      break;
    }
    case 'steal': {
      const stolen = target!.team.hand.splice(Math.floor(rng() * target!.team.hand.length), 1)[0];
      actor.hand.push(stolen);
      if (actor.hand.length > HAND_MAX) s.skillDiscard.push(actor.hand.shift()!);
      break;
    }
    case 'boost': actor.boost = BOOST_STEPS; break;
    case 'double-dice': actor.doubleDice = true; break;
    case 'shield': actor.shield = true; break;
    case 'hint': s.question!.hintShown = true; break;
    case 'fifty': {
      const q = s.question!;
      const wrongs = shuffle(q.options.map((_, i) => i).filter((i) => i !== q.answerIndex && !q.removed.includes(i)), rng);
      q.removed.push(...wrongs.slice(0, 2));
      break;
    }
  }
}

/** `actorId` is the member (player) id; only the member whose turn it is may act. */
export function applyAction(
  state: GameState, actorId: string, action: GameAction, now: number, rng: Rng, bank: Question[]
): GameState {
  if (state.phase === 'finished') throw new Error('Ván đấu đã kết thúc.');
  if (state.paused) throw new Error('Ván đấu đang tạm dừng.');
  if (actorId !== state.actingMemberId) throw new Error('Chưa đến lượt của bạn.');
  const s = structuredClone(state);
  switch (action.type) {
    case 'roll':
      if (s.phase !== 'roll') throw new Error('Bạn đã đổ xúc xắc rồi.');
      rollDice(s, now, rng, bank);
      break;
    case 'answer': {
      if (s.phase !== 'question' || !s.question) throw new Error('Chưa có câu hỏi để trả lời.');
      const { index } = action;
      if (!Number.isInteger(index) || index < 0 || index >= s.question.options.length || s.question.removed.includes(index))
        throw new Error('Phương án không hợp lệ.');
      onAnswer(s, now, rng, bank, index);
      break;
    }
    case 'choose-horse': {
      if (s.phase !== 'move' || !s.pending) throw new Error('Chưa đến lúc chọn ngựa.');
      const option = s.pending.options.find((o) => o.horseId === action.horseId);
      if (!option) throw new Error('Ngựa này không đi được với kết quả xúc xắc hiện tại.');
      applyMove(s, now, option);
      break;
    }
    case 'play-skill':
      playSkill(s, action.cardId, action.targetHorseId, now, rng);
      break;
    default:
      throw new Error('Lệnh không hợp lệ.');
  }
  return s;
}

/** Applies timeouts: an idle roll auto-rolls, an unanswered question counts as a miss, an unchosen move is picked for the team. */
export function tick(state: GameState, now: number, rng: Rng, bank: Question[]): GameState {
  if (state.phase === 'finished' || state.paused) return state;
  if (state.endsAt !== null && now >= state.endsAt) {
    const s = structuredClone(state);
    finishGame(s, now, null, 'time');
    return s;
  }
  if (state.deadline === null || now < state.deadline) return state;
  const s = structuredClone(state);
  if (s.phase === 'roll') {
    log(s, now, 'timeout', 'chậm đổ xúc xắc nên hệ thống đổ thay.', s.turnTeamId);
    rollDice(s, now, rng, bank);
  } else if (s.phase === 'question') onAnswer(s, now, rng, bank, null);
  else if (s.phase === 'move' && s.pending) {
    log(s, now, 'timeout', 'chậm chọn ngựa nên hệ thống chọn thay.', s.turnTeamId);
    applyMove(s, now, bestOption(s.pending.options));
  }
  return s;
}

export function pauseGame(state: GameState, now: number): GameState {
  if (state.phase === 'finished' || state.paused) return state;
  const s = structuredClone(state);
  s.paused = true;
  s.pausedRemaining = s.deadline === null ? null : Math.max(0, s.deadline - now);
  s.pausedLeft = s.endsAt === null ? null : Math.max(0, s.endsAt - now);
  s.deadline = null;
  s.endsAt = null;
  log(s, now, 'pause', 'Ván đấu tạm dừng.');
  return s;
}

export function resumeGame(state: GameState, now: number): GameState {
  if (!state.paused) return state;
  const s = structuredClone(state);
  s.paused = false;
  s.deadline = s.pausedRemaining === null ? null : now + s.pausedRemaining;
  s.endsAt = s.pausedLeft === null ? null : now + s.pausedLeft;
  s.pausedRemaining = null;
  s.pausedLeft = null;
  log(s, now, 'resume', 'Ván đấu tiếp tục.');
  return s;
}

export function endGame(state: GameState, now: number): GameState {
  if (state.phase === 'finished') return state;
  const s = structuredClone(state);
  finishGame(s, now, null, 'host');
  return s;
}
