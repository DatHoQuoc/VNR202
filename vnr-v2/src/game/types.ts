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

export interface Member { id: string; name: string }

/** One horse per team member. progress: 0 = in the stable, 1..RING_MAX ring, then the home lane, FINISH = home. */
export interface Horse {
  id: string; memberId: string; name: string; progress: number;
  /** Owner loses their next turn (Chia Để Trị). */
  frozen: boolean;
  /** This horse's next move is limited to this many steps (Thuế Khóa). */
  cap: number | null;
}

/** A team (slot 1-6): shared hand of skill cards, one horse per member. */
export interface PlayerState {
  teamId: string;
  seat: number;
  members: Member[];
  horses: Horse[];
  /** Index into members of whoever acted last; the next turn goes to the following member. */
  actingIdx: number;
  hand: SkillCard[];
  boost: number;
  doubleDice: boolean;
  shield: boolean;
  correct: number;
  answered: number;
}

export interface Resolution {
  id: number;
  teamId: string;
  memberId: string;
  memberName: string;
  horseId: string;
  dice: number;
  steps: number;
  from: number;
  to: number;
  /** The horse left the stable on this roll. */
  exited: boolean;
  /** Horses kicked back to their stable by this move. */
  kicked: { horseId: string; teamId: string; name: string }[];
  bonus: boolean;
  picked: number | null;
  outcome: 'correct' | 'wrong' | 'timeout';
  questionText: string;
  correctText: string;
  explain: string;
  ref: string;
  gained: SkillKind | null;
  capped: boolean;
  boost: number;
}

/** One skill card played, kept so everybody can see who used what on whom. */
export interface SkillUse {
  id: number;
  turn: number;
  kind: SkillKind;
  teamId: string;
  memberName: string;
  targetTeamId?: string;
  targetHorseId?: string;
  targetName?: string;
  blocked: boolean;
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
  actingMemberId: string;
  turnNumber: number;
  /** Consecutive bonus rolls (6, a kick or a horse reaching home) taken by the acting member. */
  streak: number;
  winHome: number;
  exitRolls: number[];
  skillLog: SkillUse[];
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
  | { type: 'play-skill'; cardId: string; targetHorseId?: string };
