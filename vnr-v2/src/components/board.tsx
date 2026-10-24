'use client';
import type { CSSProperties } from 'react';
import { FINISH, HOME_LANE, RING_MAX, RING_SIZE, SEAT_GAP } from '@/game/engine';
import { TEAM_COLORS, type TeamColor } from '@/game/types';

export const COLOR_HEX: Record<TeamColor, string> = {
  red: '#d9453a', orange: '#f08a24', yellow: '#f0c020', green: '#35a05f', blue: '#2f7fc4', purple: '#8a5cc2'
};

const C = 320;
const RING_R = 232;
const STABLE_R = 282;
const LANE_STEP = 40;
const rad = (cell: number): number => ((-90 + (cell * 360) / RING_SIZE) * Math.PI) / 180;
const polar = (angle: number, r: number): [number, number] => [C + r * Math.cos(angle), C + r * Math.sin(angle)];
const seatAngle = (seat: number): number => rad(seat * SEAT_GAP);

export function positionOf(seat: number, progress: number, finish: number): [number, number] {
  if (progress <= 0) return polar(seatAngle(seat), STABLE_R);
  if (progress <= RING_MAX) return polar(rad((seat * SEAT_GAP + progress) % RING_SIZE), RING_R);
  if (progress >= finish) return polar(seatAngle(seat), 20);
  return polar(seatAngle(seat), RING_R - LANE_STEP * (progress - RING_MAX));
}

export interface BoardHorse { teamId: string; seat: number; name: string; color: TeamColor; progress: number; active: boolean; shield: boolean; stunned: boolean }

function wedge(seat: number, r: number): string {
  const a = seatAngle(seat);
  const [x1, y1] = polar(a - Math.PI / 6, r);
  const [x2, y2] = polar(a + Math.PI / 6, r);
  return `M${C} ${C} L${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2} Z`;
}

/** A knight-style horse head on a round base, drawn in the team colour. */
export function HorseIcon() {
  return (
    <svg viewBox="0 0 100 130" className="horse-svg" aria-hidden="true">
      <ellipse cx="50" cy="118" rx="38" ry="11" className="h-base" />
      <rect x="28" y="96" width="44" height="22" rx="6" className="h-stand" />
      <path className="h-body" d="M68 6 L62 24 C44 26 26 40 22 64 L10 76 C5 81 9 90 17 89 L31 84 C36 82 40 77 43 73 C42 84 34 96 34 108 L76 108 C76 88 88 70 84 48 C82 30 76 14 68 6 Z" />
      <path d="M60 22 L66 1 L75 20 Z" className="h-body" />
      <path d="M70 12 C84 34 86 62 77 102 L68 102 C76 62 72 38 62 24 Z" className="h-mane" />
      <path d="M30 54 L21 70" className="h-bridle" />
      <circle cx="39" cy="50" r="4" className="h-eye" />
      <circle cx="14" cy="82" r="2.2" className="h-eye" />
    </svg>
  );
}

export function Board({ horses, finish = FINISH }: { horses: BoardHorse[]; finish?: number }) {
  const bySeat = new Map(horses.map((h) => [h.seat, h]));
  const groups = new Map<string, BoardHorse[]>();
  for (const h of horses) {
    const [x, y] = positionOf(h.seat, h.progress, finish);
    const key = `${Math.round(x)}:${Math.round(y)}`;
    groups.set(key, [...(groups.get(key) ?? []), h]);
  }

  return (
    <div className="table-scene">
      <div className="table-top">
        <svg className="board" viewBox="0 0 640 640" role="img" aria-label="Bàn cờ cá ngựa sáu người chơi">
          <circle cx={C} cy={C} r={318} className="board-disc" />
          {TEAM_COLORS.map((color, seat) => <path key={`w${seat}`} d={wedge(seat, 318)} fill={COLOR_HEX[color]} className="zone" style={{ opacity: bySeat.has(seat) ? 0.42 : 0.2 }} />)}
          {TEAM_COLORS.map((color, seat) => {
            const a = seatAngle(seat);
            const [lx1, ly1] = polar(a, RING_R);
            const [lx2, ly2] = polar(a, 40);
            const [sx, sy] = polar(a, STABLE_R);
            return (
              <g key={`s${seat}`}>
                <line x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke={COLOR_HEX[color]} strokeWidth={36} strokeLinecap="round" opacity={0.9} />
                {Array.from({ length: HOME_LANE }, (_, j) => {
                  const [x, y] = polar(a, RING_R - LANE_STEP * (j + 1));
                  return <g key={j}><circle cx={x} cy={y} r={15} fill="#fff" opacity={0.92} /><text x={x} y={y + 6} textAnchor="middle" className="lane-no" style={{ fill: COLOR_HEX[color] }}>{j + 1}</text></g>;
                })}
                <circle cx={sx} cy={sy + 5} r={31} fill="#0003" />
                <circle cx={sx} cy={sy} r={31} fill={COLOR_HEX[color]} stroke="#fff" strokeWidth={3} />
                <circle cx={sx} cy={sy} r={22} fill="#fffdf8" />
                {[0, 1, 2, 3].map((k) => { const ang = (Math.PI / 2) * k + Math.PI / 4; return <circle key={k} cx={sx + 13 * Math.cos(ang)} cy={sy + 13 * Math.sin(ang)} r={2.6} fill={COLOR_HEX[color]} opacity={0.55} />; })}
                <text x={sx} y={sy + 6} textAnchor="middle" className="slot-no" style={{ fill: COLOR_HEX[color] }}>{seat + 1}</text>
              </g>
            );
          })}
          {Array.from({ length: RING_SIZE }, (_, cell) => {
            const [x, y] = polar(rad(cell), RING_R);
            const deg = (rad(cell) * 180) / Math.PI + 90;
            const isStart = cell % SEAT_GAP === 0;
            const fill = isStart ? COLOR_HEX[TEAM_COLORS[cell / SEAT_GAP]] : '#fbf3de';
            const size = isStart ? 40 : 33;
            return (
              <g key={cell} transform={`translate(${x} ${y}) rotate(${deg})`}>
                <rect x={-size / 2} y={-size / 2 + 5} width={size} height={size} rx={10} fill={isStart ? '#0004' : '#cdbf9a'} />
                <rect x={-size / 2} y={-size / 2} width={size} height={size} rx={10} fill={fill} stroke="#fff" strokeWidth={isStart ? 2.5 : 1.5} />
                {isStart && <text x={0} y={6} textAnchor="middle" className="cell-star" transform={`rotate(${-deg})`}>★</text>}
              </g>
            );
          })}
          <circle cx={C} cy={C + 6} r={50} fill="#0004" />
          {TEAM_COLORS.map((color, seat) => <path key={`g${seat}`} d={wedge(seat, 50)} fill={COLOR_HEX[color]} />)}
          <circle cx={C} cy={C} r={34} className="goal" />
          <text x={C} y={C - 2} textAnchor="middle" className="goal-text">ĐÍCH</text>
          <text x={C} y={C + 13} textAnchor="middle" className="goal-sub">3/2/1930</text>
        </svg>
        <div className="pawns">
          {horses.map((h) => {
            const [x, y] = positionOf(h.seat, h.progress, finish);
            const group = groups.get(`${Math.round(x)}:${Math.round(y)}`)!;
            const dx = (group.indexOf(h) - (group.length - 1) / 2) * 16;
            return (
              <div key={h.teamId} className={`pawn${h.active ? ' active' : ''}`} title={`${h.name}: ${h.progress}/${finish}`}
                style={{ left: `${((x + dx) / 640) * 100}%`, top: `${(y / 640) * 100}%`, '--c': COLOR_HEX[h.color] } as CSSProperties}>
                {(h.shield || h.stunned) && <span className="pawn-badge">{h.shield ? '🛡️' : '💤'}</span>}
                <HorseIcon />
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
