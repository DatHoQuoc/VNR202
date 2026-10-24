import type * as THREE from 'three';
import type { gsap } from 'gsap';
import type { Hud } from './hud';
import type { GameClient } from '../game/GameClient';
import type { Overlay } from './overlay';

/** 📜 văn kiện, 📘 giáo trình, 💬 cách hiểu của nhóm */
export type SourceTag = 'vanKien' | 'giaoTrinh' | 'nhom';

export interface TaggedText {
  tag: SourceTag;
  text: string;
  source?: string;
}

export interface JoinContent {
  title: string;
  codeLabel: string;
  countdownSec: number;
  /** shown while the room code is not known (no ?code= in the URL) */
  codeMissing: string;
}

export interface BeatContent {
  kicker?: string;
  title?: string;
  lines?: string[];
  quote?: { text: string; source?: string };
  source?: string;
  items?: TaggedText[];
  columns?: { heading: string; items: string[] }[];
  join?: JoinContent;
}

export interface StationBeat {
  overlay?: BeatContent;
  /** frame cells that are lit after this beat (9A / 9B) */
  lightCells?: string[];
  /** dark cells that pulse "decide together" */
  pulseCells?: string[];
  /** 9B: this beat shows live round n */
  live?: { round: number };
  /** 9B: this beat shows the finale board */
  finale?: boolean;
}

export interface StationContent {
  id: string;
  title: string;
  /** reconstructed scene: shows the "Mô phỏng minh họa" label */
  illustrative: boolean;
  beats: StationBeat[];
  /** station-specific text (typed where it is used) */
  extra?: unknown;
}

export interface UiText {
  hud: [string, string, string];
  illustrative: string;
  loading: string;
  noWebgl: { title: string; hint: string };
  progress: string;
  offline: string;
  tags: Record<SourceTag, string>;
}

export interface StageContent {
  ui: UiText;
  frame: { cells: { id: string; label: string }[] };
  stations: StationContent[];
}

export interface Ctx {
  renderer: THREE.WebGLRenderer;
  hud: Hud;
  overlay: Overlay;
  ui: UiText;
  content: StageContent;
  game: GameClient;
  /** a station asks the engine to move to one of its own beats (live game events); ignored when it is not the active station */
  requestBeat(stationId: string, beat: number): void;
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
  /** called after every navigation inside this station (animated or instant) with the 0-based beat */
  beatChanged?(beat: number, instant: boolean): void;
  update?(dt: number, t: number): void;
  resize?(aspect: number): void;
  exit(ctx: Ctx): void;
  dispose(): void;
}
