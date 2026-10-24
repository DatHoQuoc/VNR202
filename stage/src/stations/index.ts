import type { Station, StationContent } from '../engine/types';

/**
 * Station factories, one per id. Each station is its own module so it can be loaded on demand
 * (only the current and the next station are built). Stations without a real scene yet use the empty room.
 */
export async function createStation(sc: StationContent, index: number): Promise<Station> {
  const { RoomStation } = await import('./RoomStation');
  return new RoomStation(sc.id, 0.07 + index * 0.045, sc.beats.length);
}
