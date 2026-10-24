import { gsap } from 'gsap';
import type { Ctx, StationContent } from '../engine/types';
import { LiveView, type NineBText } from '../live/LiveView';
import { FrameStation } from './FrameStation';

/** Station 9B: the six-cell frame plus the live game (rounds 1-4 and the finale). */
export class Station9B extends FrameStation {
  private live: LiveView | null = null;
  private unsub: (() => void) | null = null;
  private ctx!: Ctx;
  private beat = 0;
  private lastKey = '';
  private text: NineBText;

  constructor(id: string, sc: StationContent, cells: { id: string; label: string }[]) {
    super(id, sc, cells);
    this.text = sc.extra as NineBText;
  }

  enter(ctx: Ctx): void {
    super.enter(ctx);
    this.ctx = ctx;
    this.live = new LiveView(ctx.overlay, ctx.game, this.text);
    this.lastKey = this.gameKey();
    this.unsub = ctx.game.onChange(() => this.onGame());
  }

  exit(ctx: Ctx): void {
    this.unsub?.();
    this.unsub = null;
    this.live?.destroy();
    this.live = null;
    super.exit(ctx);
  }

  beatChanged(beat: number, instant: boolean): void {
    this.beat = beat;
    const b = this.sc.beats[beat];
    if (b.live) this.live?.showRound(b.live.round);
    else if (b.finale) this.live?.showFinale();
    else this.live?.hide();
    this.syncGame(instant);
  }

  private gameKey(): string {
    const st = this.ctx.game.state;
    return `${st?.phase}|${st?.round?.n}|${st?.round?.phase}`;
  }

  private onGame(): void {
    this.live?.update();
    this.syncGame(false);
    // follow the live game: when the MC opens/reveals a round (or starts the announcement) show it
    const key = this.gameKey();
    if (key === this.lastKey) return;
    this.lastKey = key;
    const st = this.ctx.game.state;
    if (!st) return;
    let target = -1;
    if (st.phase === 'rounds' && st.round && st.round.phase !== 'idle') target = this.sc.beats.findIndex((b) => b.live?.round === st.round!.n);
    else if (st.phase === 'announce' || st.phase === 'ended') target = this.sc.beats.findIndex((b) => b.finale);
    if (target > this.beat) this.ctx.requestBeat(this.id, target);
  }

  /** Decision boxes, lit cells and rings follow the rounds that are really revealed. */
  private syncGame(instant: boolean): void {
    const game = this.ctx.game;
    for (const [nStr, r] of Object.entries(this.text.rounds)) {
      const n = Number(nStr);
      const revealed = game.rounds.has(n);
      if (r.box) this.ctx.hud.setAnswered(r.box as 1 | 2 | 3, revealed);
      if (r.cell) {
        if (revealed !== this.isLit(r.cell)) this.setLit(r.cell, revealed, !instant);
        if (r.rings) this.setRings(revealed, !instant);
      }
    }
    void gsap;
  }
}
