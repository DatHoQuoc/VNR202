import type * as THREE from 'three';
import type { gsap } from 'gsap';
import type { Hud } from './hud';
import type { Overlay } from './overlay';

export interface BeatContent {
  kicker?: string;
  title?: string;
  lines?: string[];
  quote?: { text: string; source?: string };
  source?: string;
}

export interface StationContent {
  id: string;
  title: string;
  /** reconstructed scene: shows the "Mô phỏng minh họa" label */
  illustrative: boolean;
  beats: { overlay?: BeatContent }[];
}

export interface UiText {
  hud: [string, string, string];
  illustrative: string;
  loading: string;
  noWebgl: { title: string; hint: string };
  progress: string;
}

export interface StageContent {
  ui: UiText;
  stations: StationContent[];
}

export interface Ctx {
  renderer: THREE.WebGLRenderer;
  hud: Hud;
  overlay: Overlay;
  ui: UiText;
}

/**
 * One station of the gallery. The engine owns navigation; the station owns its scene.
 *  build():   create geometry/materials (async, may load images). Called once, only for the current and next station.
 *  enter():   (re)create the beat timelines in their start state.
 *  beats():   one paused GSAP timeline per beat, in order. Beat i moves the scene from the state after i-1 to the state after i.
 *  exit():    stop anything running.
 *  dispose(): free geometries, materials and textures.
 */
export interface Station {
  readonly id: string;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  build(ctx: Ctx): Promise<void>;
  enter(ctx: Ctx): void;
  beats(): gsap.core.Timeline[];
  update?(dt: number, t: number): void;
  resize?(aspect: number): void;
  exit(ctx: Ctx): void;
  dispose(): void;
}
