import * as THREE from 'three';
import type { gsap } from 'gsap';
import type { Ctx, Station } from './types';

/** Shared plumbing: scene + camera, timeline bookkeeping and disposal of everything in the scene. */
export abstract class BaseStation implements Station {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
  protected timelines: gsap.core.Timeline[] = [];

  constructor(readonly id: string) {}

  abstract build(ctx: Ctx): Promise<void>;
  protected abstract createBeats(ctx: Ctx): gsap.core.Timeline[];

  enter(ctx: Ctx): void {
    this.killTimelines();
    this.timelines = this.createBeats(ctx);
  }

  beats(): gsap.core.Timeline[] {
    return this.timelines;
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  exit(_ctx?: Ctx): void {
    this.killTimelines();
  }

  dispose(): void {
    this.killTimelines();
    const seen = new Set<unknown>();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !seen.has(m.geometry)) {
        seen.add(m.geometry);
        m.geometry.dispose();
      }
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        if (seen.has(mat)) continue;
        seen.add(mat);
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
        mat.dispose();
      }
    });
    this.scene.clear();
  }

  private killTimelines(): void {
    for (const t of this.timelines) t.kill();
    this.timelines = [];
  }
}
