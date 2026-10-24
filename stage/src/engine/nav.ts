/** Pure navigation logic (no DOM, no three) so it can be unit-tested. */

export interface Pos {
  station: number;
  /** 0-based */
  beat: number;
}

export function next(pos: Pos, beatCounts: number[]): Pos | null {
  if (pos.beat + 1 < beatCounts[pos.station]) return { station: pos.station, beat: pos.beat + 1 };
  if (pos.station + 1 < beatCounts.length) return { station: pos.station + 1, beat: 0 };
  return null;
}

export function prev(pos: Pos, beatCounts: number[]): Pos | null {
  if (pos.beat > 0) return { station: pos.station, beat: pos.beat - 1 };
  if (pos.station > 0) return { station: pos.station - 1, beat: beatCounts[pos.station - 1] - 1 };
  return null;
}

export function clampPos(pos: Pos, beatCounts: number[]): Pos {
  const station = Math.min(Math.max(pos.station, 0), beatCounts.length - 1);
  const beat = Math.min(Math.max(pos.beat, 0), beatCounts[station] - 1);
  return { station, beat };
}

export interface Query {
  pos: Pos;
  debug: boolean;
  /** HUD boxes forced on, e.g. ?hud=1,3 (review helper) */
  hud: number[];
}

/**
 * ?station=9B&beat=2  -> station id (case-insensitive) and 1-based beat (1 = what you see on entering).
 * Unknown station falls back to the first one; out-of-range beats are clamped.
 */
export function parseQuery(search: string, ids: string[], beatCounts: number[]): Query {
  const q = new URLSearchParams(search);
  const wanted = (q.get('station') ?? '').trim().toUpperCase();
  const idx = ids.findIndex((id) => id.toUpperCase() === wanted);
  const beat = Number.parseInt(q.get('beat') ?? '1', 10);
  const pos = clampPos({ station: idx < 0 ? 0 : idx, beat: (Number.isFinite(beat) ? beat : 1) - 1 }, beatCounts);
  const hud = (q.get('hud') ?? '')
    .split(',')
    .map((x) => Number.parseInt(x, 10))
    .filter((n) => n >= 1 && n <= 3);
  return { pos, debug: q.get('debug') === '1', hud };
}

/** Station ids grouped into progress segments: "9A" and "9B" share segment "9". */
export function progressGroups(ids: string[]): { key: string; members: number[] }[] {
  const groups: { key: string; members: number[] }[] = [];
  ids.forEach((id, i) => {
    const key = id.replace(/[A-Za-z]+$/, '');
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.members.push(i);
    else groups.push({ key, members: [i] });
  });
  return groups;
}

export const NEXT_KEYS = ['ArrowRight', 'PageDown'];
export const PREV_KEYS = ['ArrowLeft', 'PageUp'];
