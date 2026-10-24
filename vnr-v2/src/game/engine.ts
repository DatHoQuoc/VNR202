import { SKILLS, skillByKind } from './skills.ts';
import type {
  GameAction, GameEvent, GameState, PlayerState, Question, Resolution, SkillCard, SkillKind
} from './types.ts';

export type Rng = () => number;

/** The track: a shared ring of 24 cells (4 per seat), then a private home lane. */
export const RING_SIZE = 24;
export const SEAT_GAP = 4;
export const RING_MAX = 23;
export const HOME_LANE = 4;
export const FINISH = RING_MAX + HOME_LANE + 1;
export const KNOCKBACK = 3;
export const PUSHBACK = 4;
export const HAND_MAX = 5;
export const BOOST_STEPS = 3;
export const BARRICADE_CAP = 2;
export const DEFAULT_ROLL_MS = 25_000;
export const DEFAULT_QUESTION_MS = 30_000;

export const MILESTONES = [
  '1858 – Pháp nổ súng tấn công Đà Nẵng, mở đầu cuộc xâm lược Việt Nam.',
  '1911 – Nguyễn Tất Thành ra đi tìm đường cứu nước.',
  '1920 – Đại hội Tours: Nguyễn Ái Quốc tán thành Quốc tế III.',
  '1925 – Thành lập Hội Việt Nam Cách mạng Thanh niên ở Quảng Châu.',
  '1929 – Ba tổ chức cộng sản ra đời, đòi hỏi phải hợp nhất.'
];

export function ringCell(seat: number, progress: number): number | null {
  if (progress < 1 || progress > RING_MAX) return null;
  return (seat * SEAT_GAP + progress) % RING_SIZE;
}
export const isSafeCell = (cell: number): boolean => cell % SEAT_GAP === 0;
const onRing = (p: PlayerState): boolean => p.progress >= 1 && p.progress <= RING_MAX;

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

export interface GameOptions { rollMs?: number; questionMs?: number; finish?: number }

export function createGame(
  input: { id: string; seat: number }[], bank: Question[], now: number, rng: Rng, options: GameOptions = {}
): GameState {
  if (input.length < 2 || input.length > 6) throw new Error('Cần từ 2 đến 6 người chơi để bắt đầu.');
  // Seats are fixed board positions (slot 1-6), so turn order follows the slot number.
  const teams = [...input].sort((a, b) => a.seat - b.seat);
  const players: Record<string, PlayerState> = {};
  teams.forEach((t) => {
    players[t.id] = {
      teamId: t.id, seat: t.seat, progress: 0, hand: [], stunned: false, cap: null, boost: 0,
      doubleDice: false, shield: false, correct: 0, answered: 0
    };
  });
  const s: GameState = {
    phase: 'roll', deadline: null, paused: false, pausedRemaining: null,
    rollMs: options.rollMs ?? DEFAULT_ROLL_MS, questionMs: options.questionMs ?? DEFAULT_QUESTION_MS,
    finish: options.finish ?? FINISH,
    order: teams.map((t) => t.id), turnTeamId: teams[0].id, turnNumber: 1,
    players, skillDeck: [], skillDiscard: [], cardSeq: 0,
    questionDeck: shuffle(bank.map((q) => q.id), rng),
    skillUsed: false, dice: null, question: null, resolution: null,
    events: [], eventSeq: 0, milestones: Object.fromEntries(teams.map((t) => [t.id, 0])),
    winnerId: null, ranking: null, endedBy: null
  };
  buildSkillDeck(s, rng);
  s.deadline = now + s.rollMs;
  log(s, now, 'start', 'Cuộc đua về đích bắt đầu! Ai đưa ngựa về đích trước sẽ thắng.');
  return s;
}

function nextTurn(s: GameState, now: number): void {
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
  s.turnNumber += 1;
  s.phase = 'roll';
  s.skillUsed = false;
  s.dice = null;
  s.question = null;
  s.deadline = now + s.rollMs;
}

function rollDice(s: GameState, now: number, rng: Rng, bank: Question[]): void {
  const p = s.players[s.turnTeamId];
  const rolls = p.doubleDice ? [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)] : [1 + Math.floor(rng() * 6)];
  const dice = Math.max(...rolls);
  if (p.doubleDice) {
    p.doubleDice = false;
    log(s, now, 'roll', `đổ hai xúc xắc được ${rolls.join(' và ')}, lấy ${dice}.`, p.teamId);
  } else log(s, now, 'roll', `đổ được ${dice}.`, p.teamId);
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
    return s.players[b].progress - s.players[a].progress || s.players[b].correct - s.players[a].correct;
  });
  s.winnerId = winnerId ?? s.ranking[0];
  log(s, now, 'finish', by === 'finish' ? 'đã đưa ngựa về đích đầu tiên!' : 'dẫn đầu khi ván đấu kết thúc.', s.winnerId);
}

function resolveTurn(s: GameState, now: number, rng: Rng, bank: Question[], picked: number | null): void {
  const p = s.players[s.turnTeamId];
  const active = s.question!;
  const q = bank.find((item) => item.id === active.id)!;
  const outcome: Resolution['outcome'] = picked === null ? 'timeout' : picked === active.answerIndex ? 'correct' : 'wrong';
  p.answered += 1;

  const dice = s.dice ?? 0;
  const boost = p.boost;
  let steps = dice + boost;
  let capped = false;
  if (p.cap !== null && steps > p.cap) { steps = p.cap; capped = true; }
  p.boost = 0;
  p.cap = null;

  const from = p.progress;
  p.progress = Math.min(from + steps, s.finish);
  const knocked: string[] = [];
  const cell = ringCell(p.seat, p.progress);
  if (cell !== null && !isSafeCell(cell)) {
    for (const other of Object.values(s.players)) {
      if (other.teamId !== p.teamId && ringCell(other.seat, other.progress) === cell) {
        other.progress = Math.max(0, other.progress - KNOCKBACK);
        knocked.push(other.teamId);
      }
    }
  }

  let gained: SkillKind | null = null;
  if (outcome === 'correct') {
    p.correct += 1;
    const card = drawSkill(s, rng);
    p.hand.push(card);
    gained = card.kind;
    if (p.hand.length > HAND_MAX) s.skillDiscard.push(p.hand.shift()!);
  }

  const resolution: Resolution = {
    id: s.turnNumber, teamId: p.teamId, dice, steps, from, to: p.progress, picked, outcome,
    questionText: active.text, correctText: q.correct, explain: q.explain, ref: q.ref,
    gained, knocked, capped, boost
  };
  s.resolution = resolution;

  const verdict = outcome === 'correct' ? 'trả lời đúng' : outcome === 'wrong' ? 'trả lời sai' : 'hết giờ';
  log(s, now, 'move', `${verdict}, tiến ${steps} bước${capped ? ' (bị Thuế Khóa giới hạn)' : ''}.`, p.teamId);
  if (gained) log(s, now, 'card', `nhận thẻ “${skillByKind[gained].name}”.`, p.teamId);
  for (const id of knocked) log(s, now, 'knock', `bị húc lùi ${KNOCKBACK} bước.`, id);

  const m = Math.min(MILESTONES.length, Math.floor((p.progress / s.finish) * (MILESTONES.length + 1)));
  if (m > s.milestones[p.teamId] && p.progress < s.finish) {
    s.milestones[p.teamId] = m;
    log(s, now, 'milestone', `qua mốc lịch sử: ${MILESTONES[m - 1]}`, p.teamId);
  }

  s.question = null;
  s.dice = null;
  if (p.progress >= s.finish) { finishGame(s, now, p.teamId, 'finish'); return; }
  nextTurn(s, now);
}

function hostile(s: GameState, now: number, actor: PlayerState, target: PlayerState, name: string): boolean {
  if (target.shield) {
    target.shield = false;
    log(s, now, 'block', `dùng Khiên “Chủ Nghĩa Làm Cốt” chặn “${name}”.`, target.teamId, actor.teamId);
    return true;
  }
  return false;
}

function playSkill(s: GameState, actorId: string, cardId: string, targetId: string | undefined, now: number, rng: Rng): void {
  const actor = s.players[actorId];
  const card = actor.hand.find((c) => c.id === cardId);
  if (!card) throw new Error('Bạn không có thẻ này.');
  const def = skillByKind[card.kind];
  if (def.timing === 'roll') {
    if (s.phase !== 'roll') throw new Error('Thẻ này chỉ dùng trước khi đổ xúc xắc.');
    if (s.skillUsed) throw new Error('Mỗi lượt chỉ được dùng 1 thẻ trước khi đổ xúc xắc.');
  } else if (s.phase !== 'question' || !s.question) throw new Error('Thẻ này chỉ dùng khi đang trả lời câu hỏi.');

  let target: PlayerState | null = null;
  if (def.target === 'enemy') {
    target = targetId ? s.players[targetId] ?? null : null;
    if (!target || target.teamId === actorId) throw new Error('Hãy chọn một đội đối thủ.');
    if (card.kind === 'stun' && target.stunned) throw new Error('Đội này đã bị mất lượt rồi.');
    if (card.kind === 'barricade' && target.cap !== null) throw new Error('Đội này đã bị Thuế Khóa rồi.');
    if (card.kind === 'push-back' && !onRing(target)) throw new Error('Chỉ đẩy lùi được ngựa đang trên vòng đua.');
    if (card.kind === 'swap' && (!onRing(target) || !onRing(actor) || target.progress === actor.progress))
      throw new Error('Hoán đổi cần cả hai ngựa đang ở các ô khác nhau trên vòng đua.');
    if (card.kind === 'steal' && !target.hand.length) throw new Error('Đội này chưa có thẻ nào để lấy.');
  }

  actor.hand = actor.hand.filter((c) => c.id !== cardId);
  s.skillDiscard.push(card);
  if (def.timing === 'roll') s.skillUsed = true;
  log(s, now, 'skill', `dùng “${def.name}”`, actorId, target?.teamId);

  if (target && hostile(s, now, actor, target, def.name)) return;

  switch (card.kind) {
    case 'stun': target!.stunned = true; break;
    case 'barricade': target!.cap = BARRICADE_CAP; break;
    case 'push-back': target!.progress = Math.max(0, target!.progress - PUSHBACK); break;
    case 'swap': [actor.progress, target!.progress] = [target!.progress, actor.progress]; break;
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

export function applyAction(
  state: GameState, actorId: string, action: GameAction, now: number, rng: Rng, bank: Question[]
): GameState {
  if (state.phase === 'finished') throw new Error('Ván đấu đã kết thúc.');
  if (state.paused) throw new Error('Ván đấu đang tạm dừng.');
  if (actorId !== state.turnTeamId) throw new Error('Chưa đến lượt của đội bạn.');
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
      playSkill(s, actorId, action.cardId, action.targetId, now, rng);
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
