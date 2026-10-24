import { content, STATION_IDS, validateContent } from '../stage/src/content';
import { clampPos, next, parseQuery, prev, progressGroups } from '../stage/src/engine/nav';

const counts = content.stations.map((s) => s.beats.length);
const ids = content.stations.map((s) => s.id);

describe('stage content', () => {
  it('has every station in the gallery order, each with at least one beat', () => {
    expect(ids).toEqual(STATION_IDS);
    expect(counts.every((n) => n >= 1)).toBe(true);
    expect(content.ui.hud).toHaveLength(3);
  });

  it('rejects a wrong station order or an empty station', () => {
    const swapped = { ...content, stations: [content.stations[1], content.stations[0], ...content.stations.slice(2)] };
    expect(() => validateContent(swapped)).toThrow(/in order/);
    const empty = { ...content, stations: content.stations.map((s, i) => (i === 3 ? { ...s, beats: [] } : s)) };
    expect(() => validateContent(empty)).toThrow(/no beats/);
  });
});

describe('beat navigation', () => {
  const c = [2, 3, 1];

  it('moves through beats, then to the next station, and stops at the ends', () => {
    expect(next({ station: 0, beat: 0 }, c)).toEqual({ station: 0, beat: 1 });
    expect(next({ station: 0, beat: 1 }, c)).toEqual({ station: 1, beat: 0 });
    expect(next({ station: 1, beat: 2 }, c)).toEqual({ station: 2, beat: 0 });
    expect(next({ station: 2, beat: 0 }, c)).toBeNull();
  });

  it('goes back to the last beat of the previous station', () => {
    expect(prev({ station: 1, beat: 1 }, c)).toEqual({ station: 1, beat: 0 });
    expect(prev({ station: 1, beat: 0 }, c)).toEqual({ station: 0, beat: 1 });
    expect(prev({ station: 0, beat: 0 }, c)).toBeNull();
  });

  it('walking forward then back returns to the start', () => {
    let p = { station: 0, beat: 0 };
    const seen = [p];
    for (let n = next(p, c); n; n = next(n, c)) seen.push(n);
    expect(seen).toHaveLength(6);
    let q = seen[seen.length - 1];
    for (let i = seen.length - 2; i >= 0; i--) {
      q = prev(q, c)!;
      expect(q).toEqual(seen[i]);
    }
  });

  it('clamps positions', () => {
    expect(clampPos({ station: 9, beat: 9 }, c)).toEqual({ station: 2, beat: 0 });
    expect(clampPos({ station: -1, beat: -4 }, c)).toEqual({ station: 0, beat: 0 });
  });
});

describe('review URL parameters', () => {
  it('?station=9B&beat=2 jumps to station 9B, second beat (beats are 1-based)', () => {
    const q = parseQuery('?station=9b&beat=2&debug=1&hud=1,3', ids, counts);
    expect(ids[q.pos.station]).toBe('9B');
    expect(q.pos.beat).toBe(1);
    expect(q.debug).toBe(true);
    expect(q.hud).toEqual([1, 3]);
  });

  it('falls back safely on junk', () => {
    expect(parseQuery('', ids, counts).pos).toEqual({ station: 0, beat: 0 });
    expect(parseQuery('?station=nope&beat=x', ids, counts).pos).toEqual({ station: 0, beat: 0 });
    expect(parseQuery('?station=10&beat=99', ids, counts).pos.beat).toBe(counts[ids.indexOf('10')] - 1);
    expect(parseQuery('?hud=0,4,2', ids, counts).hud).toEqual([2]);
  });
});

describe('progress bar grouping', () => {
  it('shows 11 segments: 9A and 9B share one', () => {
    const g = progressGroups(ids);
    expect(g).toHaveLength(11);
    expect(g.find((x) => x.key === '9')!.members).toEqual([ids.indexOf('9A'), ids.indexOf('9B')]);
  });
});
