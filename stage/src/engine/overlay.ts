import { gsap } from 'gsap';
import type { BeatContent } from './types';

/** HTML text layer. Everything is built with textContent; the text comes from content.json. */
export class Overlay {
  private current: HTMLElement | null = null;

  constructor(private readonly root: HTMLElement) {}

  /** Replace the beat text. `instant` skips the cross-fade (used for jumps and screenshots). */
  show(content: BeatContent | undefined, instant: boolean): void {
    const old = this.current;
    this.current = content ? this.render(content) : null;
    if (old) {
      if (instant) old.remove();
      else gsap.to(old, { opacity: 0, y: -12, duration: 0.25, onComplete: () => old.remove() });
    }
    if (this.current) {
      this.root.appendChild(this.current);
      if (!instant) gsap.fromTo(this.current, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, delay: old ? 0.2 : 0, ease: 'power2.out' });
    }
  }

  private render(c: BeatContent): HTMLElement {
    const box = document.createElement('div');
    box.className = 'beat';
    const add = (cls: string, text: string, tag = 'p') => {
      const e = document.createElement(tag);
      e.className = cls;
      e.textContent = text;
      box.appendChild(e);
    };
    if (c.kicker) add('kicker', c.kicker, 'div');
    if (c.title) add('title', c.title, 'h1');
    for (const l of c.lines ?? []) add('line', l);
    if (c.quote) {
      add('quote', c.quote.text);
      if (c.quote.source) add('source', c.quote.source, 'div');
    }
    if (c.source) add('source', c.source, 'div');
    return box;
  }
}
