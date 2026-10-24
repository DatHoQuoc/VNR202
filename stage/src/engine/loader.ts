import type { Ctx, Station, StationContent } from './types';

/** Keeps only the stations that are needed alive: the current one and the next one. */
export class StationLoader {
  private readonly built = new Map<number, Promise<Station>>();
  private readonly ready = new Set<number>();

  constructor(
    private readonly ctx: Ctx,
    private readonly stations: StationContent[],
    private readonly factory: (sc: StationContent, index: number) => Promise<Station>,
  ) {}

  isReady(i: number): boolean {
    return this.ready.has(i);
  }

  ensure(i: number): Promise<Station> {
    let p = this.built.get(i);
    if (!p) {
      p = this.factory(this.stations[i], i).then(async (s) => {
        await s.build(this.ctx);
        this.ready.add(i);
        return s;
      });
      this.built.set(i, p);
    }
    return p;
  }

  /** Dispose every station except the ones in `keep`. */
  retain(keep: number[]): void {
    for (const [i, p] of [...this.built]) {
      if (keep.includes(i)) continue;
      this.built.delete(i);
      this.ready.delete(i);
      void p.then((s) => s.dispose());
    }
  }

  get alive(): number[] {
    return [...this.built.keys()].sort((a, b) => a - b);
  }
}
