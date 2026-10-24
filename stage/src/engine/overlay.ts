import { gsap } from 'gsap';
import { joinAddress, roomCode } from '../game/join';
import type { BeatContent, JoinContent, TaggedText, UiText } from './types';

/** HTML text layer. Everything is built with textContent; the text comes from content.json. */
export class Overlay {
  private current: HTMLElement | null = null;
  private readonly killers = new Map<HTMLElement, () => void>();

  constructor(readonly root: HTMLElement, readonly ui: UiText) {}

  /** Docked layout: the text sits below a 3D frame that occupies the top of the screen (9A, 9B). */
  setDock(on: boolean): void {
    this.root.classList.toggle('dock', on);
  }

  /** Replace the beat text. `instant` skips the cross-fade (used for jumps and screenshots). */
  show(content: BeatContent | undefined, instant: boolean): void {
    const old = this.current;
    this.current = content ? this.render(content) : null;
    if (old) {
      const done = () => this.remove(old);
      if (instant) done();
      else gsap.to(old, { opacity: 0, y: -12, duration: 0.25, onComplete: done });
    }
    if (this.current) {
      this.root.appendChild(this.current);
      if (!instant) gsap.fromTo(this.current, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, delay: old ? 0.2 : 0, ease: 'power2.out' });
    }
  }

  private remove(el: HTMLElement): void {
    this.killers.get(el)?.();
    this.killers.delete(el);
    el.remove();
  }

  /** Tagged line: source chip, the text exactly as written in content.json, and its reference. */
  tagged(t: TaggedText, cls = 'item'): HTMLElement {
    const row = document.createElement('div');
    row.className = cls;
    const chip = document.createElement('span');
    chip.className = `chip tag-${t.tag}`;
    chip.textContent = this.ui.tags[t.tag];
    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = t.text;
    row.append(chip, text);
    if (t.source) {
      const src = document.createElement('span');
      src.className = 'src';
      src.textContent = `(${t.source})`;
      row.appendChild(src);
    }
    return row;
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
    for (const it of c.items ?? []) box.appendChild(this.tagged(it));
    if (c.columns) {
      const cols = document.createElement('div');
      cols.className = 'cols';
      for (const col of c.columns) {
        const d = document.createElement('div');
        d.className = 'col';
        const h = document.createElement('h2');
        h.textContent = col.heading;
        const ul = document.createElement('ul');
        for (const it of col.items) {
          const li = document.createElement('li');
          li.textContent = it;
          ul.appendChild(li);
        }
        d.append(h, ul);
        cols.appendChild(d);
      }
      box.appendChild(cols);
    }
    if (c.source) add('source', c.source, 'div');
    if (c.join) {
      box.classList.add('join');
      this.renderJoin(box, c.join);
    }
    return box;
  }

  /** "Open your laptop" screen: join address, room code and a countdown. */
  private renderJoin(box: HTMLElement, j: JoinContent): void {
    const t = document.createElement('h1');
    t.className = 'title';
    t.textContent = j.title;
    const addr = document.createElement('div');
    addr.className = 'join-addr';
    addr.textContent = joinAddress();
    const codeLabel = document.createElement('div');
    codeLabel.className = 'join-label';
    codeLabel.textContent = j.codeLabel;
    const code = document.createElement('div');
    const known = roomCode();
    code.className = 'join-code' + (known ? '' : ' missing');
    code.textContent = known ?? j.codeMissing;
    const clock = document.createElement('div');
    clock.className = 'join-clock';
    box.append(t, addr, codeLabel, code, clock);

    const fmt = (s: number) => {
      const total = Math.max(0, Math.ceil(s));
      return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
    };
    const state = { left: j.countdownSec };
    clock.textContent = fmt(state.left);
    const tween = gsap.to(state, {
      left: 0,
      duration: j.countdownSec,
      ease: 'none',
      onUpdate: () => {
        clock.textContent = fmt(state.left);
        clock.classList.toggle('low', state.left <= 10);
      },
    });
    this.killers.set(box, () => tween.kill());
  }
}
