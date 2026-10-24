/**
 * Pure scoring functions (no I/O). Rules come from GameDesign v05 §4 and v03b:
 *  - Only step 2 (guess the % of OTHER teams) is scored; step 1 is never scored.
 *  - score = max(0, 100 - |guess - actual|), actual counts other teams only.
 *  - personal = mean of scored rounds; team = mean of its members' personal scores.
 *  - Excused rounds are dropped from the mean (not 0).
 *  - Joined and online but did not guess => 0. Joined but offline at close => excused.
 */

export interface Pick {
  playerId: string;
  team: number;
  option: string;
}

export interface Guess {
  playerId: string;
  value: number;
}

export interface Participant {
  playerId: string;
  team: number;
  /** connected when the guess step closed */
  connected: boolean;
}

export interface RoundScore {
  playerId: string;
  team: number;
  guess: number | null;
  actual: number;
  score: number;
  /** |guess - actual|; 100 when the player did not guess */
  deviation: number;
}

export interface RoundScoring {
  scores: RoundScore[];
  /** joined but offline at close and did not guess */
  autoExcused: string[];
  /** nobody from other teams picked, so there is nothing to compare against */
  skipped: string[];
}

export const clampPercent = (v: number): number => Math.min(100, Math.max(0, v));

/** % of OTHER teams' pickers who chose `target`. null when no other team picked. */
export function actualFor(team: number, target: string, picks: Pick[]): number | null {
  const others = picks.filter((p) => p.team !== team);
  if (others.length === 0) return null;
  return (others.filter((p) => p.option === target).length / others.length) * 100;
}

export function scoreRound(input: {
  target: string;
  picks: Pick[];
  guesses: Guess[];
  participants: Participant[];
}): RoundScoring {
  const guessBy = new Map(input.guesses.map((g) => [g.playerId, g.value]));
  const scores: RoundScore[] = [];
  const autoExcused: string[] = [];
  const skipped: string[] = [];

  for (const p of input.participants) {
    const actual = actualFor(p.team, input.target, input.picks);
    if (actual === null) {
      skipped.push(p.playerId);
      continue;
    }
    const raw = guessBy.get(p.playerId);
    if (raw !== undefined) {
      const guess = clampPercent(raw);
      const deviation = Math.abs(guess - actual);
      scores.push({ playerId: p.playerId, team: p.team, guess, actual, score: Math.max(0, 100 - deviation), deviation });
    } else if (p.connected) {
      scores.push({ playerId: p.playerId, team: p.team, guess: null, actual, score: 0, deviation: 100 });
    } else {
      autoExcused.push(p.playerId);
    }
  }
  return { scores, autoExcused, skipped };
}

export interface ScoredRound {
  round: number;
  scores: RoundScore[];
}

export interface TeamStanding {
  rank: number;
  team: number;
  score: number;
  /** mean deviation of the team in the tie-break round (null if it did not play it) */
  tieBreakDeviation: number | null;
  meanDeviation: number;
  perRound: { round: number; score: number }[];
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

export function standings(rounds: ScoredRound[], tieBreakRound = 2): TeamStanding[] {
  const personal = new Map<string, { team: number; scores: number[] }>();
  const teamRound = new Map<number, Map<number, number[]>>(); // team -> round -> scores
  const teamDev = new Map<number, number[]>();
  const teamTieDev = new Map<number, number[]>();

  for (const r of rounds) {
    for (const s of r.scores) {
      const p = personal.get(s.playerId) ?? { team: s.team, scores: [] };
      p.scores.push(s.score);
      personal.set(s.playerId, p);

      const byRound = teamRound.get(s.team) ?? new Map<number, number[]>();
      byRound.set(r.round, [...(byRound.get(r.round) ?? []), s.score]);
      teamRound.set(s.team, byRound);

      teamDev.set(s.team, [...(teamDev.get(s.team) ?? []), s.deviation]);
      if (r.round === tieBreakRound) teamTieDev.set(s.team, [...(teamTieDev.get(s.team) ?? []), s.deviation]);
    }
  }

  const perTeam = new Map<number, number[]>();
  for (const { team, scores } of personal.values()) {
    perTeam.set(team, [...(perTeam.get(team) ?? []), mean(scores)]);
  }

  const rows = [...perTeam].map(([team, arr]) => ({
    team,
    score: mean(arr),
    tieBreakDeviation: teamTieDev.has(team) ? mean(teamTieDev.get(team)!) : null,
    meanDeviation: mean(teamDev.get(team)!),
    perRound: [...(teamRound.get(team) ?? [])]
      .map(([round, xs]) => ({ round, score: mean(xs) }))
      .sort((a, b) => a.round - b.round),
  }));

  const EPS = 1e-9;
  rows.sort((a, b) => {
    if (Math.abs(a.score - b.score) > EPS) return b.score - a.score;
    const ta = a.tieBreakDeviation ?? Infinity;
    const tb = b.tieBreakDeviation ?? Infinity;
    if (Math.abs(ta - tb) > EPS) return ta - tb;
    if (Math.abs(a.meanDeviation - b.meanDeviation) > EPS) return a.meanDeviation - b.meanDeviation;
    return a.team - b.team;
  });

  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}
