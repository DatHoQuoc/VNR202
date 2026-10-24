import { progressGroups } from './nav';
import type { UiText } from './types';

/** Corner HUD: the three decisions, the illustrative label and the station progress bar. */
export class Hud {
  private readonly boxes: HTMLElement[] = [];
  private readonly illus: HTMLElement;
  private readonly offline: HTMLElement;
  private readonly ticks: HTMLElement[] = [];
  private readonly segs: { el: HTMLElement; members: number[] }[] = [];

  constructor(root: HTMLElement, ui: UiText, ids: string[]) {
    const hud = document.createElement('div');
    hud.className = 'hud';
    ui.hud.forEach((label) => {
      const b = document.createElement('div');
      b.className = 'box';
      b.textContent = label;
      hud.appendChild(b);
      this.boxes.push(b);
    });
    root.appendChild(hud);

    this.offline = document.createElement('div');
    this.offline.className = 'offline';
    this.offline.textContent = ui.offline;
    this.offline.hidden = true;
    root.appendChild(this.offline);

    this.illus = document.createElement('div');
    this.illus.className = 'illus';
    this.illus.textContent = ui.illustrative;
    root.appendChild(this.illus);

    const progress = document.createElement('div');
    progress.className = 'progress';
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('aria-label', ui.progress);
    for (const g of progressGroups(ids)) {
      const seg = document.createElement('div');
      seg.className = 'seg';
      const bar = document.createElement('div');
      bar.className = 'bar';
      for (const m of g.members) {
        const t = document.createElement('div');
        t.className = 'tick';
        bar.appendChild(t);
        this.ticks[m] = t;
      }
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = g.members.map((m) => ids[m]).join('·');
      seg.append(bar, name);
      progress.appendChild(seg);
      this.segs.push({ el: seg, members: g.members });
    }
    root.appendChild(progress);
  }

  /** Light up (or dim) decision box 1..3. */
  setAnswered(box: 1 | 2 | 3, on: boolean): void {
    this.boxes[box - 1].classList.toggle('on', on);
  }

  /** Dim all three decision boxes (each station sets what it needs). */
  reset(): void {
    this.boxes.forEach((b) => b.classList.remove('on'));
  }

  setOffline(off: boolean): void {
    this.offline.hidden = !off;
  }

  setIllustrative(on: boolean): void {
    this.illus.style.opacity = on ? '1' : '0';
  }

  setStation(index: number): void {
    this.ticks.forEach((t, i) => {
      t.classList.toggle('past', i < index);
      t.classList.toggle('cur', i === index);
    });
    for (const s of this.segs) {
      s.el.classList.toggle('cur', s.members.includes(index));
      s.el.classList.toggle('past', s.members.every((m) => m < index));
    }
  }
}
