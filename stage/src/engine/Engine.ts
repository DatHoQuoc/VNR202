import * as THREE from 'three';
import { gsap } from 'gsap';
import { Hud } from './hud';
import { StationLoader } from './loader';
import { NEXT_KEYS, PREV_KEYS, next, prev, type Pos, type Query } from './nav';
import { Overlay } from './overlay';
import type { Ctx, Station, StageContent } from './types';

const DESIGN_W = 1920;
const DESIGN_H = 1080;

export class Engine {
  readonly ctx: Ctx;
  private readonly loader: StationLoader;
  private readonly beatCounts: number[];
  private readonly ids: string[];
  private active: Station | null = null;
  private pos: Pos = { station: -1, beat: 0 };
  private token = 0;
  private readonly clock = new THREE.Clock();
  private frames = 0;
  private fps = 0;
  private fpsAt = 0;
  private debugEl: HTMLElement | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly frame: HTMLElement,
    private readonly fade: HTMLElement,
    private readonly content: StageContent,
    private readonly query: Query,
    createStation: (sc: StageContent['stations'][number], index: number) => Promise<Station>,
  ) {
    // no antialiasing tricks beyond MSAA, no shadow maps: ordinary integrated GPUs must keep 60 fps
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'default' });
    renderer.shadowMap.enabled = false;
    this.ids = content.stations.map((s) => s.id);
    this.beatCounts = content.stations.map((s) => s.beats.length);
    const hud = new Hud(frame, content.ui, this.ids);
    const overlay = new Overlay(frame);
    this.ctx = { renderer, hud, overlay, ui: content.ui };
    this.loader = new StationLoader(this.ctx, content.stations, createStation);

    if (query.debug) {
      this.debugEl = document.createElement('div');
      this.debugEl.className = 'debug';
      frame.appendChild(this.debugEl);
    }
    query.hud.forEach((n) => hud.setAnswered(n as 1 | 2 | 3, true));

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.resize();
  }

  async start(): Promise<void> {
    await this.goto(this.query.pos, true);
    document.body.dataset.ready = '1';
    this.clock.start();
    this.ctx.renderer.setAnimationLoop(() => this.tick());
  }

  // ---------- navigation ----------
  private onKey(e: KeyboardEvent): void {
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    const dir = NEXT_KEYS.includes(e.key) ? next : PREV_KEYS.includes(e.key) ? prev : null;
    if (!dir) return;
    e.preventDefault();
    const target = dir(this.pos, this.beatCounts);
    if (target) void this.goto(target, false);
  }

  async goto(target: Pos, instant: boolean): Promise<void> {
    const token = ++this.token;
    const sameStation = this.active && target.station === this.pos.station;
    const station = this.content.stations[target.station];
    const beatContent = station.beats[target.beat]?.overlay;

    if (sameStation) {
      const tls = this.active!.beats();
      for (const t of tls) if (t.isActive()) t.progress(1); // finish a running beat instead of losing the click
      if (!instant && target.beat === this.pos.beat + 1) tls[target.beat].play(0);
      else this.applyInstant(target.beat);
      this.ctx.overlay.show(beatContent, instant || target.beat !== this.pos.beat + 1);
      this.setPos(target);
      return;
    }

    // another station: fade out, swap, fade in
    if (!instant && this.active) await this.fadeTo(1, 0.35);
    if (token !== this.token) return;
    this.active?.exit(this.ctx);
    const slow = window.setTimeout(() => this.showLoading(true), 150);
    const st = await this.loader.ensure(target.station);
    window.clearTimeout(slow);
    this.showLoading(false);
    if (token !== this.token) return;
    st.enter(this.ctx);
    this.active = st;
    this.applyInstant(target.beat, st);
    st.resize?.(this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight));
    this.ctx.hud.setStation(target.station);
    this.ctx.hud.setIllustrative(station.illustrative);
    this.ctx.overlay.show(beatContent, true);
    this.setPos(target);
    // keep only the current and the next station alive; prepare the next one when idle
    this.loader.retain([target.station, target.station + 1]);
    const nextIdx = target.station + 1;
    if (nextIdx < this.ids.length) {
      const prep = () => void this.loader.ensure(nextIdx).catch(() => undefined);
      const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback;
      if (idle) idle.call(window, prep);
      else setTimeout(prep, 300);
    }
    if (!instant) await this.fadeTo(0, 0.5);
    else this.fade.style.opacity = '0';
  }

  /** Jump the station to the state after beat `b` (also used to go backwards). */
  private applyInstant(b: number, st: Station | null = this.active): void {
    if (!st) return;
    const tls = st.beats();
    for (let i = tls.length - 1; i >= 0; i--) tls[i].progress(0);
    for (let i = 0; i <= b && i < tls.length; i++) tls[i].progress(1);
  }

  private setPos(p: Pos): void {
    this.pos = p;
    document.body.dataset.station = this.ids[p.station];
    document.body.dataset.beat = String(p.beat + 1);
  }

  private fadeTo(opacity: number, duration: number): Promise<void> {
    return new Promise((resolve) => gsap.to(this.fade, { opacity, duration, onComplete: () => resolve() }));
  }

  private loadingEl: HTMLElement | null = null;
  private showLoading(on: boolean): void {
    if (on && !this.loadingEl) {
      this.loadingEl = document.createElement('div');
      this.loadingEl.className = 'loading';
      this.loadingEl.textContent = this.content.ui.loading;
      this.frame.appendChild(this.loadingEl);
    } else if (!on && this.loadingEl) {
      this.loadingEl.remove();
      this.loadingEl = null;
    }
  }

  // ---------- render ----------
  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.ctx.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.ctx.renderer.setSize(w, h, false);
    const s = Math.min(w / DESIGN_W, h / DESIGN_H);
    this.frame.style.transform = `translate(${(-DESIGN_W / 2) * s}px, ${(-DESIGN_H / 2) * s}px) scale(${s})`;
    this.active?.resize?.(w / h);
  }

  private tick(): void {
    const dt = this.clock.getDelta();
    const t = this.clock.elapsedTime;
    const st = this.active;
    if (st) {
      st.update?.(dt, t);
      this.ctx.renderer.render(st.scene, st.camera);
    }
    this.frames++;
    if (t - this.fpsAt >= 0.5) {
      this.fps = Math.round(this.frames / (t - this.fpsAt));
      this.frames = 0;
      this.fpsAt = t;
      if (this.debugEl && st) {
        const info = this.ctx.renderer.info;
        this.debugEl.textContent =
          `${this.fps} fps\ntrạm ${this.ids[this.pos.station]} · nhịp ${this.pos.beat + 1}/${this.beatCounts[this.pos.station]}\n` +
          `draw ${info.render.calls} · tam giác ${info.render.triangles}\nbộ nhớ: ${info.memory.geometries} hình, ${info.memory.textures} ảnh\nđang giữ: ${this.loader.alive.map((i) => this.ids[i]).join(', ')}`;
      }
    }
  }
}
