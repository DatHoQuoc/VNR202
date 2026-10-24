import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyAction, createGame, endGame, FINISH, HAND_MAX, isSafeCell, MAX_STREAK, pauseGame, progressAt, resumeGame, RING_MAX, ringCell, tick
} from '../src/game/engine.ts';
import type { TeamInput } from '../src/game/engine.ts';
import { QUESTION_BANK } from '../src/game/questions.ts';
import type { GameState, SkillKind } from '../src/game/types.ts';

function seeded(seed = 7) {
  let a = seed;
  return () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; };
}
const teams = (n: number, per = 1): TeamInput[] => Array.from({ length: n }, (_, i) => ({
  id: `t${i + 1}`, seat: i, members: Array.from({ length: per }, (_, j) => ({ id: `t${i + 1}m${j + 1}`, name: `T${i + 1}-${j + 1}` }))
}));
const newGame = (n = 6, per = 1, opts = {}) => createGame(teams(n, per), QUESTION_BANK, 1_000, seeded(), opts);
const give = (s: GameState, id: string, kind: SkillKind, cardId = `x-${kind}`) => { s.players[id].hand.push({ id: cardId, kind }); return cardId; };
const horseOf = (s: GameState, team: string, member = 1) => s.players[team].horses.find((h) => h.memberId === `${team}m${member}`)!;
const correctIndex = (s: GameState) => s.question!.answerIndex;
const wrongIndex = (s: GameState) => [0, 1, 2, 3].find((i) => i !== s.question!.answerIndex)!;
/** Rolls `dice` for whoever is acting and answers; returns the new state. */
function play(s: GameState, dice: number, right = false, now = 2_000): GameState {
  const who = s.actingMemberId;
  s = applyAction(s, who, { type: 'roll' }, now, () => (dice - 0.5) / 6, QUESTION_BANK);
  assert.equal(s.dice, dice);
  return applyAction(s, who, { type: 'answer', index: right ? correctIndex(s) : wrongIndex(s) }, now + 1, seeded(3), QUESTION_BANK);
}

test('question bank is well formed', () => {
  assert.ok(QUESTION_BANK.length >= 30);
  assert.equal(new Set(QUESTION_BANK.map((q) => q.id)).size, QUESTION_BANK.length);
  for (const q of QUESTION_BANK) {
    assert.equal(new Set([q.correct, ...q.wrong]).size, 4, q.id);
    assert.ok(q.text && q.hint && q.explain && q.ref, q.id);
  }
});

test('geometry: starts are safe star cells, every cell is reachable, swap math round-trips', () => {
  for (let seat = 0; seat < 6; seat++) {
    const start = ringCell(seat, 1)!;
    assert.ok(isSafeCell(start));
    assert.equal(ringCell(seat, RING_MAX), (start + 41) % 42);
    for (let p = 1; p <= RING_MAX; p++) assert.equal(progressAt(seat, ringCell(seat, p)!), p);
  }
  assert.equal(new Set([0, 1, 2, 3, 4, 5].map((s) => ringCell(s, 1))).size, 6);
});

test('2 to 6 teams, empty teams ignored, seats are fixed slots', () => {
  assert.throws(() => newGame(1));
  assert.throws(() => createGame(teams(7), QUESTION_BANK, 0, seeded()));
  const s = createGame([{ id: 'c', seat: 5, members: [{ id: 'c1', name: 'C' }] }, { id: 'a', seat: 0, members: [{ id: 'a1', name: 'A' }] }, { id: 'b', seat: 2, members: [{ id: 'b1', name: 'B' }] }, { id: 'z', seat: 3, members: [] }], QUESTION_BANK, 0, seeded());
  assert.deepEqual(s.order, ['a', 'b', 'c']);
  assert.equal(s.players.c.seat, 5);
  assert.equal(s.turnTeamId, 'a');
});

test('each member owns one horse and members take turns inside the team', () => {
  let s = newGame(2, 3);
  assert.equal(s.players.t1.horses.length, 3);
  assert.equal(s.actingMemberId, 't1m1');
  s = play(s, 2);                      // t1m1 cannot leave the stable with a 2
  assert.equal(s.turnTeamId, 't2');
  s = play(s, 2);
  assert.equal(s.turnTeamId, 't1');
  assert.equal(s.actingMemberId, 't1m2');
  assert.throws(() => applyAction(s, 't1m1', { type: 'roll' }, 3_000, seeded(), QUESTION_BANK), /lượt/);
});

test('a horse needs a 1 or a 6 to leave the stable (6 only if configured)', () => {
  let s = newGame(2);
  s = play(s, 3);
  assert.equal(horseOf(s, 't1').progress, 0);
  assert.equal(s.resolution?.exited, false);
  let t = newGame(2);
  t = play(t, 1);
  assert.equal(horseOf(t, 't1').progress, 1);
  assert.equal(t.resolution?.exited, true);
  let six = newGame(2, 1, { exitRolls: [6] });
  six = play(six, 1);
  assert.equal(horseOf(six, 't1').progress, 0);
});

test('correct answer gives a skill card; wrong or timeout does not, but the horse still moves', () => {
  let s = newGame(2);
  horseOf(s, 't1').progress = 5;
  s = play(s, 3, true);
  assert.equal(horseOf(s, 't1').progress, 8);
  assert.equal(s.players.t1.hand.length, 1);
  assert.equal(s.resolution?.outcome, 'correct');
  s = play(s, 2, false);
  assert.equal(s.players.t2.hand.length, 0);
  let u = newGame(2);
  horseOf(u, 't1').progress = 5;
  u = applyAction(u, 't1m1', { type: 'roll' }, 2_000, () => 0.4, QUESTION_BANK);
  const late = tick(u, 2_000 + u.questionMs + 1, seeded(), QUESTION_BANK);
  assert.equal(late.resolution?.outcome, 'timeout');
  assert.equal(late.players.t1.hand.length, 0);
  assert.ok(horseOf(late, 't1').progress > 5);
});

test('a six gives a bonus roll to the same member, at most MAX_STREAK times', () => {
  let s = newGame(2, 2);
  horseOf(s, 't1').progress = 4;
  s = play(s, 6);
  assert.equal(s.turnTeamId, 't1');
  assert.equal(s.actingMemberId, 't1m1');
  assert.equal(s.streak, 1);
  for (let i = 1; i < MAX_STREAK; i++) s = play(s, 6);
  assert.equal(s.turnTeamId, 't1');
  s = play(s, 6);
  assert.equal(s.turnTeamId, 't2');
  assert.equal(s.streak, 0);
});

test('landing on a rival kicks it back to the stable and earns a bonus roll; start cells are safe', () => {
  let s = newGame(6);
  horseOf(s, 't1').progress = 5;
  horseOf(s, 't2').progress = progressAt(1, ringCell(0, 9)!);
  s = play(s, 4);
  assert.equal(horseOf(s, 't1').progress, 9);
  assert.equal(horseOf(s, 't2').progress, 0);
  assert.deepEqual(s.resolution?.kicked.map((k) => k.teamId), ['t2']);
  assert.equal(s.turnTeamId, 't1');            // bonus roll

  // Team 3's start cell is safe: team 1 can land on it without kicking.
  let safe = newGame(6);
  horseOf(safe, 't1').progress = progressAt(0, 14);
  horseOf(safe, 't3').progress = 1;
  assert.equal(ringCell(2, 1), 17);
  safe = play(safe, 3);
  assert.equal(ringCell(0, horseOf(safe, 't1').progress), 17);
  assert.equal(horseOf(safe, 't3').progress, 1);
  assert.deepEqual(safe.resolution?.kicked, []);
});

test('own horses may share a cell', () => {
  let s = newGame(2, 2);
  horseOf(s, 't1', 1).progress = 5;
  horseOf(s, 't1', 2).progress = 8;
  s = play(s, 3);
  assert.equal(horseOf(s, 't1', 1).progress, 8);
  assert.equal(horseOf(s, 't1', 2).progress, 8);
  assert.equal(s.resolution?.kicked.length, 0);
});

test('the home lane is private and reaching FINISH wins with winHome = 1', () => {
  let s = newGame(2);
  horseOf(s, 't1').progress = FINISH - 2;
  s = play(s, 5);
  assert.equal(s.phase, 'finished');
  assert.equal(s.winnerId, 't1');
  assert.equal(horseOf(s, 't1').progress, FINISH);
  assert.throws(() => applyAction(s, 't2m1', { type: 'roll' }, 4_000, seeded(), QUESTION_BANK));
});

test('winHome = 2 needs two horses home; the next member with an unfinished horse acts', () => {
  let s = newGame(2, 2, { winHome: 2 });
  horseOf(s, 't1', 1).progress = FINISH - 1;
  s = play(s, 1);
  assert.equal(s.phase, 'roll');
  assert.equal(s.resolution?.bonus, true);
  assert.equal(s.turnTeamId, 't1');
  s = play(s, 2);                               // bonus roll by the same member whose horse is home: nothing to move
  s = play(s, 2);
  assert.equal(s.turnTeamId === 't2' || s.actingMemberId !== 't1m1', true);
  horseOf(s, 't1', 2).progress = FINISH - 1;
  let g = s;
  for (let i = 0; i < 8 && g.phase !== 'finished'; i++) { if (g.turnTeamId === 't1' && g.actingMemberId === 't1m2') g = play(g, 1); else g = play(g, 2); }
  assert.equal(g.winnerId, 't1');
});

test('skills: stun makes a team lose its next turn; only one pre-roll card per turn', () => {
  let s = newGame(3);
  const a = give(s, 't1', 'stun', 'a');
  const b = give(s, 't1', 'stun', 'b');
  s = applyAction(s, 't1m1', { type: 'play-skill', cardId: a, targetId: 't2' }, 2_000, seeded(), QUESTION_BANK);
  assert.equal(s.players.t2.stunned, true);
  assert.throws(() => applyAction(s, 't1m1', { type: 'play-skill', cardId: b, targetId: 't3' }, 2_100, seeded(), QUESTION_BANK), /1 thẻ/);
  s = play(s, 2);
  assert.equal(s.turnTeamId, 't3');
  assert.equal(s.players.t2.stunned, false);
});

test('skills: barricade caps the next move; boost adds 3', () => {
  let s = newGame(2);
  horseOf(s, 't1').progress = 3; horseOf(s, 't2').progress = 3;
  s.players.t2.cap = 2;
  s.players.t1.boost = 3;
  s = play(s, 2);
  assert.equal(horseOf(s, 't1').progress, 8);
  s = play(s, 6);
  assert.equal(horseOf(s, 't2').progress, 5);
  assert.equal(s.resolution?.capped, true);
  assert.equal(s.players.t2.cap, null);
});

test('skills: push-back, swap and steal obey their conditions', () => {
  let s = newGame(3);
  horseOf(s, 't2').progress = 10;
  const pb = give(s, 't1', 'push-back');
  assert.throws(() => applyAction(s, 't1m1', { type: 'play-skill', cardId: pb, targetId: 't3' }, 2_000, seeded(), QUESTION_BANK), /vòng đua/);
  assert.throws(() => applyAction(s, 't1m1', { type: 'play-skill', cardId: pb, targetId: 't1' }, 2_000, seeded(), QUESTION_BANK), /đối thủ/);
  s = applyAction(s, 't1m1', { type: 'play-skill', cardId: pb, targetId: 't2' }, 2_000, seeded(), QUESTION_BANK);
  assert.equal(horseOf(s, 't2').progress, 6);

  let w = newGame(2);
  horseOf(w, 't1').progress = 2; horseOf(w, 't2').progress = 15;
  const cellMine = ringCell(0, 2), cellTheirs = ringCell(1, 15);
  const sw = give(w, 't1', 'swap');
  w = applyAction(w, 't1m1', { type: 'play-skill', cardId: sw, targetId: 't2' }, 2_000, seeded(), QUESTION_BANK);
  assert.equal(ringCell(0, horseOf(w, 't1').progress), cellTheirs);
  assert.equal(ringCell(1, horseOf(w, 't2').progress), cellMine);

  let t = newGame(2);
  const st = give(t, 't1', 'steal');
  assert.throws(() => applyAction(t, 't1m1', { type: 'play-skill', cardId: st, targetId: 't2' }, 2_000, seeded(), QUESTION_BANK), /chưa có thẻ/);
  give(t, 't2', 'shield', 'victim');
  t = applyAction(t, 't1m1', { type: 'play-skill', cardId: st, targetId: 't2' }, 2_000, seeded(), QUESTION_BANK);
  assert.equal(t.players.t2.hand.length, 0);
  assert.deepEqual(t.players.t1.hand.map((c) => c.id), ['victim']);
  assert.equal(t.lastSkill?.kind, 'steal');
});

test('shield blocks exactly one hostile skill', () => {
  let s = newGame(2);
  s.players.t2.shield = true;
  const a = give(s, 't1', 'stun', 'a');
  s = applyAction(s, 't1m1', { type: 'play-skill', cardId: a, targetId: 't2' }, 2_000, seeded(), QUESTION_BANK);
  assert.equal(s.players.t2.stunned, false);
  assert.equal(s.players.t2.shield, false);
  assert.equal(s.lastSkill?.blocked, true);
});

test('question skills: hint and fifty only work during a question', () => {
  let s = newGame(2);
  const h = give(s, 't1', 'hint', 'h');
  const f = give(s, 't1', 'fifty', 'f');
  assert.throws(() => applyAction(s, 't1m1', { type: 'play-skill', cardId: h }, 2_000, seeded(), QUESTION_BANK), /câu hỏi/);
  s = applyAction(s, 't1m1', { type: 'roll' }, 2_000, seeded(1), QUESTION_BANK);
  s = applyAction(s, 't1m1', { type: 'play-skill', cardId: h }, 2_100, seeded(), QUESTION_BANK);
  assert.equal(s.question!.hintShown, true);
  s = applyAction(s, 't1m1', { type: 'play-skill', cardId: f }, 2_200, seeded(), QUESTION_BANK);
  assert.equal(s.question!.removed.length, 2);
  assert.ok(!s.question!.removed.includes(s.question!.answerIndex));
  assert.throws(() => applyAction(s, 't1m1', { type: 'answer', index: s.question!.removed[0] }, 2_300, seeded(), QUESTION_BANK), /không hợp lệ/);
});

test('double-dice takes the better of two rolls; hand is capped', () => {
  let s = newGame(2);
  s.players.t1.doubleDice = true;
  let n = 0;
  const seq = [0.0, 0.99];
  s = applyAction(s, 't1m1', { type: 'roll' }, 2_000, () => seq[n++ % 2], QUESTION_BANK);
  assert.equal(s.dice, 6);
  assert.equal(s.players.t1.doubleDice, false);
  let h = newGame(2);
  for (let i = 0; i < HAND_MAX; i++) give(h, 't1', 'hint', `c${i}`);
  horseOf(h, 't1').progress = 3;
  h = play(h, 2, true);
  assert.ok(h.players.t1.hand.length <= HAND_MAX);
});

test('pause freezes the clock; host can end the game with the leader winning', () => {
  const s = newGame(2);
  const p = pauseGame(s, 1_000 + 5_000);
  assert.equal(tick(p, 10_000_000, seeded(), QUESTION_BANK), p);
  assert.throws(() => applyAction(p, 't1m1', { type: 'roll' }, 2_000, seeded(), QUESTION_BANK), /tạm dừng/);
  const r = resumeGame(p, 50_000);
  assert.equal(r.deadline, 50_000 + (s.deadline! - 6_000));
  horseOf(r, 't2').progress = 9;
  const e = endGame(r, 60_000);
  assert.equal(e.phase, 'finished');
  assert.equal(e.endedBy, 'host');
  assert.equal(e.winnerId, 't2');
});

test('random 6-team games with 1-6 members each always finish with a winner', () => {
  for (const seed of [1, 2, 3]) {
    const rng = seeded(seed * 17);
    const inputs = teams(6, 1).map((t, i) => ({ ...t, members: teams(1, 1 + ((i + seed) % 6))[0].members.map((m, j) => ({ id: `${t.id}m${j + 1}`, name: `${t.id}-${j}` })) }));
    let s = createGame(inputs, QUESTION_BANK, 0, rng, { winHome: 1 });
    let now = 0;
    for (let i = 0; i < 4000 && s.phase !== 'finished'; i++) {
      now += 1000;
      const id = s.turnTeamId;
      const card = s.players[id].hand.find((c) => ['stun', 'barricade', 'boost', 'shield', 'push-back'].includes(c.kind));
      if (card && s.phase === 'roll' && !s.skillUsed) {
        const enemy = s.order.find((t) => t !== id)!;
        try { s = applyAction(s, s.actingMemberId, { type: 'play-skill', cardId: card.id, targetId: enemy }, now, rng, QUESTION_BANK); } catch { /* invalid target, skip */ }
      }
      s = applyAction(s, s.actingMemberId, { type: 'roll' }, now, rng, QUESTION_BANK);
      s = applyAction(s, s.actingMemberId, { type: 'answer', index: rng() < 0.6 ? correctIndex(s) : wrongIndex(s) }, now, rng, QUESTION_BANK);
    }
    assert.equal(s.phase, 'finished', `seed ${seed}`);
    assert.ok(s.players[s.winnerId!].horses.some((h) => h.progress === FINISH));
  }
});
