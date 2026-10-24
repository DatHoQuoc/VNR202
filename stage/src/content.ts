import raw from './content.json';
import type { StageContent } from './engine/types';

/** The station order of the gallery. 9A and 9B are two parts of station 9. */
export const STATION_IDS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9A', '9B', '10'];

export function validateContent(c: StageContent): StageContent {
  const ids = c.stations.map((s) => s.id);
  if (ids.join('|') !== STATION_IDS.join('|')) throw new Error(`stations must be ${STATION_IDS.join(', ')} in order, got ${ids.join(', ')}`);
  for (const s of c.stations) if (!s.beats.length) throw new Error(`station ${s.id} has no beats`);
  if (c.ui.hud.length !== 3) throw new Error('ui.hud needs exactly 3 labels');
  return c;
}

export const content: StageContent = validateContent(raw as unknown as StageContent);
