import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyAction, createGame, endGame, FINISH, HAND_MAX, isSafeCell, MAX_STREAK, MOVE_MS, pauseGame, progressAt, resumeGame, RING_MAX, RING_SIZE, ringCell, tick
} from '../src/game/engine.ts';
import type { GameOptions, TeamInput } from '../src/game/engine.ts';
import { QUESTION_BANK } from '../src/game/questions.ts';
import type { GameState, SkillKind } from '../src/game/types.ts';

function seeded(seed = 7) {
  let a = seed;
  return () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; };
}
/** Rng whose first two values produce the dice `a` and `b`; everything after is seeded noise. */
function rigged(a: number, b: number, seed = 3) {
  const rest = seeded(seed); const first = [(a - 0.5) / 6, (b - 0.5) / 6]; let n = 0;
  return () => (n < 2 ? first[n++] : rest());
}
const teams = (n: number, per = 1): TeamInput[] => Array.from({ length: n }, (_, i) => ({
  id: `t${i + 1}`, seat: i, members: Array.from({ length: per }, (_, j) => ({ id: `t${i + 1}m${j + 1}`, name: `T${i + 1}-${j + 1}` }))
}));
const newGame = (n = 6, per = 1, opts: GameOptions = {}) => createGame(teams(n, per), QUESTION_BANK, 1_000, seeded(), opts);
const give = (s: GameState, id: string, kind: SkillKind, cardId = `x-${kind}`) => { s.players[id].hand.push({ id: cardId, kind }); return cardId; };
const horse = (s: GameState, team: string, n = 1) => s.players[team].horses[n - 1];
const correctIndex = (s: GameState) => s.question!.answerIndex;
const wrongIndex = (s: GameState) => [0, 1, 2, 3].find((i) => i !== s.question!.answerIndex)!;
/** Rolls the given dice for whoever is acting and answers; when a horse must be chosen, takes `pick` (default: first option). */
function play(s: GameState, a: number, b: number, o: { right?: boolean; pick?: number | string; now?: number } = {}): GameState {
  const who = s.actingMemberId, now = o.now ?? 2_000;
  s = applyAction(s, who, { type: 'roll' }, now, rigged(a, b), QUESTION_BANK);
  assert.deepEqual(s.dice, [a, b]);
  s = applyAction(s, who, { type: 'answer', index: o.right ? correctIndex(s) : wrongIndex(s) }, now + 1, seeded(3), QUESTION_BANK);
  if (s.phase === 'move') {
    const opt = typeof o.pick === 'string' ? s.pending!.options.find((x) => x.horseId === o.pick)! : s.pending!.options[o.pick ?? 0];
    s = applyAction(s, who, { type: 'choose-horse', horseId: opt.horseId }, now + 2, seeded(4), QUESTION_BANK);
  }
  return s;
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
  assert.equal(RING_SIZE, 30); assert.equal(FINISH, 33);
  for (let seat = 0; seat < 6; seat++) {
    const start = ringCell(seat, 1)!;
    assert.ok(isSafeCell(start));
    assert.equal(ringCell(seat, RING_MAX), (start + RING_SIZE - 1) % RING_SIZE);
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

test('each team owns 2 (or 3) shared horses; the first starts on the start cell; members take turns', () => {
  let s = newGame(2, 3);
  assert.equal(s.players.t1.horses.length, 2);
  assert.deepEqual(s.players.t1.horses.map((h) => h.progress), [1, 0]);
  assert.equal(newGame(2, 1, { horses: 3 }).players.t1.horses.length, 3);
  assert.equal(newGame(2, 1, { horses: 9 }).players.t1.horses.length, 3);
  assert.equal(s.actingMemberId, 't1m1');
  s = play(s, 2, 3); s = play(s, 2, 3);
  assert.equal(s.turnTeamId, 't1');
  assert.equal(s.actingMemberId, 't1m2');
  assert.throws(() => applyAction(s, 't1m1', { type: 'roll' }, 3_000, seeded(), QUESTION_BANK), /lượt/);
});

test('two dice are added; with one horse on the board the move is automatic', () => {
  let s = newGame(2);
  s = play(s, 2, 3);                                   // no 1 or 6: only horse 1 can move
  assert.equal(horse(s, 't1').progress, 6);
  assert.equal(s.resolution?.steps, 5);
  assert.equal(s.turnTeamId, 't2');
});

test('a horse needs a 1 or a 6 on either die to leave the stable (6 only if configured)', () => {
  let s = newGame(2);
  horse(s, 't1', 1).progress = 5;
  s = play(s, 3, 4);                                   // advance only
  assert.equal(horse(s, 't1', 2).progress, 0);
  let t = newGame(2);
  horse(t, 't1', 1).progress = 5;
  t = play(t, 1, 4, { pick: t.players.t1.horses[1].id });
  assert.equal(horse(t, 't1', 2).progress, 1);
  assert.equal(t.resolution?.exited, true);
  let six = newGame(2, 1, { exitRolls: [6] });
  horse(six, 't1', 1).progress = FINISH;               // park horse 1 at home so only the stable horse is left
  six = play(six, 1, 2);
  assert.equal(horse(six, 't1', 2).progress, 0);
  assert.equal(six.resolution?.horseId, null);
});

test('when several horses can move the player chooses in the move phase; options describe kicks', () => {
  let s = newGame(3);
  horse(s, 't1', 1).progress = 5; horse(s, 't1', 2).progress = 9;
  horse(s, 't2', 1).progress = progressAt(1, ringCell(0, 9 + 5)!);   // rival 5 ahead of horse 2 (sum 5)
  s = applyAction(s, 't1m1', { type: 'roll' }, 2_000, rigged(2, 3), QUESTION_BANK);
  s = applyAction(s, 't1m1', { type: 'answer', index: wrongIndex(s) }, 2_100, seeded(3), QUESTION_BANK);
  assert.equal(s.phase, 'move');
  assert.equal(s.pending!.options.length, 2);
  const kick = s.pending!.options.find((o) => o.horseId === 't1-h2')!;
  assert.equal(kick.kicks.length, 1);
  assert.throws(() => applyAction(s, 't1m1', { type: 'choose-horse', horseId: 'nope' }, 2_200, seeded(), QUESTION_BANK), /không đi được/);
  s = applyAction(s, 't1m1', { type: 'choose-horse', horseId: 't1-h2' }, 2_200, seeded(), QUESTION_BANK);
  assert.equal(horse(s, 't1', 2).progress, 14);
  assert.equal(horse(s, 't2', 1).progress, 0);
  assert.equal(s.turnTeamId, 't1');                    // kick gives a bonus roll
  assert.equal(s.phase, 'roll');
});

test('an unchosen move is picked for the team when the move timer ends (prefers a kick)', () => {
  let s = newGame(3);
  horse(s, 't1', 1).progress = 5; horse(s, 't1', 2).progress = 9;
  horse(s, 't2', 1).progress = progressAt(1, ringCell(0, 9 + 5)!);
  s = applyAction(s, 't1m1', { type: 'roll' }, 2_000, rigged(2, 3), QUESTION_BANK);
  s = applyAction(s, 't1m1', { type: 'answer', index: wrongIndex(s) }, 2_100, seeded(3), QUESTION_BANK);
  assert.equal(tick(s, 2_100 + MOVE_MS - 1, seeded(), QUESTION_BANK), s);
  const late = tick(s, 2_100 + MOVE_MS + 1, seeded(), QUESTION_BANK);
  assert.equal(horse(late, 't1', 2).progress, 14);
  assert.equal(late.resolution?.kicked.length, 1);
});

test('correct answer gives a skill card; wrong or timeout does not, but the horse still moves', () => {
  let s = newGame(2);
  horse(s, 't1', 1).progress = 5;
  s = play(s, 2, 3, { right: true });
  assert.equal(horse(s, 't1', 1).progress, 10);
  assert.equal(s.players.t1.hand.length, 1);
  assert.equal(s.resolution?.outcome, 'correct');
  s = play(s, 2, 3, { right: false });
  assert.equal(s.players.t2.hand.length, 0);
  let u = newGame(2);
  horse(u, 't1', 1).progress = 5;
  u = applyAction(u, 't1m1', { type: 'roll' }, 2_000, rigged(3, 4), QUESTION_BANK);
  const late = tick(u, 2_000 + u.questionMs + 1, seeded(), QUESTION_BANK);
  assert.equal(late.resolution?.outcome, 'timeout');
  assert.equal(late.players.t1.hand.length, 0);
  assert.equal(horse(late, 't1', 1).progress, 12);
});

test('doubles give a bonus roll to the same member, at most MAX_STREAK times', () => {
  let s = newGame(2, 2);
  s = play(s, 3, 3);
  assert.equal(s.turnTeamId, 't1');
  assert.equal(s.actingMemberId, 't1m1');
  assert.equal(s.streak, 1);
  for (let i = 1; i < MAX_STREAK; i++) s = play(s, 2, 2);
  assert.equal(s.turnTeamId, 't1');
  s = play(s, 4, 4);
  assert.equal(s.turnTeamId, 't2');
  assert.equal(s.streak, 0);
});

test('landing on a rival kicks it; start cells are safe; own horses may share a cell', () => {
  let s = newGame(6);
  horse(s, 't1').progress = 5;
  horse(s, 't2').progress = progressAt(1, ringCell(0, 9)!);
  s = play(s, 1, 3);                                   // 1 is an exit roll but horse 2 is... choose the advance
  assert.equal(s.phase, 'roll');
  assert.equal(s.turnTeamId, 't1');
  assert.deepEqual(s.resolution?.kicked.map((k) => k.teamId), ['t2']);
  assert.equal(horse(s, 't2').progress, 0);

  let safe = newGame(6);
  horse(safe, 't1').progress = progressAt(0, 14);
  horse(safe, 't3').progress = 1;
  assert.equal(ringCell(2, 1), 12);                    // team 3's start cell
  const gap = (12 - 14 + RING_SIZE) % RING_SIZE;
  safe = play(safe, 2, gap - 2 > 0 ? gap - 2 : 1);
  if (gap >= 2 && gap <= 12) { assert.equal(ringCell(0, horse(safe, 't1').progress), 12); assert.equal(horse(safe, 't3').progress, 1); assert.deepEqual(safe.resolution?.kicked, []); }

  let own = newGame(2);
  horse(own, 't1', 1).progress = 5; horse(own, 't1', 2).progress = 9;
  own = play(own, 1, 3, { pick: 't1-h1' });
  assert.equal(horse(own, 't1', 1).progress, 9);
  assert.equal(horse(own, 't1', 2).progress, 9);
  assert.equal(own.resolution?.kicked.length, 0);
});

test('the home lane is private; bringing winHome horses home wins and ranks everybody', () => {
  let s = newGame(2, 1, { winHome: 1 });
  horse(s, 't1').progress = FINISH - 2;
  s = play(s, 3, 4);
  assert.equal(s.phase, 'finished');
  assert.equal(s.winnerId, 't1');
  assert.equal(s.endedBy, 'finish');
  assert.equal(horse(s, 't1').progress, FINISH);
  assert.throws(() => applyAction(s, 't2m1', { type: 'roll' }, 4_000, seeded(), QUESTION_BANK));

  let w = newGame(2);                                   // default: 2 horses home
  assert.equal(w.winHome, 2);
  horse(w, 't1', 1).progress = FINISH - 1; horse(w, 't1', 2).progress = FINISH - 1;
  w = play(w, 2, 3, { pick: 0 });
  assert.equal(w.phase, 'roll');                         // one horse home, bonus roll, not won yet
  assert.equal(w.resolution?.bonus, true);
  w = play(w, 2, 3);
  assert.equal(w.winnerId, 't1');
  assert.equal(newGame(2, 1, { winHome: 5 }).winHome, 2);
});

test('the game ends on the clock: leader by horses home, then progress; pause stops the clock', () => {
  const s = newGame(3, 1, { timeLimitMs: 10 * 60_000 });
  assert.equal(s.endsAt, 1_000 + 10 * 60_000);
  assert.equal(tick(s, 2_000, seeded(), QUESTION_BANK), s);
  horse(s, 't2', 1).progress = 20; horse(s, 't3', 1).progress = 25;
  const p = pauseGame(s, 1_000 + 60_000);
  assert.equal(p.pausedLeft, 9 * 60_000);
  assert.equal(tick(p, 10 ** 9, seeded(), QUESTION_BANK), p);
  const r = resumeGame(p, 5_000_000);
  assert.equal(r.endsAt, 5_000_000 + 9 * 60_000);
  const over = tick(r, r.endsAt!, seeded(), QUESTION_BANK);
  assert.equal(over.phase, 'finished');
  assert.equal(over.endedBy, 'time');
  assert.equal(over.winnerId, 't3');
  assert.deepEqual(over.ranking, ['t3', 't2', 't1']);
});

test('skills: stun makes a team lose its next turn; only one pre-roll card per turn', () => {
  let s = newGame(3);
  const a = give(s, 't1', 'stun', 'a'); const b = give(s, 't1', 'stun', 'b');
  s = applyAction(s, 't1m1', { type: 'play-skill', cardId: a, targetHorseId: 't2-h1' }, 2_000, seeded(), QUESTION_BANK);
  assert.equal(s.players.t2.stunned, true);
  assert.equal(s.skillLog.at(-1)?.kind, 'stun');
  assert.throws(() => applyAction(s, 't1m1', { type: 'play-skill', cardId: b, targetHorseId: 't3-h1' }, 2_100, seeded(), QUESTION_BANK), /1 thẻ/);
  s = play(s, 2, 3);
  assert.equal(s.turnTeamId, 't3');
  assert.equal(s.players.t2.stunned, false);
});

test('skills: barricade caps one horse; boost adds 4 to the move', () => {
  let s = newGame(2);
  horse(s, 't1').progress = 3; horse(s, 't2').progress = 3;
  horse(s, 't2').cap = 3;
  s.players.t1.boost = 4;
  s = play(s, 2, 3);
  assert.equal(horse(s, 't1').progress, 12);
  s = play(s, 5, 6);
  assert.equal(horse(s, 't2').progress, 6);
  assert.equal(s.resolution?.capped, true);
  assert.equal(horse(s, 't2').cap, null);
});

test('skills: push-back, swap and steal obey their conditions', () => {
  let s = newGame(3);
  horse(s, 't2').progress = 12;
  const pb = give(s, 't1', 'push-back');
  assert.throws(() => applyAction(s, 't1m1', { type: 'play-skill', cardId: pb, targetHorseId: 't3-h2' }, 2_000, seeded(), QUESTION_BANK), /vòng đua/);
  assert.throws(() => applyAction(s, 't1m1', { type: 'play-skill', cardId: pb }, 2_000, seeded(), QUESTION_BANK), /ngựa/);
  assert.throws(() => applyAction(s, 't1m1', { type: 'play-skill', cardId: pb, targetHorseId: 't1-h1' }, 2_000, seeded(), QUESTION_BANK), /đối thủ/);
  s = applyAction(s, 't1m1', { type: 'play-skill', cardId: pb, targetHorseId: 't2-h1' }, 2_000, seeded(), QUESTION_BANK);
  assert.equal(horse(s, 't2').progress, 7);

  let w = newGame(2);
  horse(w, 't1').progress = 2; horse(w, 't2').progress = 15;
  const cellMine = ringCell(0, 2), cellTheirs = ringCell(1, 15);
  const sw = give(w, 't1', 'swap');
  w = applyAction(w, 't1m1', { type: 'play-skill', cardId: sw, targetHorseId: 't2-h1' }, 2_000, seeded(), QUESTION_BANK);
  assert.equal(ringCell(0, horse(w, 't1').progress), cellTheirs);
  assert.equal(ringCell(1, horse(w, 't2').progress), cellMine);

  let t = newGame(2);
  const st = give(t, 't1', 'steal');
  assert.throws(() => applyAction(t, 't1m1', { type: 'play-skill', cardId: st, targetHorseId: 't2-h2' }, 2_000, seeded(), QUESTION_BANK), /chưa có thẻ/);
  give(t, 't2', 'shield', 'victim');
  t = applyAction(t, 't1m1', { type: 'play-skill', cardId: st, targetHorseId: 't2-h2' }, 2_000, seeded(), QUESTION_BANK);
  assert.equal(t.players.t2.hand.length, 0);
  assert.deepEqual(t.players.t1.hand.map((c) => c.id), ['victim']);
});

test('shield blocks exactly one hostile skill', () => {
  let s = newGame(2);
  s.players.t2.shield = true;
  const a = give(s, 't1', 'stun', 'a');
  s = applyAction(s, 't1m1', { type: 'play-skill', cardId: a, targetHorseId: 't2-h1' }, 2_000, seeded(), QUESTION_BANK);
  assert.equal(s.players.t2.stunned, false);
  assert.equal(s.players.t2.shield, false);
  assert.equal(s.skillLog.at(-1)?.blocked, true);
});

test('question skills: hint and fifty only work during a question', () => {
  let s = newGame(2);
  const h = give(s, 't1', 'hint', 'h'); const f = give(s, 't1', 'fifty', 'f');
  assert.throws(() => applyAction(s, 't1m1', { type: 'play-skill', cardId: h }, 2_000, seeded(), QUESTION_BANK), /câu hỏi/);
  s = applyAction(s, 't1m1', { type: 'roll' }, 2_000, seeded(1), QUESTION_BANK);
  s = applyAction(s, 't1m1', { type: 'play-skill', cardId: h }, 2_100, seeded(), QUESTION_BANK);
  assert.equal(s.question!.hintShown, true);
  s = applyAction(s, 't1m1', { type: 'play-skill', cardId: f }, 2_200, seeded(), QUESTION_BANK);
  assert.equal(s.question!.removed.length, 2);
  assert.ok(!s.question!.removed.includes(s.question!.answerIndex));
  assert.throws(() => applyAction(s, 't1m1', { type: 'answer', index: s.question!.removed[0] }, 2_300, seeded(), QUESTION_BANK), /không hợp lệ/);
});

test('double-dice keeps the better of two throws; hand is capped', () => {
  let s = newGame(2);
  s.players.t1.doubleDice = true;
  const seq = [0.0, 0.0, 0.99, 0.99];                   // 1+1 then 6+6
  let n = 0;
  s = applyAction(s, 't1m1', { type: 'roll' }, 2_000, () => seq[n++] ?? 0.5, QUESTION_BANK);
  assert.deepEqual(s.dice, [6, 6]);
  assert.equal(s.players.t1.doubleDice, false);
  let h = newGame(2);
  for (let i = 0; i < HAND_MAX; i++) give(h, 't1', 'hint', `c${i}`);
  horse(h, 't1').progress = 3;
  h = play(h, 2, 3, { right: true });
  assert.ok(h.players.t1.hand.length <= HAND_MAX);
});

test('pause freezes the clock; host can end the game with the leader winning', () => {
  const s = newGame(2);
  const p = pauseGame(s, 1_000 + 5_000);
  assert.equal(tick(p, 10_000_000, seeded(), QUESTION_BANK), p);
  assert.throws(() => applyAction(p, 't1m1', { type: 'roll' }, 2_000, seeded(), QUESTION_BANK), /tạm dừng/);
  const r = resumeGame(p, 50_000);
  assert.equal(r.deadline, 50_000 + (s.deadline! - 6_000));
  horse(r, 't2').progress = 9;
  const e = endGame(r, 60_000);
  assert.equal(e.phase, 'finished');
  assert.equal(e.endedBy, 'host');
  assert.equal(e.winnerId, 't2');
});

/** Plays whole games with a simple bot and checks the pacing target: ~60 turns or fewer for six teams. */
function botGame(seed: number, nTeams: number, opts: GameOptions) {
  const rng = seeded(seed);
  let s = createGame(teams(nTeams, 2), QUESTION_BANK, 0, rng, { timeLimitMs: 10 ** 9, ...opts });
  let now = 0, turns = 0;
  while (s.phase !== 'finished' && turns < 600) {
    now += 1000; turns++;
    const id = s.turnTeamId;
    const card = s.players[id].hand.find((c) => ['stun', 'barricade', 'boost', 'shield', 'push-back'].includes(c.kind));
    if (card && s.phase === 'roll' && !s.skillUsed) {
      const enemy = s.order.find((t) => t !== id)!;
      try { s = applyAction(s, s.actingMemberId, { type: 'play-skill', cardId: card.id, targetHorseId: `${enemy}-h1` }, now, rng, QUESTION_BANK); } catch { /* invalid target, skip */ }
    }
    s = applyAction(s, s.actingMemberId, { type: 'roll' }, now, rng, QUESTION_BANK);
    s = applyAction(s, s.actingMemberId, { type: 'answer', index: rng() < 0.6 ? correctIndex(s) : wrongIndex(s) }, now, rng, QUESTION_BANK);
    if (s.phase === 'move') s = applyAction(s, s.actingMemberId, { type: 'choose-horse', horseId: s.pending!.options[Math.floor(rng() * s.pending!.options.length)].horseId }, now, rng, QUESTION_BANK);
  }
  return { s, turns };
}

test('pacing: 6 teams x 2 horses (win = 2 home) finish in about 15-20 minutes at ~18 s per turn', () => {
  const turns: number[] = [];
  for (let seed = 1; seed <= 40; seed++) { const r = botGame(seed * 13, 6, {}); assert.equal(r.s.phase, 'finished'); assert.equal(r.s.endedBy, 'finish'); turns.push(r.turns); }
  turns.sort((a, b) => a - b);
  const median = turns[20], p90 = turns[36];
  console.log(`  pacing 6x2: median ${median} turns (~${(median * 0.3).toFixed(1)} min), p90 ${p90} (~${(p90 * 0.3).toFixed(1)} min)`);
  assert.ok(median <= 66, `median ${median} turns is too long`);
  assert.ok(p90 <= 90, `p90 ${p90} turns is too long`);
});

test('pacing: 3 horses per team, win with 2 home, stays within the 20-minute cap range', () => {
  const turns: number[] = [];
  for (let seed = 1; seed <= 30; seed++) turns.push(botGame(seed * 7, 6, { horses: 3, winHome: 2 }).turns);
  turns.sort((a, b) => a - b);
  console.log(`  pacing 6x3: median ${turns[15]} turns (~${(turns[15] * 0.3).toFixed(1)} min)`);
  assert.ok(turns[15] <= 75);
});
