import { gsap } from 'gsap';
import type { GameClient, RoundData } from '../game/GameClient';
import type { Overlay } from '../engine/overlay';
import type { SourceTag, TaggedText } from '../engine/types';

export interface RoundReveal {
  cell?: string;
  box?: number;
  items?: TaggedText[];
  rings?: { name: string; text: string; tag: SourceTag }[];
  source?: string;
  answer?: { tag: SourceTag; text: string };
}

export interface NineBText {
  lowerScreen: string;
  step: Record<string, string>;
  waiting: string;
  voided: string;
  loading: string;
  comparison: string;
  distributionTitle: string;
  answerLabel: string;
  rounds: Record<string, RoundReveal>;
  finale: { title: string; rank: string; team: string; score: string; round: string; hidden: string };
}

const RING_CSS = ['#f2c35b', '#7fd1ae', '#7fb2e5', '#e0645a'];

type View = 'waiting' | 'pick' | 'guess' | 'loading' | 'reveal' | 'voided';
const fill = (tpl: string, vars: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
const num = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1));

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * Live panel of station 9B. Question, options and numbers come from the server (public state and
 * /stage/rounds/:n); the fixed texts come from content.json. Built with textContent only.
 */
export class LiveView {
  private el: HTMLElement | null = null;
  private mode: { kind: 'round'; n: number } | { kind: 'finale' } | null = null;
  private key = '';
  private shownRanks = new Set<number>();

  constructor(private readonly overlay: Overlay, private readonly game: GameClient, private readonly t: NineBText) {}

  showRound(n: number): void {
    this.mode = { kind: 'round', n };
    this.key = '';
    this.update(true);
  }

  showFinale(): void {
    this.mode = { kind: 'finale' };
    this.key = '';
    this.shownRanks = new Set();
    this.update(true);
  }

  hide(): void {
    this.mode = null;
    this.unmount();
  }

  destroy(): void {
    this.hide();
  }

  /** Re-render when the live state changed. `instant` = no animation (jumps, first paint). */
  update(instant = false): void {
    if (!this.mode) return;
    if (this.mode.kind === 'finale') return this.updateFinale(instant);
    const n = this.mode.n;
    const view = this.viewFor(n);
    const data = this.game.rounds.get(n);
    const key = `r${n}:${view}:${view === 'reveal' ? JSON.stringify(data) : this.game.state?.round?.step1.prompt}`;
    if (key === this.key) return;
    const prevView = this.key.split(':')[1];
    this.key = key;
    const animate = !instant && view === 'reveal' && (prevView === 'guess' || prevView === 'loading' || prevView === 'pick');
    this.mount(this.buildRound(n, view, data, animate));
  }

  // ---------- which view ----------
  private viewFor(n: number): View {
    const st = this.game.state;
    if (!st || st.phase === 'lobby' || st.phase === 'joining' || !st.round || st.round.n < n) return 'waiting';
    if (st.round.n === n) {
      if (st.round.phase === 'pick') return 'pick';
      if (st.round.phase === 'guess') return 'guess';
      if (st.round.phase === 'idle') return 'waiting';
    }
    if (this.game.rounds.has(n)) return 'reveal';
    if (st.round.n === n && st.round.voided) return 'voided';
    return this.game.roundsReady && st.round.n > n ? 'voided' : 'loading';
  }

  // ---------- round views ----------
  private buildRound(n: number, view: View, data: RoundData | undefined, animate: boolean): HTMLElement {
    const root = el('div', `live view-${view}`);
    const st = this.game.state;
    const live = st?.round && st.round.n === n ? st.round : null;
    const labels = this.game.labels.get(n);
    const title = live?.title ?? labels?.title ?? data?.title ?? '';
    const kicker = (extra = '') => el('div', 'kicker', `Vòng ${n}${title ? ' · ' + title : ''}${extra}`);

    if (view === 'waiting') {
      root.append(kicker(), el('div', 'center-msg', fill(this.t.waiting, { n })));
      return root;
    }
    if (view === 'voided') {
      root.append(kicker(), el('div', 'center-msg', fill(this.t.voided, { n })));
      return root;
    }
    if (view === 'loading') {
      root.append(kicker(), el('div', 'center-msg', this.t.loading));
      return root;
    }

    if (view === 'pick' || view === 'guess') {
      const r = live!;
      root.append(kicker(' · ' + this.t.step[view === 'pick' ? '1' : '2']));
      root.append(el('h1', 'q', view === 'pick' ? r.step1.prompt : r.step2.ask));
      const opts = el('div', view === 'pick' ? 'opts' : 'opts small');
      for (const [k, text] of Object.entries(r.step1.options)) {
        const o = el('div', 'opt');
        o.append(el('span', 'letter', k), el('span', 'otext', text));
        opts.appendChild(o);
      }
      root.append(opts, el('div', 'lower', this.t.lowerScreen));
      return root;
    }

    // reveal
    const d = data!;
    const reveal = this.t.rounds[String(n)] ?? {};
    root.append(kicker());
    const grid = el('div', 'rev');
    const left = el('div', 'rev-left');
    left.appendChild(el('h2', '', this.t.distributionTitle));
    const options = labels?.options ?? {};
    const fills: { bar: HTMLElement; pct: HTMLElement; v: number }[] = [];
    for (const k of Object.keys(d.distribution).sort()) {
      const v = d.distribution[k];
      const row = el('div', 'bar' + (k === d.target ? ' hot' : '') + (d.correctOption === k ? ' correct' : ''));
      row.appendChild(el('span', 'l', k));
      const track = el('div', 'track');
      const f = el('div', 'fill');
      track.appendChild(f);
      if (options[k]) track.appendChild(el('span', 'name', options[k]));
      row.appendChild(track);
      const pct = el('span', 'v', `${num(v)}%`);
      row.appendChild(pct);
      left.appendChild(row);
      fills.push({ bar: f, pct, v });
    }
    if (d.comparison) left.appendChild(el('div', 'compare', fill(this.t.comparison, { x: num(d.comparison.x), y: num(d.comparison.y) })));
    grid.appendChild(left);

    const right = el('div', 'rev-right');
    if (reveal.rings) {
      reveal.rings.forEach((r, i) => {
        const row = el('div', 'ring');
        const sw = el('span', 'swatch');
        sw.style.background = RING_CSS[i % RING_CSS.length];
        const txt = el('span', 'text');
        txt.append(el('strong', '', r.name + ': '), document.createTextNode(r.text));
        row.append(sw, txt, this.chip(r.tag));
        right.appendChild(row);
      });
    }
    for (const it of reveal.items ?? []) right.appendChild(this.overlay.tagged(it, 'item sm'));
    if (reveal.source) right.appendChild(el('div', 'source', `(${reveal.source})`));
    if (reveal.answer && d.correctOption) {
      const row = el('div', 'item sm answer');
      row.append(el('span', 'ans', `${d.correctOption} —`), this.chip(reveal.answer.tag), el('span', 'text', reveal.answer.text));
      right.appendChild(row);
    }
    grid.appendChild(right);
    root.appendChild(grid);

    const run = () => {
      for (const f of fills) {
        f.bar.style.width = `${Math.max(0, Math.min(100, f.v))}%`;
      }
    };
    if (animate) {
      fills.forEach((f, i) => {
        f.bar.style.width = '0%';
        const o = { v: 0 };
        gsap.to(f.bar, { width: `${Math.max(0, Math.min(100, f.v))}%`, duration: 1.1, delay: 0.15 * i, ease: 'power2.out' });
        gsap.to(o, { v: f.v, duration: 1.1, delay: 0.15 * i, ease: 'power2.out', onUpdate: () => (f.pct.textContent = `${num(o.v)}%`) });
      });
      gsap.from(right.children, { opacity: 0, y: 14, duration: 0.6, delay: 1.2, stagger: 0.18 });
    } else run();
    return root;
  }

  private chip(tag: SourceTag): HTMLElement {
    const c = el('span', `chip tag-${tag}`);
    c.textContent = this.overlay.ui.tags[tag];
    return c;
  }

  // ---------- finale ----------
  private updateFinale(instant: boolean): void {
    const f = this.game.state?.finale ?? null;
    const t = this.t.finale;
    const rows = f ? f.standings.length : this.game.state?.teams ?? 6;
    const key = `finale:${rows}`;
    if (key !== this.key || !this.el) {
      this.key = key;
      const root = el('div', 'live finale');
      root.appendChild(el('h1', 'q', t.title));
      const body = el('div', 'fin-body');
      const board = el('div', 'board');
      for (let i = 1; i <= rows; i++) {
        const row = el('div', 'frow');
        row.dataset.rank = String(i);
        row.append(el('span', 'rk', fill(t.rank, { r: i })), el('span', 'tm', t.hidden), el('span', 'sc', ''));
        board.appendChild(row);
      }
      body.appendChild(board);
      body.appendChild(el('div', 'top1'));
      root.appendChild(body);
      this.shownRanks = new Set();
      this.mount(root);
    }
    if (!f) return;
    const root = this.el!;
    for (const s of f.standings) {
      const row = root.querySelector<HTMLElement>(`.frow[data-rank="${s.rank}"]`);
      if (!row) continue;
      const known = s.team !== null;
      if (known && !this.shownRanks.has(s.rank)) {
        this.shownRanks.add(s.rank);
        row.classList.add('on');
        row.querySelector('.tm')!.textContent = fill(t.team, { t: s.team! });
        row.querySelector('.sc')!.textContent = s.score === null ? '' : fill(t.score, { s: num(s.score) });
        if (!instant) gsap.fromTo(row, { scale: 0.92, opacity: 0.2 }, { scale: 1, opacity: 1, duration: 0.7, ease: 'back.out(2)' });
        if (s.rank === 1 && s.perRound) {
          const top = root.querySelector<HTMLElement>('.top1')!;
          top.textContent = '';
          top.classList.add('on');
          top.appendChild(el('div', 'top1-team', fill(t.team, { t: s.team! })));
          for (const pr of s.perRound) {
            const line = el('div', 'pr');
            line.append(el('span', '', fill(t.round, { r: pr.round })), el('strong', '', num(pr.score)));
            top.appendChild(line);
          }
          if (!instant) gsap.from(top, { opacity: 0, x: 40, duration: 0.8, delay: 0.3 });
        }
      }
    }
  }

  // ---------- mounting ----------
  private mount(node: HTMLElement): void {
    this.unmount();
    this.el = node;
    this.overlay.root.appendChild(node);
  }

  private unmount(): void {
    this.el?.remove();
    this.el = null;
  }
}
