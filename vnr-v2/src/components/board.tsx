'use client';
import type { CSSProperties, ReactNode } from 'react';
import { ARM_LEN, CELLS_PER_ARM, FINISH, HOME_LANE, RING_MAX, RING_SIZE } from '@/game/engine';
import { TEAM_COLORS, type TeamColor } from '@/game/types';

export const COLOR_HEX: Record<TeamColor, string> = {
  red: '#d9453a', orange: '#f08a24', yellow: '#f0c020', green: '#35a05f', blue: '#2f7fc4', purple: '#8a5cc2'
};

/* ---- geometry (viewBox 700 x 700): six arms, each with two outer columns and a middle home lane ---- */
const VB = 700;
const C = VB / 2;
const PITCH = 36;
const TILE = 32;
const U0 = 98;
const STABLE_R = 282;
const armAngle = (arm: number): number => (arm * Math.PI) / 3;
const pt = (arm: number, u: number, v: number): [number, number] => {
  const a = armAngle(arm);
  return [C + u * Math.sin(a) + v * Math.cos(a), C - u * Math.cos(a) + v * Math.sin(a)];
};

/** Position of every ring cell in clockwise order: left column out, tip, right column in. */
const RING: { x: number; y: number; arm: number; tip: boolean }[] = [];
for (let arm = 0; arm < 6; arm++) {
  for (let k = 0; k < ARM_LEN; k++) { const [x, y] = pt(arm, U0 + k * PITCH, -PITCH); RING.push({ x, y, arm, tip: false }); }
  { const [x, y] = pt(arm, U0 + ARM_LEN * PITCH, 0); RING.push({ x, y, arm, tip: true }); }
  for (let k = ARM_LEN - 1; k >= 0; k--) { const [x, y] = pt(arm, U0 + k * PITCH, PITCH); RING.push({ x, y, arm, tip: false }); }
}
const lanePoint = (arm: number, j: number): [number, number] => pt(arm, U0 + (ARM_LEN - 1) * PITCH - (j - 1) * PITCH, 0);

/** The stable pad sits in the gap clockwise of the team's arm. */
export function stableCenter(seat: number): [number, number] {
  const a = armAngle(seat) + Math.PI / 6;
  return [C + STABLE_R * Math.sin(a), C - STABLE_R * Math.cos(a)];
}
const SLOT_OFFSETS: [number, number][] = [[-34, -22], [0, -22], [34, -22], [-34, 22], [0, 22], [34, 22]];
function stableSlot(seat: number, idx: number): [number, number] {
  const [cx, cy] = stableCenter(seat);
  const a = armAngle(seat) + Math.PI / 6;
  const [ox, oy] = SLOT_OFFSETS[idx % 6];
  return [cx + ox * Math.cos(a) - oy * Math.sin(a), cy + ox * Math.sin(a) + oy * Math.cos(a)];
}

export function positionOf(seat: number, progress: number, memberIdx: number, finish: number): [number, number] {
  if (progress <= 0) return stableSlot(seat, memberIdx);
  if (progress <= RING_MAX) { const c = RING[(seat * CELLS_PER_ARM + ARM_LEN + progress - 1) % RING_SIZE]; return [c.x, c.y]; }
  return lanePoint(seat, Math.min(progress, finish) - RING_MAX);
}

export interface BoardHorse { id: string; name: string; progress: number; memberIdx: number; acting: boolean }
export interface BoardTeam {
  teamId: string; seat: number; color: TeamColor; name: string; handCount: number;
  active: boolean; shield: boolean; stunned: boolean; horses: BoardHorse[];
}
export interface BoardFx { id: number; kicked: string[]; at: [number, number] | null }

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

const PROPS: { e: string; x: number; y: number; s: number }[] = [
  { e: '🌳', x: 7, y: 9, s: 1.5 }, { e: '🌲', x: 15, y: 4, s: 1.2 }, { e: '🌳', x: 93, y: 10, s: 1.4 }, { e: '🌲', x: 86, y: 5, s: 1.1 },
  { e: '🌾', x: 5, y: 50, s: 1 }, { e: '🌼', x: 3, y: 36, s: .8 }, { e: '🐑', x: 6, y: 62, s: 1 }, { e: '🌳', x: 5, y: 91, s: 1.5 }, { e: '🌲', x: 14, y: 95, s: 1.2 },
  { e: '🏡', x: 94, y: 90, s: 1.6 }, { e: '🌳', x: 86, y: 95, s: 1.3 }, { e: '🌼', x: 96, y: 64, s: .8 }, { e: '🪨', x: 95, y: 40, s: .9 }, { e: '🌷', x: 94, y: 52, s: .8 }
];

export function Board({ teams, fx, center, finish = FINISH }: { teams: BoardTeam[]; fx?: BoardFx | null; center?: ReactNode; finish?: number }) {
  const bySeat = new Map(teams.map((t) => [t.seat, t]));
  const all = teams.flatMap((t) => t.horses.map((h) => ({ t, h })));
  const groups = new Map<string, string[]>();
  for (const { t, h } of all) {
    const [x, y] = positionOf(t.seat, h.progress, h.memberIdx, finish);
    const key = `${Math.round(x)}:${Math.round(y)}`;
    groups.set(key, [...(groups.get(key) ?? []), h.id]);
  }
  const kicked = new Set(fx?.kicked ?? []);

  return (
    <div className="table-scene">
      <div className={`table-top${fx && fx.kicked.length ? ' shake' : ''}`} key={fx && fx.kicked.length ? `fx${fx.id}` : 'still'}>
        <svg className="board" viewBox={`0 0 ${VB} ${VB}`} role="img" aria-label="Bàn cờ cá ngựa sáu đội">
          <defs>
            <pattern id="grass" width="26" height="26" patternUnits="userSpaceOnUse"><rect width="26" height="26" fill="#8fcf63" /><path d="M3 20l2-6 2 6M15 9l2-6 2 6" stroke="#7ab852" strokeWidth="1.6" fill="none" /></pattern>
          </defs>
          <rect width={VB} height={VB} rx="46" fill="url(#grass)" />
          <circle cx={C} cy={C} r={338} fill="#bfe58f" opacity={0.55} />
          {/* stables: coloured pads in the gap beside each arm */}
          {TEAM_COLORS.map((color, seat) => {
            const [cx, cy] = stableCenter(seat);
            const deg = (armAngle(seat) * 180) / Math.PI + 30;
            const t = bySeat.get(seat);
            return (
              <g key={`pad${seat}`} transform={`translate(${cx} ${cy}) rotate(${deg})`} opacity={t ? 1 : 0.55}>
                <rect x={-68} y={-48 + 7} width={136} height={96} rx={20} fill="#0003" />
                <rect x={-68} y={-48} width={136} height={96} rx={20} fill={COLOR_HEX[color]} stroke="#fff" strokeWidth={4} />
                <rect x={-59} y={-39} width={118} height={78} rx={13} fill="#fffdf6" opacity={0.92} />
                {SLOT_OFFSETS.map(([ox, oy], k) => <circle key={k} cx={ox} cy={oy} r={15} fill={COLOR_HEX[color]} opacity={0.28} stroke={COLOR_HEX[color]} strokeWidth={2} strokeDasharray="4 3" />)}
              </g>
            );
          })}
          {/* home lanes */}
          {TEAM_COLORS.map((color, seat) => (
            <g key={`lane${seat}`}>
              {Array.from({ length: HOME_LANE }, (_, i) => {
                const j = i + 1;
                const [x, y] = lanePoint(seat, j);
                const deg = (armAngle(seat) * 180) / Math.PI;
                return (
                  <g key={j} transform={`translate(${x} ${y}) rotate(${deg})`}>
                    <rect x={-TILE / 2} y={-TILE / 2 + 5} width={TILE} height={TILE} rx={9} fill="#0004" />
                    <rect x={-TILE / 2} y={-TILE / 2} width={TILE} height={TILE} rx={9} fill={COLOR_HEX[color]} stroke={j === HOME_LANE ? '#ffd84a' : '#fff'} strokeWidth={j === HOME_LANE ? 3.5 : 1.5} />
                    <text y={6} textAnchor="middle" className="lane-no" transform={`rotate(${-deg})`}>{j === HOME_LANE ? '🏁' : j}</text>
                  </g>
                );
              })}
            </g>
          ))}
          {/* ring tiles */}
          {RING.map((c, i) => {
            const deg = (armAngle(c.arm) * 180) / Math.PI;
            const isStart = c.tip;
            const color = COLOR_HEX[TEAM_COLORS[c.arm]];
            return (
              <g key={i} transform={`translate(${c.x} ${c.y}) rotate(${deg})`}>
                <rect x={-TILE / 2} y={-TILE / 2 + 5} width={TILE} height={TILE} rx={9} fill="#0004" />
                <rect x={-TILE / 2} y={-TILE / 2} width={TILE} height={TILE} rx={9} fill={isStart ? color : '#fff3d6'} stroke="#fff" strokeWidth={isStart ? 2.5 : 1.5} />
                {isStart && <text y={6} textAnchor="middle" className="cell-star" transform={`rotate(${-deg})`}>★</text>}
              </g>
            );
          })}
          {/* hub */}
          <circle cx={C} cy={C + 6} r={48} fill="#0004" />
          {TEAM_COLORS.map((color, seat) => {
            const a0 = armAngle(seat) - Math.PI / 6, a1 = armAngle(seat) + Math.PI / 6;
            const p = (a: number, r: number) => `${C + r * Math.sin(a)} ${C - r * Math.cos(a)}`;
            return <path key={seat} d={`M${C} ${C} L${p(a0, 48)} A48 48 0 0 1 ${p(a1, 48)} Z`} fill={COLOR_HEX[color]} stroke="#fff" strokeWidth={2} />;
          })}
          <circle cx={C} cy={C} r={34} fill="#fffdf6" stroke="#fff" strokeWidth={3} />
        </svg>

        <div className="props">{PROPS.map((p, i) => <span key={i} className="prop" style={{ left: `${p.x}%`, top: `${p.y}%`, fontSize: `${p.s * 2.4}vmin` }}>{p.e}</span>)}</div>

        <div className="pawns">
          {teams.map((t) => {
            const [cx, cy] = stableCenter(t.seat);
            const dir = (() => { const a = armAngle(t.seat) + Math.PI / 6; return [Math.sin(a), -Math.cos(a)]; })();
            const inward = [cx - 66 * dir[0], cy - 66 * dir[1]];
            const outward = [cx + 50 * dir[0], cy + 50 * dir[1]];
            return (
              <div key={`tc${t.teamId}`}>
                <span className={`team-tag${t.active ? ' active' : ''}`} style={{ left: `${(outward[0] / VB) * 100}%`, top: `${(outward[1] / VB) * 100}%`, '--c': COLOR_HEX[t.color] } as CSSProperties}>
                  {t.name}{t.shield ? ' 🛡️' : ''}{t.stunned ? ' 💤' : ''}
                </span>
                {t.handCount > 0 && (
                  <span className="team-cards" style={{ left: `${(inward[0] / VB) * 100}%`, top: `${(inward[1] / VB) * 100}%` }} title={`${t.handCount} thẻ kỹ năng`}>
                    {Array.from({ length: t.handCount }, (_, i) => <i key={i} className="card-back" style={{ '--i': i } as CSSProperties} />)}
                  </span>
                )}
              </div>
            );
          })}
          {all.map(({ t, h }) => {
            const [x, y] = positionOf(t.seat, h.progress, h.memberIdx, finish);
            const group = groups.get(`${Math.round(x)}:${Math.round(y)}`)!;
            const dx = h.progress === 0 ? 0 : (group.indexOf(h.id) - (group.length - 1) / 2) * 10;
            return (
              <div key={h.id} className={`pawn${h.acting && t.active ? ' active' : ''}${kicked.has(h.id) ? ' kicked' : ''}${h.progress === 0 ? ' idle' : ''}`}
                title={`${h.name} (${t.name}): ${h.progress}/${finish}`}
                style={{ left: `${((x + dx) / VB) * 100}%`, top: `${(y / VB) * 100}%`, '--c': COLOR_HEX[t.color], zIndex: Math.round(y) } as CSSProperties}>
                <HorseIcon />
                <span className="pawn-name">{h.name}</span>
              </div>
            );
          })}
          {fx && fx.at && fx.kicked.length > 0 && (
            <div key={fx.id} className="boom" style={{ left: `${(fx.at[0] / VB) * 100}%`, top: `${(fx.at[1] / VB) * 100}%` }}><i /><b>ĐÁ!</b></div>
          )}
          <div className="hub-center">{center}</div>
        </div>
      </div>
    </div>
  );
}
