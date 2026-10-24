import { RoundScore } from '../scoring/scoring';

export type GamePhase = 'lobby' | 'joining' | 'rounds' | 'announce' | 'ended';
export type RoundPhase = 'idle' | 'pick' | 'guess' | 'revealed';

export interface Player {
  id: string;
  name: string;
  team: number;
  /** first round that counts for this player (late joiners are scored from here) */
  joinedRound: number;
  createdAt: string;
}

export interface RoundResult {
  /** class-wide % per option (all pickers) */
  distribution: Record<string, number>;
  scores: RoundScore[];
  /** mean of member scores per team in this round */
  teamScores: Record<number, number>;
  autoExcused: string[];
  skipped: string[];
  /** station 9B decision 2: opening x% -> now y% */
  comparison?: { x: number; y: number };
  correctOption?: string;
}

export interface RoundState {
  n: number;
  phase: RoundPhase;
  voided: boolean;
  picks: Record<string, string>;
  guesses: Record<string, number>;
  excused: string[];
  /** connection snapshot when the guess step closed */
  closedConnected: Record<string, boolean>;
  result?: RoundResult;
}

export interface Reflection {
  id: string;
  text: string;
  approved: boolean;
  createdAt: string;
}

export interface Game {
  code: string;
  phase: GamePhase;
  currentRound: number;
  openingPercent: number | null;
  rounds: RoundState[];
  players: Record<string, Player>;
  reflections: Reflection[];
  reflectionOpen: boolean;
  finaleRevealed: number;
  createdAt: string;
}

export interface RoundContent {
  n: number;
  title: string;
  step1: { prompt: string; options: Record<string, string> };
  step2: { ask: string; target: string };
  compareOpening?: boolean;
  correctOption?: string;
}
