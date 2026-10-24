import { io, type Socket } from 'socket.io-client';

export interface PublicState {
  phase: 'lobby' | 'joining' | 'rounds' | 'announce' | 'ended';
  teams: number;
  round: null | {
    n: number;
    title: string;
    phase: 'idle' | 'pick' | 'guess' | 'revealed';
    voided: boolean;
    step1: { prompt: string; options: Record<string, string> };
    step2: { ask: string };
  };
  reflection: { open: boolean; prompt: string; max: number };
  finale: null | {
    total: number;
    revealed: number;
    standings: { rank: number; team: number | null; score: number | null; perRound: { round: number; score: number }[] | null }[];
  };
}

export interface RoundData {
  n: number;
  phase: string;
  title: string;
  target: string;
  distribution: Record<string, number>;
  comparison: { x: number; y: number } | null;
  correctOption: string | null;
}

/** Public labels of a round, remembered while the round was live (the reveal route does not carry them). */
export interface RoundLabels {
  title: string;
  prompt: string;
  options: Record<string, string>;
  ask: string;
}

type Listener = () => void;

/**
 * Same-origin Socket.IO client for the projector. Only uses public data:
 * the `state` event, GET /state and GET /stage/rounds/:n (class-wide numbers after reveal).
 */
export class GameClient {
  state: PublicState | null = null;
  connected = false;
  /** true once the round cache has been read at least once (so an empty cache means "voided", not "loading") */
  roundsReady = false;
  /** revealed, not voided rounds */
  readonly rounds = new Map<number, RoundData>();
  readonly labels = new Map<number, RoundLabels>();
  private readonly listeners = new Set<Listener>();
  private readonly connListeners = new Set<Listener>();
  private socket: Socket | null = null;
  private poll: number | null = null;
  private lastKey = '';

  start(): void {
    if (this.socket) return;
    const s = io({ transports: ['websocket', 'polling'] });
    this.socket = s;
    s.on('connect', () => {
      this.setConnected(true);
      void this.refresh();
    });
    s.on('disconnect', () => this.setConnected(false));
    s.on('connect_error', () => this.setConnected(false));
    s.on('state', (st: PublicState) => this.setState(st));
    void this.refresh();
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  onConnection(fn: Listener): () => void {
    this.connListeners.add(fn);
    return () => this.connListeners.delete(fn);
  }

  private setConnected(on: boolean): void {
    this.connected = on;
    // while the socket is down, keep the projector current by polling
    if (!on && this.poll === null) this.poll = window.setInterval(() => void this.refresh(), 3000);
    if (on && this.poll !== null) {
      window.clearInterval(this.poll);
      this.poll = null;
    }
    this.connListeners.forEach((f) => f());
  }

  async refresh(): Promise<void> {
    try {
      const st = (await (await fetch('/state')).json()) as PublicState;
      this.setState(st);
    } catch {
      /* offline: the next poll or reconnect retries */
    }
  }

  private setState(st: PublicState): void {
    this.state = st;
    if (st.round) this.labels.set(st.round.n, { title: st.round.title, prompt: st.round.step1.prompt, options: st.round.step1.options, ask: st.round.step2.ask });
    // the reveal numbers can change (excused player, void): re-read them whenever the round progress changes
    const key = `${st.phase}|${st.round?.n}|${st.round?.phase}|${st.round?.voided}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      void this.refreshRounds();
    }
    this.listeners.forEach((f) => f());
  }

  /** Re-read every round that can already be revealed. 409 (not revealed / voided) removes it from the cache. */
  async refreshRounds(): Promise<void> {
    const st = this.state;
    if (!st || !st.round) {
      this.roundsReady = true;
      return;
    }
    const last = st.round.n;
    let changed = false;
    await Promise.all(
      Array.from({ length: last }, (_, i) => i + 1).map(async (n) => {
        try {
          const res = await fetch(`/stage/rounds/${n}`);
          if (res.ok) {
            const data = (await res.json()) as RoundData;
            if (JSON.stringify(this.rounds.get(n)) !== JSON.stringify(data)) changed = true;
            this.rounds.set(n, data);
          } else if (this.rounds.delete(n)) changed = true;
        } catch {
          /* keep what we had */
        }
      }),
    );
    this.roundsReady = true;
    if (changed) this.listeners.forEach((f) => f());
  }
}
