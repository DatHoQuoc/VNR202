import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyAction, createGame, endGame, FINISH, pauseGame, resumeGame, ringCell, tick, HAND_MAX, RING_MAX
} from '../src/game/engine.ts';
import { QUESTION_BANK } from '../src/game/questions.ts';
import { SKILLS } from '../src/game/skills.ts';
import type { GameState, SkillKind } from '../src/game/types.ts';

function seeded(seed = 7) {
  let a = seed;
  return () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; };
}
const teams = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, seat: i }));
const newGame = (n = 6, seed = 7) => createGame(teams(n), QUESTION_BANK, 1_000, seeded(seed));
const give = (s: GameState, id: string, kind: SkillKind, cardId = `x-${kind}`) => { s.players[id].hand.push({ id: cardId, kind }); return cardId; };
const correctIndex = (s: GameState) => s.question!.answerIndex;
const wrongIndex = (s: GameState) => [0, 1, 2, 3].find((i) => i !== s.question!.answerIndex)!;

test('question bank is well formed', () => {
  assert.ok(QUESTION_BANK.length >= 30);
  assert.equal(new Set(QUESTION_BANK.map((q) => q.id)).size, QUESTION_BANK.length);
  for (const q of QUESTION_BANK) {
    const all = [q.correct, ...q.wrong];
    assert.equal(new Set(all).size, 4, q.id);
    assert.ok(q.text && q.hint && q.explain && q.ref, q.id);
  }
});

test('seats are fixed board slots: gaps allowed, turn order follows slot number', () => {
  const s = createGame([{ id: 'c', seat: 5 }, { id: 'a', seat: 0 }, { id: 'b', seat: 2 }], QUESTION_BANK, 0, seeded());
  assert.deepEqual(s.order, ['a', 'b', 'c']);
  assert.deepEqual([s.players.a.seat, s.players.b.seat, s.players.c.seat], [0, 2, 5]);
  assert.equal(s.turnTeamId, 'a');
});

test('needs 2 to 6 teams', () => {
  assert.throws(() => newGame(1));
  assert.throws(() => createGame(teams(7), QUESTION_BANK, 0, seeded()));
  assert.equal(newGame(2).order.length, 2);
});

test('correct answer moves the horse and awards one skill card', () => {
  let s = newGame();
  s = applyAction(s, 't1', { type: 'roll' }, 2_000, seeded(1), QUESTION_BANK);
  assert.equal(s.phase, 'question');
  const dice = s.dice!;
  s = applyAction(s, 't1', { type: 'answer', index: correctIndex(s) }, 3_000, seeded(2), QUESTION_BANK);
  assert.equal(s.players.t1.progress, dice);
  assert.equal(s.players.t1.hand.length, 1);
  assert.equal(s.resolution?.outcome, 'correct');
  assert.equal(s.turnTeamId, 't2');
});

test('wrong answer or timeout still moves on but gives no card', () => {
  let s = newGame();
  s = applyAction(s, 't1', { type: 'roll' }, 2_000, seeded(1), QUESTION_BANK);
  const dice = s.dice!;
  s = applyAction(s, 't1', { type: 'answer', index: wrongIndex(s) }, 3_000, seeded(2), QUESTION_BANK);
  assert.equal(s.players.t1.progress, dice);
  assert.equal(s.players.t1.hand.length, 0);
  assert.equal(s.resolution?.outcome, 'wrong');
  s = applyAction(s, 't2', { type: 'roll' }, 4_000, seeded(3), QUESTION_BANK);
  const late = tick(s, 4_000 + s.questionMs + 1, seeded(4), QUESTION_BANK);
  assert.equal(late.resolution?.outcome, 'timeout');
  assert.equal(late.players.t2.hand.length, 0);
  assert.ok(late.players.t2.progress > 0);
  assert.equal(late.turnTeamId, 't3');
});

test('only the team whose turn it is can act', () => {
  const s = newGame();
  assert.throws(() => applyAction(s, 't2', { type: 'roll' }, 2_000, seeded(), QUESTION_BANK), /lượt/);
  assert.throws(() => applyAction(s, 't1', { type: 'answer', index: 0 }, 2_000, seeded(), QUESTION_BANK), /câu hỏi/);
});

test('idle roll auto-rolls when the timer runs out', () => {
  const s = newGame();
  assert.equal(tick(s, 1_000 + s.rollMs - 1, seeded(), QUESTION_BANK), s);
  const t = tick(s, 1_000 + s.rollMs + 1, seeded(), QUESTION_BANK);
  assert.equal(t.phase, 'question');
});

test('reaching the finish wins and ranks everybody', () => {
  let s = newGame();
  s.players.t1.progress = FINISH - 1;
  s.players.t3.progress = 10;
  s = applyAction(s, 't1', { type: 'roll' }, 2_000, seeded(1), QUESTION_BANK);
  s = applyAction(s, 't1', { type: 'answer', index: wrongIndex(s) }, 3_000, seeded(2), QUESTION_BANK);
  assert.equal(s.phase, 'finished');
  assert.equal(s.winnerId, 't1');
  assert.equal(s.players.t1.progress, FINISH);
  assert.deepEqual(s.ranking!.slice(0, 2), ['t1', 't3']);
  assert.throws(() => applyAction(s, 't2', { type: 'roll' }, 4_000, seeded(), QUESTION_BANK));
});

test('landing on an enemy knocks it back 3, but start cells are safe', () => {
  let s = newGame();
  // seat 0 progress 5 -> cell 5; seat 1 (start 4) progress 1 -> cell 5
  s.players.t2.progress = 1;
  s.players.t1.progress = 1;
  s = applyAction(s, 't1', { type: 'roll' }, 2_000, () => 0.5, QUESTION_BANK); // dice 4
  assert.equal(s.dice, 4);
  s = applyAction(s, 't1', { type: 'answer', index: wrongIndex(s) }, 3_000, seeded(2), QUESTION_BANK);
  assert.equal(s.players.t1.progress, 5);
  assert.equal(ringCell(0, 5), ringCell(1, 1));
  assert.deepEqual(s.resolution?.knocked, ['t2']);
  assert.equal(s.players.t2.progress, 0);

  // Cell 4 is team 2's start cell: landing there never knocks anybody back.
  let safe = newGame();
  safe.players.t2.progress = 0;
  safe = applyAction(safe, 't1', { type: 'roll' }, 2_000, () => 0.6, QUESTION_BANK); // dice 4
  safe = applyAction(safe, 't1', { type: 'answer', index: wrongIndex(safe) }, 3_000, seeded(2), QUESTION_BANK);
  assert.equal(ringCell(0, 4), 4);
  assert.deepEqual(safe.resolution?.knocked, []);
});

test('skills: stun makes the target lose its next turn', () => {
  let s = newGame();
  const c = give(s, 't1', 'stun');
  s = applyAction(s, 't1', { type: 'play-skill', cardId: c, targetId: 't2' }, 2_000, seeded(), QUESTION_BANK);
  assert.equal(s.players.t2.stunned, true);
  assert.throws(() => applyAction(s, 't1', { type: 'play-skill', cardId: give(s, 't1', 'stun', 'y'), targetId: 't3' }, 2_100, seeded(), QUESTION_BANK), /1 thẻ/);
  s = applyAction(s, 't1', { type: 'roll' }, 2_200, seeded(1), QUESTION_BANK);
  s = applyAction(s, 't1', { type: 'answer', index: wrongIndex(s) }, 2_300, seeded(2), QUESTION_BANK);
  assert.equal(s.turnTeamId, 't3');
  assert.equal(s.players.t2.stunned, false);
});

test('skills: barricade caps the next move, boost adds 3', () => {
  let s = newGame();
  s.players.t2.cap = 2;
  s.players.t1.boost = 3;
  s = applyAction(s, 't1', { type: 'roll' }, 2_000, () => 0.99, QUESTION_BANK); // dice 6
  s = applyAction(s, 't1', { type: 'answer', index: wrongIndex(s) }, 2_100, seeded(2), QUESTION_BANK);
  assert.equal(s.players.t1.progress, 9);
  s = applyAction(s, 't2', { type: 'roll' }, 2_200, () => 0.99, QUESTION_BANK);
  s = applyAction(s, 't2', { type: 'answer', index: wrongIndex(s) }, 2_300, seeded(2), QUESTION_BANK);
  assert.equal(s.players.t2.progress, 2);
  assert.equal(s.resolution?.capped, true);
  assert.equal(s.players.t2.cap, null);
});

test('skills: push-back, swap and steal obey their conditions', () => {
  let s = newGame();
  s.players.t2.progress = 10;
  s.players.t3.progress = RING_MAX + 2;
  s.players.t1.progress = 3;
  const pb = give(s, 't1', 'push-back');
  assert.throws(() => applyAction(s, 't1', { type: 'play-skill', cardId: pb, targetId: 't3' }, 2_000, seeded(), QUESTION_BANK), /vòng đua/);
  assert.throws(() => applyAction(s, 't1', { type: 'play-skill', cardId: pb }, 2_000, seeded(), QUESTION_BANK), /đối thủ/);
  assert.throws(() => applyAction(s, 't1', { type: 'play-skill', cardId: pb, targetId: 't1' }, 2_000, seeded(), QUESTION_BANK), /đối thủ/);
  s = applyAction(s, 't1', { type: 'play-skill', cardId: pb, targetId: 't2' }, 2_000, seeded(), QUESTION_BANK);
  assert.equal(s.players.t2.progress, 6);

  let w = newGame();
  w.players.t1.progress = 2; w.players.t2.progress = 15;
  const sw = give(w, 't1', 'swap');
  w = applyAction(w, 't1', { type: 'play-skill', cardId: sw, targetId: 't2' }, 2_000, seeded(), QUESTION_BANK);
  assert.deepEqual([w.players.t1.progress, w.players.t2.progress], [15, 2]);

  let t = newGame();
  const st = give(t, 't1', 'steal');
  assert.throws(() => applyAction(t, 't1', { type: 'play-skill', cardId: st, targetId: 't2' }, 2_000, seeded(), QUESTION_BANK), /chưa có thẻ/);
  give(t, 't2', 'shield', 'victim');
  t = applyAction(t, 't1', { type: 'play-skill', cardId: st, targetId: 't2' }, 2_000, seeded(), QUESTION_BANK);
  assert.equal(t.players.t2.hand.length, 0);
  assert.deepEqual(t.players.t1.hand.map((c) => c.id), ['victim']);
});

test('shield blocks exactly one hostile skill', () => {
  let s = newGame();
  s.players.t2.shield = true;
  const a = give(s, 't1', 'stun', 'a');
  s = applyAction(s, 't1', { type: 'play-skill', cardId: a, targetId: 't2' }, 2_000, seeded(), QUESTION_BANK);
  assert.equal(s.players.t2.stunned, false);
  assert.equal(s.players.t2.shield, false);
  assert.ok(s.events.some((e) => e.type === 'block'));
});

test('question skills: hint and fifty only work during a question', () => {
  let s = newGame();
  const h = give(s, 't1', 'hint', 'h');
  const f = give(s, 't1', 'fifty', 'f');
  assert.throws(() => applyAction(s, 't1', { type: 'play-skill', cardId: h }, 2_000, seeded(), QUESTION_BANK), /câu hỏi/);
  s = applyAction(s, 't1', { type: 'roll' }, 2_000, seeded(1), QUESTION_BANK);
  s = applyAction(s, 't1', { type: 'play-skill', cardId: h }, 2_100, seeded(), QUESTION_BANK);
  assert.equal(s.question!.hintShown, true);
  s = applyAction(s, 't1', { type: 'play-skill', cardId: f }, 2_200, seeded(), QUESTION_BANK);
  assert.equal(s.question!.removed.length, 2);
  assert.ok(!s.question!.removed.includes(s.question!.answerIndex));
  assert.throws(() => applyAction(s, 't1', { type: 'answer', index: s.question!.removed[0] }, 2_300, seeded(), QUESTION_BANK), /không hợp lệ/);
});

test('double-dice takes the better of two rolls', () => {
  let s = newGame();
  s.players.t1.doubleDice = true;
  let n = 0;
  const seq = [0.0, 0.99, 0.3, 0.3, 0.3, 0.3];
  s = applyAction(s, 't1', { type: 'roll' }, 2_000, () => seq[n++ % seq.length], QUESTION_BANK);
  assert.equal(s.dice, 6);
  assert.equal(s.players.t1.doubleDice, false);
});

test('hand is capped and the deck never runs dry', () => {
  let s = newGame(2);
  for (let i = 0; i < 40; i++) {
    const id = s.turnTeamId;
    s = applyAction(s, id, { type: 'roll' }, 2_000 + i * 10, seeded(i), QUESTION_BANK);
    s.players[id].progress = Math.min(s.players[id].progress, 10);
    s = applyAction(s, id, { type: 'answer', index: correctIndex(s) }, 2_005 + i * 10, seeded(i + 100), QUESTION_BANK);
    if (s.phase === 'finished') break;
    assert.ok(s.players[id].hand.length <= HAND_MAX);
  }
  const total = SKILLS.reduce((a, d) => a + d.copies, 0);
  assert.ok(total >= 20);
});

test('pause freezes the clock; host can end the game', () => {
  const s = newGame();
  const p = pauseGame(s, 1_000 + 5_000);
  assert.equal(p.paused, true);
  assert.equal(tick(p, 10_000_000, seeded(), QUESTION_BANK), p);
  assert.throws(() => applyAction(p, 't1', { type: 'roll' }, 2_000, seeded(), QUESTION_BANK), /tạm dừng/);
  const r = resumeGame(p, 50_000);
  assert.equal(r.deadline, 50_000 + (s.deadline! - 6_000));
  const e = endGame(r, 60_000);
  assert.equal(e.phase, 'finished');
  assert.equal(e.endedBy, 'host');
});

test('a full random 6-team game always finishes with a winner', () => {
  const rng = seeded(99);
  let s = createGame(teams(6), QUESTION_BANK, 0, rng);
  let now = 0;
  for (let i = 0; i < 2000 && s.phase !== 'finished'; i++) {
    now += 1000;
    const id = s.turnTeamId;
    const p = s.players[id];
    const roll = p.hand.find((c) => ['stun', 'barricade', 'boost', 'shield'].includes(c.kind));
    if (roll && !s.skillUsed && s.phase === 'roll') {
      const enemy = s.order.find((t) => t !== id)!;
      try { s = applyAction(s, id, { type: 'play-skill', cardId: roll.id, targetId: enemy }, now, rng, QUESTION_BANK); } catch { /* invalid combo, skip */ }
    }
    s = applyAction(s, id, { type: 'roll' }, now, rng, QUESTION_BANK);
    s = applyAction(s, id, { type: 'answer', index: rng() < 0.6 ? correctIndex(s) : wrongIndex(s) }, now, rng, QUESTION_BANK);
  }
  assert.equal(s.phase, 'finished');
  assert.ok(s.winnerId);
  assert.equal(s.players[s.winnerId!].progress, FINISH);
});
