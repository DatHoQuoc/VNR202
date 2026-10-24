import * as THREE from 'three';
import { gsap } from 'gsap';
import { BaseStation } from '../engine/BaseStation';
import type { Ctx, StationContent } from '../engine/types';

const CELL_W = 2.4;
const CELL_H = 1.3;
const BASE_Z = 12.6;
const LOOK_Y = 0.63;
const GAP = 0.16;
const CENTER_Y = 2.5;
const DARK = new THREE.Color(0x1b1611);
const GOLD = new THREE.Color(0x9c7a2e);
const RING_COLORS = [0xf2c35b, 0x7fd1ae, 0x7fb2e5, 0xe0645a];

interface Cell {
  id: string;
  /** 0 = dark, 1 = lit */
  v: { lit: number };
  panel: THREE.Mesh;
  glow: THREE.Mesh;
  label: THREE.Mesh;
  x: number;
  y: number;
}

function labelTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 80;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f3ead8';
  g.font = '700 40px system-ui, "Segoe UI", Roboto, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 42, 488);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The document frame of the gallery: six cells that light up one by one (stations 9A and 9B).
 * The cell names and the beats come from content.json. Lit/dark is the only thing the scene shows;
 * all text about the Cương lĩnh is HTML overlay.
 */
export class FrameStation extends BaseStation {
  protected readonly cells = new Map<string, Cell>();
  private rings: THREE.Mesh[] = [];
  private ringsV = { v: 0 };
  private readonly pulse = { amt: 0 };
  private pulseIds: string[] = [];
  private readonly cam = { z: BASE_Z };

  constructor(id: string, protected readonly sc: StationContent, private readonly cellDefs: { id: string; label: string }[]) {
    super(id);
  }

  async build(): Promise<void> {
    this.scene.background = new THREE.Color(0x0d0a08);
    this.scene.fog = new THREE.Fog(0x0d0a08, 14, 30);
    this.camera.fov = 40;
    this.camera.near = 0.1;
    this.camera.far = 60;

    // back wall (vertex-coloured, darker towards the corners) and floor with a baked pool of light
    const wallGeo = new THREE.PlaneGeometry(26, 12, 16, 8);
    const wp = wallGeo.attributes.position;
    const wc = new Float32Array(wp.count * 3);
    for (let i = 0; i < wp.count; i++) {
      const d = Math.hypot(wp.getX(i) / 13, (wp.getY(i) - 0.5) / 6);
      const l = 0.07 + 0.22 * Math.max(0, 1 - d * d);
      const c = new THREE.Color().setHSL(0.08, 0.3, l);
      wc.set([c.r, c.g, c.b], i * 3);
    }
    wallGeo.setAttribute('color', new THREE.BufferAttribute(wc, 3));
    const wall = new THREE.Mesh(wallGeo, new THREE.MeshBasicMaterial({ vertexColors: true }));
    wall.position.set(0, 3, -0.3);
    this.scene.add(wall);

    const floorGeo = new THREE.PlaneGeometry(26, 14, 26, 14);
    floorGeo.rotateX(-Math.PI / 2);
    const fp = floorGeo.attributes.position;
    const fc = new Float32Array(fp.count * 3);
    for (let i = 0; i < fp.count; i++) {
      const d = Math.hypot(fp.getX(i) / 7, (fp.getZ(i) - 1) / 5);
      const c = new THREE.Color().setHSL(0.08, 0.25, 0.03 + 0.16 * Math.exp(-d * d));
      fc.set([c.r, c.g, c.b], i * 3);
    }
    floorGeo.setAttribute('color', new THREE.BufferAttribute(fc, 3));
    const floor = new THREE.Mesh(floorGeo, new THREE.MeshBasicMaterial({ vertexColors: true }));
    floor.position.set(0, 0, 6.7);
    this.scene.add(floor);

    // frame
    const cols = 3;
    const rows = Math.ceil(this.cellDefs.length / cols);
    const innerW = cols * CELL_W + (cols + 1) * GAP;
    const innerH = rows * CELL_H + (rows + 1) * GAP;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(innerW + 0.3, innerH + 0.3, 0.2), new THREE.MeshLambertMaterial({ color: 0x3a2a17 }));
    frame.position.set(0, CENTER_Y, -0.1);
    this.scene.add(frame);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(innerW, innerH), new THREE.MeshBasicMaterial({ color: 0x0f0c09 }));
    back.position.set(0, CENTER_Y, 0.01);
    this.scene.add(back);

    const glowMat = (): THREE.MeshBasicMaterial =>
      new THREE.MeshBasicMaterial({ color: 0xf2c35b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.cellDefs.forEach((def, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = (col - (cols - 1) / 2) * (CELL_W + GAP);
      const y = CENTER_Y + ((rows - 1) / 2 - row) * (CELL_H + GAP);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(CELL_W, CELL_H), new THREE.MeshBasicMaterial({ color: DARK.clone() }));
      panel.position.set(x, y, 0.03);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(CELL_W + 0.1, CELL_H + 0.1), glowMat());
      glow.position.set(x, y, 0.02);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(CELL_W - 0.1, 0.38), new THREE.MeshBasicMaterial({ map: labelTexture(def.label), transparent: true, opacity: 0.55 }));
      label.position.set(x, y + CELL_H / 2 - 0.25, 0.04);
      this.scene.add(glow, panel, label);
      this.cells.set(def.id, { id: def.id, v: { lit: 0 }, panel, glow, label, x, y });
    });

    // four rings for the "Lực lượng" cell, built hidden
    const force = this.cells.get('luc-luong');
    if (force) {
      const radii = [0, 0.14, 0.27, 0.39, 0.5];
      this.rings = RING_COLORS.map((color, i) => {
        const m = new THREE.Mesh(
          i === 0 ? new THREE.CircleGeometry(radii[1], 32) : new THREE.RingGeometry(radii[i], radii[i + 1] - 0.012, 40),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }),
        );
        m.position.set(force.x, force.y - 0.27, 0.05);
        m.scale.setScalar(0.0001);
        this.scene.add(m);
        return m;
      });
    }

    // soft light on the frame (additive trapezoid, no real lights)
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 7.5, 9, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    shaft.position.set(0, 6.5, 2);
    this.scene.add(shaft);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.2));

    this.cam.z = BASE_Z;
    this.applyCam();
    this.applyCells();
  }

  // ---------- cells ----------
  isLit(id: string): boolean {
    return (this.cells.get(id)?.v.lit ?? 0) > 0.5;
  }

  /** Light a cell now or with a tween. */
  setLit(id: string, on: boolean, animate: boolean): void {
    const c = this.cells.get(id);
    if (!c) return;
    gsap.killTweensOf(c.v);
    const to = on ? 1 : 0;
    if (!animate) c.v.lit = to;
    else gsap.to(c.v, { lit: to, duration: 1, ease: 'power2.out' });
  }

  /** The Lực lượng rings (round 2). */
  setRings(on: boolean, animate: boolean): void {
    gsap.killTweensOf(this.ringsV);
    const apply = () => this.rings.forEach((m, i) => m.scale.setScalar(Math.max(0.0001, Math.min(1, this.ringsV.v * 4 - (3 - i)))));
    const to = on ? 1 : 0;
    if (!animate) {
      this.ringsV.v = to;
      apply();
    } else gsap.to(this.ringsV, { v: to, duration: 1.8, ease: 'power1.out', onUpdate: apply });
  }

  private applyCells(): void {
    for (const c of this.cells.values()) {
      const v = c.v.lit;
      (c.panel.material as THREE.MeshBasicMaterial).color.copy(DARK).lerp(GOLD, v);
      (c.glow.material as THREE.MeshBasicMaterial).opacity = 0.4 * v;
      (c.label.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.5 * v;
    }
  }

  private applyCam(): void {
    this.camera.position.set(0, LOOK_Y, this.cam.z);
    this.camera.lookAt(0, LOOK_Y, 0);
  }

  // ---------- beats ----------
  protected createBeats(_ctx: Ctx): gsap.core.Timeline[] {
    const beats = this.sc.beats;
    const everLit = new Set<string>();
    return beats.map((b, i) => {
      const tl = gsap.timeline({ paused: true });
      // slow push-in over the whole station (explicit from/to so rewinding is exact)
      const z0 = BASE_Z - 0.04 * Math.max(0, i - 1);
      const z1 = BASE_Z - 0.04 * i;
      tl.fromTo(this.cam, { z: z0 }, { z: z1, duration: i === 0 ? 0.001 : 1.2, ease: 'power1.inOut' }, 0);
      for (const id of b.lightCells ?? []) {
        const c = this.cells.get(id);
        if (!c || everLit.has(id)) continue;
        everLit.add(id);
        tl.fromTo(c.v, { lit: 0 }, { lit: 1, duration: i === 0 ? 0.001 : 1, ease: 'power2.out' }, i === 0 ? 0 : 0.2);
      }
      if (b.pulseCells?.length) {
        this.pulseIds = b.pulseCells;
        tl.fromTo(this.pulse, { amt: 0 }, { amt: 1, duration: 0.6 }, 0);
      }
      return tl;
    });
  }

  enter(ctx: Ctx): void {
    for (const c of this.cells.values()) c.v.lit = 0;
    this.pulse.amt = 0;
    this.setRings(false, false);
    super.enter(ctx);
    ctx.overlay.setDock(true);
  }

  exit(ctx: Ctx): void {
    super.exit();
    for (const c of this.cells.values()) gsap.killTweensOf(c.v);
    void ctx;
  }

  update(_dt: number, t: number): void {
    this.applyCells();
    // the "decide together" cells breathe while they are still dark
    const breathe = 0.08 + 0.08 * Math.sin(t * 2.4);
    for (const id of this.pulseIds) {
      const c = this.cells.get(id);
      if (c && c.v.lit < 0.5) (c.glow.material as THREE.MeshBasicMaterial).opacity = this.pulse.amt * breathe;
    }
    this.applyCam();
  }
}
