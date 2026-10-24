import type { Station, StationContent } from '../engine/types';
import { content } from '../content';

/**
 * Station factories, one per id. Each station is its own module so it can be loaded on demand
 * (only the current and the next station are built). Stations without a real scene yet use the empty room.
 */
export async function createStation(sc: StationContent, index: number): Promise<Station> {
  if (sc.id === '9A') {
    const { FrameStation } = await import('./FrameStation');
    return new FrameStation(sc.id, sc, content.frame.cells);
  }
  if (sc.id === '9B') {
    const { Station9B } = await import('./Station9B');
    return new Station9B(sc.id, sc, content.frame.cells);
  }
  const { RoomStation } = await import('./RoomStation');
  return new RoomStation(sc.id, 0.07 + index * 0.045, sc.beats.length);
}
