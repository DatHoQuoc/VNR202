export type TeamColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';
/** Seat order around the board; the n-th team to join takes the n-th colour. */
export const TEAM_COLORS: TeamColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
export const COLOR_NAMES: Record<TeamColor, string> = {
  red: 'Đỏ', orange: 'Cam', yellow: 'Vàng', green: 'Lục', blue: 'Lam', purple: 'Tím'
};

export type SkillKind =
  | 'stun' | 'barricade' | 'push-back' | 'swap' | 'steal'
  | 'boost' | 'double-dice' | 'shield'
  | 'hint' | 'fifty';

export interface SkillCard { id: string; kind: SkillKind }

export interface Question {
  id: string;
  text: string;
  correct: string;
  wrong: [string, string, string];
  hint: string;
  /** One-line explanation shown after the reveal, taken from the textbook. */
  explain: string;
  /** Page in the Chapter I extract (Giáo trình Lịch sử Đảng). */
  ref: string;
}

export interface ActiveQuestion {
  id: string;
  text: string;
  options: string[];
  /** Server-only. Stripped before a state is sent to any client. */
  answerIndex: number;
  removed: number[];
  hintShown: boolean;
}

export interface PlayerState {
  teamId: string;
  seat: number;
  /** 0 = in the stable, 1..RING_MAX on the shared ring, then the home lane, FINISH = home. */
  progress: number;
  hand: SkillCard[];
  stunned: boolean;
  /** Next move is limited to this many steps (Rào Chắn). */
  cap: number | null;
  boost: number;
  doubleDice: boolean;
  shield: boolean;
  correct: number;
  answered: number;
}

export interface Resolution {
  id: number;
  teamId: string;
  dice: number;
  steps: number;
  from: number;
  to: number;
  picked: number | null;
  outcome: 'correct' | 'wrong' | 'timeout';
  questionText: string;
  correctText: string;
  explain: string;
  ref: string;
  gained: SkillKind | null;
  knocked: string[];
  capped: boolean;
  boost: number;
}

export interface GameEvent { id: number; at: number; type: string; text: string; teamId?: string; targetId?: string }

export type Phase = 'roll' | 'question' | 'finished';

export interface GameState {
  phase: Phase;
  deadline: number | null;
  paused: boolean;
  pausedRemaining: number | null;
  rollMs: number;
  questionMs: number;
  finish: number;
  order: string[];
  turnTeamId: string;
  turnNumber: number;
  players: Record<string, PlayerState>;
  skillDeck: SkillCard[];
  skillDiscard: SkillCard[];
  cardSeq: number;
  questionDeck: string[];
  skillUsed: boolean;
  dice: number | null;
  question: ActiveQuestion | null;
  resolution: Resolution | null;
  events: GameEvent[];
  eventSeq: number;
  milestones: Record<string, number>;
  winnerId: string | null;
  ranking: string[] | null;
  endedBy: 'finish' | 'host' | null;
}

export type GameAction =
  | { type: 'roll' }
  | { type: 'answer'; index: number }
  | { type: 'play-skill'; cardId: string; targetId?: string };
