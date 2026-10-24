import * as THREE from 'three';
import { gsap } from 'gsap';
import { BaseStation } from '../engine/BaseStation';
import type { Ctx } from '../engine/types';

interface Waypoint { p: [number, number, number]; look: [number, number, number] }

const WAYPOINTS: Waypoint[] = [
  { p: [0, 1.7, 7.5], look: [0, 1.9, -8] },
  { p: [-1.6, 1.7, 3.2], look: [1.2, 1.8, -8] },
  { p: [1.8, 1.7, -1], look: [-1.2, 1.8, -8] },
  { p: [0, 1.7, -3.5], look: [0, 1.9, -8] },
];

/** Gallery room with baked-looking light: vertex-coloured surfaces, no real-time lights or shadows. */
export class RoomStation extends BaseStation {
  private dust!: THREE.Points;
  /** tweened camera rig, applied to the camera every frame */
  private readonly rig = { px: 0, py: 1.7, pz: 7.5, tx: 0, ty: 1.9, tz: -8 };

  constructor(id: string, private readonly hue: number, private readonly beatCount: number) {
    super(id);
  }

  async build(): Promise<void> {
    const W = 12, H = 5, D = 16;
    this.scene.background = new THREE.Color().setHSL(this.hue, 0.25, 0.04);
    this.scene.fog = new THREE.Fog(this.scene.background, 14, 30);

    const pools = [new THREE.Vector3(-3, 0, -2), new THREE.Vector3(3, 0, -5), new THREE.Vector3(0, 0, 3)];
    const base = new THREE.Color().setHSL(this.hue, 0.28, 0.5);

    // floor, lit by baked pools of light
    const floorGeo = new THREE.PlaneGeometry(W, D, 24, 32);
    floorGeo.rotateX(-Math.PI / 2);
    const fpos = floorGeo.attributes.position;
    const fcol = new Float32Array(fpos.count * 3);
    for (let i = 0; i < fpos.count; i++) {
      const v = new THREE.Vector3(fpos.getX(i), 0, fpos.getZ(i));
      let l = 0.22;
      for (const p of pools) l += 0.7 * Math.exp(-p.distanceToSquared(v) / 9);
      const c = base.clone().multiplyScalar(Math.min(l, 1));
      fcol.set([c.r, c.g, c.b], i * 3);
    }
    floorGeo.setAttribute('color', new THREE.BufferAttribute(fcol, 3));
    this.scene.add(new THREE.Mesh(floorGeo, new THREE.MeshBasicMaterial({ vertexColors: true })));

    // walls: darker towards the ceiling
    const wall = (w: number, h: number, pos: [number, number, number], rotY: number, tone: number) => {
      const g = new THREE.PlaneGeometry(w, h, 1, 6);
      const p = g.attributes.position;
      const col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const t = (p.getY(i) + h / 2) / h; // 0 bottom .. 1 top
        const c = new THREE.Color().setHSL(this.hue, 0.22, 0.1 + tone * (0.34 - 0.22 * t));
        col.set([c.r, c.g, c.b], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true }));
      m.position.set(...pos);
      m.rotation.y = rotY;
      this.scene.add(m);
    };
    wall(W, H, [0, H / 2, -D / 2], 0, 1);
    wall(D, H, [-W / 2, H / 2, 0], Math.PI / 2, 0.8);
    wall(D, H, [W / 2, H / 2, 0], -Math.PI / 2, 0.8);
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(this.hue, 0.2, 0.05) }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = H;
    this.scene.add(ceiling);

    // ceiling beams and a plinth along the walls
    const wood = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(this.hue, 0.3, 0.16) });
    for (let z = -7; z <= 7; z += 3.5) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(W, 0.25, 0.3), wood);
      beam.position.set(0, H - 0.12, z);
      this.scene.add(beam);
    }

    // empty frames on the back wall and pedestals (content comes with each station)
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x2a1e12 });
    const canvasMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(this.hue, 0.15, 0.2) });
    for (const x of [-3.6, 0, 3.6]) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.2, 0.12), frameMat);
      frame.position.set(x, 2.5, -D / 2 + 0.07);
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.9), canvasMat);
      inner.position.set(x, 2.5, -D / 2 + 0.14);
      this.scene.add(frame, inner);
    }
    const stone = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(this.hue, 0.1, 0.45) });
    for (const [x, z] of [[-3, -2], [3, -5], [0, 3]] as const) {
      const ped = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1.1), stone);
      ped.position.set(x, 0.45, z);
      this.scene.add(ped);
    }

    // light shafts (additive, no real lights)
    const shaftMat = new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const p of pools) {
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 1.5, H, 16, 1, true), shaftMat);
      cone.position.set(p.x, H / 2, p.z);
      this.scene.add(cone);
    }
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const key = new THREE.DirectionalLight(0xffe9c4, 1.2);
    key.position.set(2, 6, 4);
    this.scene.add(key);

    // drifting dust
    const n = 160;
    const dpos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) dpos.set([(Math.random() - 0.5) * W, Math.random() * H, (Math.random() - 0.5) * D], i * 3);
    const dgeo = new THREE.BufferGeometry();
    dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
    this.dust = new THREE.Points(dgeo, new THREE.PointsMaterial({ color: 0xfff1cf, size: 0.04, transparent: true, opacity: 0.5, depthWrite: false }));
    this.scene.add(this.dust);

    this.applyRig();
  }

  protected createBeats(_ctx: Ctx): gsap.core.Timeline[] {
    const r = this.rig;
    const wp = (i: number) => WAYPOINTS[i % WAYPOINTS.length];
    return Array.from({ length: this.beatCount }, (_, i) => {
      const to = wp(i);
      const from = i === 0 ? to : wp(i - 1);
      const tl = gsap.timeline({ paused: true });
      tl.fromTo(
        r,
        { px: from.p[0], py: from.p[1], pz: from.p[2], tx: from.look[0], ty: from.look[1], tz: from.look[2] },
        { px: to.p[0], py: to.p[1], pz: to.p[2], tx: to.look[0], ty: to.look[1], tz: to.look[2], duration: i === 0 ? 0.001 : 1.6, ease: 'power2.inOut' },
      );
      return tl;
    });
  }

  update(dt: number, t: number): void {
    this.applyRig();
    this.dust.rotation.y = t * 0.01;
    this.dust.position.y = Math.sin(t * 0.2) * 0.1;
    void dt;
  }

  private applyRig(): void {
    const r = this.rig;
    this.camera.position.set(r.px, r.py, r.pz);
    this.camera.lookAt(r.tx, r.ty, r.tz);
  }
}
