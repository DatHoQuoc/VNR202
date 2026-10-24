import { SKILLS, skillByKind } from './skills.ts';
import type {
  GameAction, GameEvent, GameState, Horse, Member, PlayerState, Question, Resolution, SkillCard, SkillKind
} from './types.ts';

export type Rng = () => number;

/**
 * Track: a six-armed star. Each arm has a left column (3 cells, outward), a tip cell and a
 * right column (3 cells, inward), so the shared ring has 6 x 7 = 42 cells. A team's start cell
 * is the tip of its own arm. After a full lap the horse turns into its private home lane.
 */
export const ARM_LEN = 3;
export const CELLS_PER_ARM = ARM_LEN * 2 + 1;
export const RING_SIZE = CELLS_PER_ARM * 6;
export const RING_MAX = RING_SIZE;
export const HOME_LANE = 4;
export const FINISH = RING_MAX + HOME_LANE;
export const MAX_MEMBERS = 6;
export const PUSHBACK = 4;
export const HAND_MAX = 5;
export const BOOST_STEPS = 3;
export const BARRICADE_CAP = 2;
export const MAX_STREAK = 2;
export const DEFAULT_ROLL_MS = 25_000;
export const DEFAULT_QUESTION_MS = 30_000;

export const MILESTONES = [
  '1858 – Pháp nổ súng tấn công Đà Nẵng, mở đầu cuộc xâm lược Việt Nam.',
  '1911 – Nguyễn Tất Thành ra đi tìm đường cứu nước.',
  '1920 – Đại hội Tours: Nguyễn Ái Quốc tán thành Quốc tế III.',
  '1925 – Thành lập Hội Việt Nam Cách mạng Thanh niên ở Quảng Châu.',
  '1929 – Ba tổ chức cộng sản ra đời, đòi hỏi phải hợp nhất.'
];

/** Ring cell (0..41, clockwise) of a horse; null in the stable or the home lane. */
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
export const homeCount = (t: PlayerState, finish = FINISH): number => t.horses.filter((h) => h.progress >= finish).length;
const needed = (s: GameState, t: PlayerState): number => Math.min(s.winHome, t.horses.length);

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

export interface GameOptions { rollMs?: number; questionMs?: number; finish?: number; winHome?: number; exitRolls?: number[] }
export interface TeamInput { id: string; seat: number; members: Member[] }

function pickActor(team: PlayerState, finish: number): Member {
  const n = team.members.length;
  for (let k = 1; k <= n; k++) {
    const idx = (team.actingIdx + k) % n;
    const horse = team.horses.find((h) => h.memberId === team.members[idx].id)!;
    if (horse.progress < finish) { team.actingIdx = idx; return team.members[idx]; }
  }
  team.actingIdx = (team.actingIdx + 1) % n;
  return team.members[team.actingIdx];
}

export function createGame(input: TeamInput[], bank: Question[], now: number, rng: Rng, options: GameOptions = {}): GameState {
  const teams = input.filter((t) => t.members.length > 0).sort((a, b) => a.seat - b.seat);
  if (teams.length < 2 || teams.length > 6) throw new Error('Cần từ 2 đến 6 đội (mỗi đội ít nhất 1 người) để bắt đầu.');
  const finish = options.finish ?? FINISH;
  const players: Record<string, PlayerState> = {};
  for (const t of teams) {
    if (t.members.length > MAX_MEMBERS) throw new Error(`Mỗi đội tối đa ${MAX_MEMBERS} người.`);
    players[t.id] = {
      teamId: t.id, seat: t.seat, members: t.members, actingIdx: -1,
      horses: t.members.map((m) => ({ id: `h-${m.id}`, memberId: m.id, name: m.name, progress: 0 })),
      hand: [], stunned: false, cap: null, boost: 0, doubleDice: false, shield: false, correct: 0, answered: 0
    };
  }
  const first = players[teams[0].id];
  const s: GameState = {
    phase: 'roll', deadline: null, paused: false, pausedRemaining: null,
    rollMs: options.rollMs ?? DEFAULT_ROLL_MS, questionMs: options.questionMs ?? DEFAULT_QUESTION_MS, finish,
    order: teams.map((t) => t.id), turnTeamId: first.teamId, actingMemberId: '', turnNumber: 1, streak: 0,
    winHome: Math.max(1, options.winHome ?? 1), exitRolls: options.exitRolls ?? [1, 6], lastSkill: null,
    players, skillDeck: [], skillDiscard: [], cardSeq: 0,
    questionDeck: shuffle(bank.map((q) => q.id), rng),
    skillUsed: false, dice: null, question: null, resolution: null,
    events: [], eventSeq: 0, milestones: Object.fromEntries(teams.map((t) => [t.id, 0])),
    winnerId: null, ranking: null, endedBy: null
  };
  s.actingMemberId = pickActor(first, finish).id;
  buildSkillDeck(s, rng);
  s.deadline = now + s.rollMs;
  log(s, now, 'start', `Cuộc đua bắt đầu! Tung ${s.exitRolls.join(' hoặc ')} để đưa ngựa ra khỏi chuồng.`);
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
    s.actingMemberId = pickActor(s.players[s.turnTeamId], s.finish).id;
  }
  s.turnNumber += 1;
  s.phase = 'roll';
  s.skillUsed = false;
  s.dice = null;
  s.question = null;
  s.deadline = now + s.rollMs;
}

function rollDice(s: GameState, now: number, rng: Rng, bank: Question[]): void {
  const team = s.players[s.turnTeamId];
  const who = team.members.find((m) => m.id === s.actingMemberId)!.name;
  const rolls = team.doubleDice ? [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)] : [1 + Math.floor(rng() * 6)];
  const dice = Math.max(...rolls);
  if (team.doubleDice) {
    team.doubleDice = false;
    log(s, now, 'roll', `(${who}) đổ hai xúc xắc được ${rolls.join(' và ')}, lấy ${dice}.`, team.teamId);
  } else log(s, now, 'roll', `(${who}) đổ được ${dice}.`, team.teamId);
  s.dice = dice;

  if (!s.questionDeck.length) s.questionDeck = shuffle(bank.map((q) => q.id), rng);
  const id = s.questionDeck.pop()!;
  const q = bank.find((item) => item.id === id)!;
  const options = shuffle([q.correct, ...q.wrong], rng);
  s.question = { id: q.id, text: q.text, options, answerIndex: options.indexOf(q.correct), removed: [], hintShown: false };
  s.phase = 'question';
  s.deadline = now + s.questionMs;
}

function finishGame(s: GameState, now: number, winnerId: string | null, by: 'finish' | 'host'): void {
  s.phase = 'finished';
  s.deadline = null;
  s.paused = false;
  s.pausedRemaining = null;
  s.question = null;
  s.endedBy = by;
  s.ranking = [...s.order].sort((a, b) => {
    if (a === winnerId) return -1;
    if (b === winnerId) return 1;
    const A = s.players[a], B = s.players[b];
    return homeCount(B, s.finish) - homeCount(A, s.finish) || lead(B) - lead(A) || B.correct - A.correct;
  });
  s.winnerId = winnerId ?? s.ranking[0];
  log(s, now, 'finish', by === 'finish' ? 'đã đưa ngựa về đích đầu tiên!' : 'dẫn đầu khi ván đấu kết thúc.', s.winnerId);
}

function resolveTurn(s: GameState, now: number, rng: Rng, bank: Question[], picked: number | null): void {
  const team = s.players[s.turnTeamId];
  const member = team.members.find((m) => m.id === s.actingMemberId)!;
  const horse = team.horses.find((h) => h.memberId === member.id)!;
  const active = s.question!;
  const q = bank.find((item) => item.id === active.id)!;
  const outcome: Resolution['outcome'] = picked === null ? 'timeout' : picked === active.answerIndex ? 'correct' : 'wrong';
  team.answered += 1;

  const dice = s.dice ?? 0;
  const from = horse.progress;
  let steps = 0;
  let exited = false;
  let capped = false;
  const boost = team.boost;
  if (from === 0) {
    if (s.exitRolls.includes(dice)) { horse.progress = 1; exited = true; steps = 1; }
  } else if (from < s.finish) {
    steps = dice + boost;
    if (team.cap !== null && steps > team.cap) { steps = team.cap; capped = true; }
    horse.progress = Math.min(from + steps, s.finish);
    team.boost = 0;
    team.cap = null;
  }

  // Landing on a non-safe ring cell kicks every rival horse standing there back to its stable.
  const kicked: Resolution['kicked'] = [];
  const cell = ringCell(team.seat, horse.progress);
  if (cell !== null && !isSafeCell(cell)) {
    for (const other of Object.values(s.players)) {
      if (other.teamId === team.teamId) continue;
      for (const h of other.horses) {
        if (ringCell(other.seat, h.progress) === cell) { h.progress = 0; kicked.push({ horseId: h.id, teamId: other.teamId, name: h.name }); }
      }
    }
  }
  const reachedHome = horse.progress >= s.finish && from < s.finish;

  let gained: SkillKind | null = null;
  if (outcome === 'correct') {
    team.correct += 1;
    const card = drawSkill(s, rng);
    team.hand.push(card);
    gained = card.kind;
    if (team.hand.length > HAND_MAX) s.skillDiscard.push(team.hand.shift()!);
  }

  const bonus = dice === 6 || kicked.length > 0 || reachedHome;
  s.resolution = {
    id: s.turnNumber, teamId: team.teamId, memberId: member.id, memberName: member.name, horseId: horse.id,
    dice, steps, from, to: horse.progress, exited, kicked, bonus, picked, outcome,
    questionText: active.text, correctText: q.correct, explain: q.explain, ref: q.ref, gained, capped, boost: capped || steps > 0 ? boost : 0
  };

  const verdict = outcome === 'correct' ? 'trả lời đúng' : outcome === 'wrong' ? 'trả lời sai' : 'hết giờ';
  const move = exited ? 'ngựa xuất chuồng' : steps > 0 ? `ngựa tiến ${steps} bước${capped ? ' (bị Thuế Khóa giới hạn)' : ''}` : from === 0 ? `chưa ra chuồng (cần ${s.exitRolls.join(' hoặc ')})` : 'ngựa đã về đích';
  log(s, now, 'move', `(${member.name}) ${verdict}, ${move}.`, team.teamId);
  if (gained) log(s, now, 'card', `nhận thẻ “${skillByKind[gained].name}”.`, team.teamId);
  for (const k of kicked) log(s, now, 'kick', `ĐÁ ngựa của ${k.name}! Ngựa bị đá về chuồng.`, team.teamId, k.teamId);
  if (reachedHome) log(s, now, 'home', `(${member.name}) đưa ngựa về đích!`, team.teamId);

  const m = Math.min(MILESTONES.length, Math.floor((lead(team) / s.finish) * (MILESTONES.length + 1)));
  if (m > s.milestones[team.teamId] && lead(team) < s.finish) {
    s.milestones[team.teamId] = m;
    log(s, now, 'milestone', `qua mốc lịch sử: ${MILESTONES[m - 1]}`, team.teamId);
  }

  s.question = null;
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

const mostAdvancedOnRing = (t: PlayerState): Horse | undefined =>
  t.horses.filter(onRing).sort((a, b) => b.progress - a.progress)[0];

function playSkill(s: GameState, cardId: string, targetId: string | undefined, now: number, rng: Rng): void {
  const actor = s.players[s.turnTeamId];
  const card = actor.hand.find((c) => c.id === cardId);
  if (!card) throw new Error('Đội bạn không có thẻ này.');
  const def = skillByKind[card.kind];
  if (def.timing === 'roll') {
    if (s.phase !== 'roll') throw new Error('Thẻ này chỉ dùng trước khi đổ xúc xắc.');
    if (s.skillUsed) throw new Error('Mỗi lượt chỉ được dùng 1 thẻ trước khi đổ xúc xắc.');
  } else if (s.phase !== 'question' || !s.question) throw new Error('Thẻ này chỉ dùng khi đang trả lời câu hỏi.');

  const myHorse = actor.horses.find((h) => h.memberId === s.actingMemberId)!;
  let target: PlayerState | null = null;
  if (def.target === 'enemy') {
    target = targetId ? s.players[targetId] ?? null : null;
    if (!target || target.teamId === actor.teamId) throw new Error('Hãy chọn một đội đối thủ.');
    if (card.kind === 'stun' && target.stunned) throw new Error('Đội này đã bị mất lượt rồi.');
    if (card.kind === 'barricade' && target.cap !== null) throw new Error('Đội này đã bị Thuế Khóa rồi.');
    if (card.kind === 'push-back' && !mostAdvancedOnRing(target)) throw new Error('Đội này không có ngựa nào đang trên vòng đua.');
    if (card.kind === 'swap') {
      const theirs = mostAdvancedOnRing(target);
      if (!onRing(myHorse) || !theirs) throw new Error('Hoán đổi cần ngựa của bạn và một ngựa đối thủ đều đang trên vòng đua.');
    }
    if (card.kind === 'steal' && !target.hand.length) throw new Error('Đội này chưa có thẻ nào để lấy.');
  }

  actor.hand = actor.hand.filter((c) => c.id !== cardId);
  s.skillDiscard.push(card);
  if (def.timing === 'roll') s.skillUsed = true;
  const blocked = !!target && hostile(s, now, target, def.name);
  s.lastSkill = { id: (s.lastSkill?.id ?? 0) + 1, kind: card.kind, teamId: actor.teamId, targetId: target?.teamId, blocked };
  log(s, now, 'skill', `dùng “${def.name}”`, actor.teamId, target?.teamId);
  if (blocked) return;

  switch (card.kind) {
    case 'stun': target!.stunned = true; break;
    case 'barricade': target!.cap = BARRICADE_CAP; break;
    case 'push-back': { const h = mostAdvancedOnRing(target!)!; h.progress = Math.max(1, h.progress - PUSHBACK); break; }
    case 'swap': {
      const theirs = mostAdvancedOnRing(target!)!;
      const mine = ringCell(actor.seat, myHorse.progress)!;
      const other = ringCell(target!.seat, theirs.progress)!;
      myHorse.progress = progressAt(actor.seat, other);
      theirs.progress = progressAt(target!.seat, mine);
      break;
    }
    case 'steal': {
      const stolen = target!.hand.splice(Math.floor(rng() * target!.hand.length), 1)[0];
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
      resolveTurn(s, now, rng, bank, index);
      break;
    }
    case 'play-skill':
      playSkill(s, action.cardId, action.targetId, now, rng);
      break;
    default:
      throw new Error('Lệnh không hợp lệ.');
  }
  return s;
}

/** Applies timeouts: an idle roll auto-rolls, an unanswered question counts as a miss. */
export function tick(state: GameState, now: number, rng: Rng, bank: Question[]): GameState {
  if (state.phase === 'finished' || state.paused || state.deadline === null || now < state.deadline) return state;
  const s = structuredClone(state);
  if (s.phase === 'roll') {
    log(s, now, 'timeout', 'chậm đổ xúc xắc nên hệ thống đổ thay.', s.turnTeamId);
    rollDice(s, now, rng, bank);
  } else if (s.phase === 'question') resolveTurn(s, now, rng, bank, null);
  return s;
}

export function pauseGame(state: GameState, now: number): GameState {
  if (state.phase === 'finished' || state.paused) return state;
  const s = structuredClone(state);
  s.paused = true;
  s.pausedRemaining = s.deadline === null ? null : Math.max(0, s.deadline - now);
  s.deadline = null;
  log(s, now, 'pause', 'Ván đấu tạm dừng.');
  return s;
}

export function resumeGame(state: GameState, now: number): GameState {
  if (!state.paused) return state;
  const s = structuredClone(state);
  s.paused = false;
  s.deadline = s.pausedRemaining === null ? null : now + s.pausedRemaining;
  s.pausedRemaining = null;
  log(s, now, 'resume', 'Ván đấu tiếp tục.');
  return s;
}

export function endGame(state: GameState, now: number): GameState {
  if (state.phase === 'finished') return state;
  const s = structuredClone(state);
  finishGame(s, now, null, 'host');
  return s;
}
