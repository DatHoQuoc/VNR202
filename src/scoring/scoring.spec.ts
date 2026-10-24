import { actualFor, scoreRound, standings, Pick } from './scoring';

// 30 players, 6 teams of 5. Team 3 vs the other 25: 9 chose B => 36%.
const picks: Pick[] = [];
for (let t = 1; t <= 6; t++) {
  for (let i = 0; i < 5; i++) picks.push({ playerId: `t${t}p${i}`, team: t, option: 'A' });
}
const setOption = (team: number, n: number, option: string) => {
  let left = n;
  for (const p of picks) if (p.team === team && left-- > 0) p.option = option;
};
setOption(1, 5, 'B');
setOption(2, 4, 'B'); // 9 B among teams != 3
const participants = picks.map((p) => ({ playerId: p.playerId, team: p.team, connected: true }));

describe('actualFor', () => {
  it('counts only other teams (v05 example: 9/25 = 36%)', () => {
    expect(actualFor(3, 'B', picks)).toBeCloseTo(36);
  });
  it('is null when no other team picked', () => {
    expect(actualFor(1, 'B', picks.filter((p) => p.team === 1))).toBeNull();
  });
});

describe('scoreRound', () => {
  it('guess 40 vs 36 => 96, guess 70 => 66 (spec examples)', () => {
    const r = scoreRound({
      target: 'B',
      picks,
      guesses: [
        { playerId: 't3p0', value: 40 },
        { playerId: 't3p1', value: 70 },
      ],
      participants: participants.filter((p) => p.team === 3),
    });
    const s = Object.fromEntries(r.scores.map((x) => [x.playerId, x.score]));
    expect(s['t3p0']).toBeCloseTo(96);
    expect(s['t3p1']).toBeCloseTo(66);
  });

  it('clamps out-of-range guesses to 0..100', () => {
    const r = scoreRound({ target: 'B', picks, guesses: [{ playerId: 't3p0', value: 500 }], participants: [participants.find((p) => p.playerId === 't3p0')!] });
    expect(r.scores[0].guess).toBe(100);
    expect(r.scores[0].score).toBeCloseTo(36);
  });

  it('online without a guess => 0; offline without a guess => excused (not 0)', () => {
    const r = scoreRound({
      target: 'B',
      picks,
      guesses: [],
      participants: [
        { playerId: 't3p0', team: 3, connected: true },
        { playerId: 't3p1', team: 3, connected: false },
      ],
    });
    expect(r.scores).toHaveLength(1);
    expect(r.scores[0]).toMatchObject({ playerId: 't3p0', score: 0, guess: null });
    expect(r.autoExcused).toEqual(['t3p1']);
  });
});

describe('standings', () => {
  const mk = (playerId: string, team: number, score: number, deviation = 100 - score) => ({ playerId, team, guess: 0, actual: 0, score, deviation });

  it('team score = mean of members personal means; excused rounds do not count as 0', () => {
    const out = standings([
      { round: 1, scores: [mk('a', 1, 100), mk('b', 1, 80), mk('c', 2, 90)] },
      // b is excused in round 2 (absent from the list), c plays
      { round: 2, scores: [mk('a', 1, 60), mk('c', 2, 90)] },
    ]);
    // team1: a=(100+60)/2=80, b=80 => 80 ; team2: c=90
    expect(out.map((r) => [r.team, r.rank])).toEqual([[2, 1], [1, 2]]);
    expect(out[0].score).toBeCloseTo(90);
    expect(out[1].score).toBeCloseTo(80);
  });

  it('breaks ties by deviation at decision 2, then overall deviation, then team number', () => {
    const out = standings([
      { round: 1, scores: [mk('a', 1, 80, 20), mk('b', 2, 80, 20)] },
      { round: 2, scores: [mk('a', 1, 80, 20), mk('b', 2, 80, 5)] },
    ]);
    expect(out.map((r) => r.team)).toEqual([2, 1]);
  });

  it('exposes per-round team scores for the rank-1 reveal', () => {
    const out = standings([
      { round: 1, scores: [mk('a', 1, 100), mk('b', 1, 50)] },
      { round: 2, scores: [mk('a', 1, 70)] },
    ]);
    expect(out[0].perRound).toEqual([
      { round: 1, score: 75 },
      { round: 2, score: 70 },
    ]);
  });
});
