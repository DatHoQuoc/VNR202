'use client';
import type { CSSProperties } from 'react';
import { FINISH, HOME_LANE, RING_MAX, RING_SIZE, SEAT_GAP } from '@/game/engine';
import type { TeamColor } from '@/game/types';

export const COLOR_HEX: Record<TeamColor, string> = {
  red: '#c0392b', orange: '#e07b25', yellow: '#d4a017', green: '#2e8b57', blue: '#2f6fa3', purple: '#7e57a6'
};

const C = 320;
const RING_R = 232;
const STABLE_R = 288;
const rad = (cell: number): number => ((-90 + (cell * 360) / RING_SIZE) * Math.PI) / 180;
const polar = (angle: number, r: number): [number, number] => [C + r * Math.cos(angle), C + r * Math.sin(angle)];

export function positionOf(seat: number, progress: number, finish: number): [number, number] {
  const startAngle = rad(seat * SEAT_GAP);
  if (progress <= 0) return polar(startAngle, STABLE_R);
  if (progress <= RING_MAX) return polar(rad((seat * SEAT_GAP + progress) % RING_SIZE), RING_R);
  if (progress >= finish) return polar(startAngle, 22);
  return polar(startAngle, RING_R - 46 * (progress - RING_MAX));
}

export interface BoardHorse { teamId: string; seat: number; name: string; color: TeamColor; progress: number; active: boolean; shield: boolean; stunned: boolean }

export function Board({ horses, finish = FINISH }: { horses: BoardHorse[]; finish?: number }) {
  const bySeat = new Map(horses.map((h) => [h.seat, h]));
  const seatHex = (seat: number): string | null => { const h = bySeat.get(seat); return h ? COLOR_HEX[h.color] : null; };

  // Stack horses that share a square so none is hidden.
  const groups = new Map<string, BoardHorse[]>();
  for (const h of horses) {
    const [x, y] = positionOf(h.seat, h.progress, finish);
    const key = `${Math.round(x)}:${Math.round(y)}`;
    groups.set(key, [...(groups.get(key) ?? []), h]);
  }

  return (
    <div className="table-scene">
      <div className="table-top">
        <svg className="board" viewBox="0 0 640 640" role="img" aria-label="Bàn cờ cá ngựa sáu đội">
          <circle cx={C} cy={C} r={RING_R + 40} className="board-disc" />
          {Array.from({ length: 6 }, (_, seat) => {
            const color = seatHex(seat);
            const [sx, sy] = polar(rad(seat * SEAT_GAP), STABLE_R);
            return (
              <g key={`lane-${seat}`}>
                {Array.from({ length: HOME_LANE }, (_, j) => {
                  const [x, y] = polar(rad(seat * SEAT_GAP), RING_R - 46 * (j + 1));
                  return <g key={j}><circle cx={x} cy={y + 4} r={17} fill="#0003" /><circle cx={x} cy={y} r={17} className="cell lane" style={{ fill: color ?? '#e6e1d3', opacity: color ? 0.6 : 0.5 }} /></g>;
                })}
                <circle cx={sx} cy={sy} r={25} className="stable" style={{ stroke: color ?? '#c9c4b2' }} />
              </g>
            );
          })}
          {Array.from({ length: RING_SIZE }, (_, cell) => {
            const [x, y] = polar(rad(cell), RING_R);
            const isStart = cell % SEAT_GAP === 0;
            const color = isStart ? seatHex(cell / SEAT_GAP) : null;
            return (
              <g key={cell}>
                <circle cx={x} cy={y + 5} r={isStart ? 20 : 17} fill="#0003" />
                <circle cx={x} cy={y} r={isStart ? 20 : 17} className="cell" style={{ fill: color ?? (isStart ? '#d9d3c0' : '#fffdf8') }} />
                {isStart && <text x={x} y={y + 5} textAnchor="middle" className="cell-star">★</text>}
              </g>
            );
          })}
          <circle cx={C} cy={C + 7} r={52} fill="#0004" />
          <circle cx={C} cy={C} r={52} className="goal" />
          <text x={C} y={C - 4} textAnchor="middle" className="goal-text">ĐÍCH</text>
          <text x={C} y={C + 14} textAnchor="middle" className="goal-sub">3/2/1930</text>
        </svg>
        <div className="pawns">
          {horses.map((h) => {
            const [x, y] = positionOf(h.seat, h.progress, finish);
            const group = groups.get(`${Math.round(x)}:${Math.round(y)}`)!;
            const dx = (group.indexOf(h) - (group.length - 1) / 2) * 15;
            return (
              <div key={h.teamId} className={`pawn${h.active ? ' active' : ''}`} title={`${h.name}: ${h.progress}/${finish}`}
                style={{ left: `${((x + dx) / 640) * 100}%`, top: `${(y / 640) * 100}%`, '--c': COLOR_HEX[h.color] } as CSSProperties}>
                {(h.shield || h.stunned) && <span className="pawn-badge">{h.shield ? '🛡️' : '💤'}</span>}
                <span className="pawn-body"><i className="pawn-head" /><i className="pawn-neck" /><i className="pawn-base" /></span>
                <span className="pawn-shadow" />
                <span className="pawn-name">{h.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
