'use client';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { Board, COLOR_HEX, HorseIcon, positionOf, type BoardFx, type BoardTeam } from './board';
import { useClock, useRoom, type RoomMode, type RoomView as View } from './client';
import { RING_MAX } from '@/game/engine';
import { skillByKind } from '@/game/skills';
import { type SkillCard, type SkillKind } from '@/game/types';

type Game = NonNullable<View['game']>;
type TeamView = View['teams'][number];
const LETTERS = ['A', 'B', 'C', 'D'];

export function Die({ value, rolling }: { value: number | null; rolling: boolean }) {
  const pips: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  return (
    <div className={`die${rolling ? ' rolling' : ''}`} aria-label={value ? `Xúc xắc ${value}` : 'Chưa đổ'}>
      {value ? Array.from({ length: 9 }, (_, i) => <span key={i} className={pips[value].includes(i) ? 'pip' : ''} />) : <b>?</b>}
    </div>
  );
}

/** The two dice; doubles glow because they give another roll. */
export function Dice({ dice, rolling }: { dice: [number, number] | null; rolling: boolean }) {
  return (
    <div className={`dice-pair${dice && dice[0] === dice[1] ? ' double' : ''}`}>
      <Die value={dice?.[0] ?? null} rolling={rolling} /><Die value={dice?.[1] ?? null} rolling={rolling} />
      {dice && <span className="dice-sum">{dice[0] + dice[1]}</span>}
    </div>
  );
}

function useRolling(key: string | null): boolean {
  const [rolling, setRolling] = useState(false);
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (key !== null && key !== last.current) { setRolling(true); const t = setTimeout(() => setRolling(false), 800); last.current = key; return () => clearTimeout(t); }
    if (key === null) last.current = null;
  }, [key]);
  return rolling;
}

const fmtClock = (ms: number): string => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function SkillCardView({ card, kind, disabledReason, onUse, selected, big, style }: { card?: SkillCard; kind?: SkillKind; disabledReason?: string | null; onUse?: () => void; selected?: boolean; big?: boolean; style?: CSSProperties }) {
  const def = skillByKind[(card?.kind ?? kind)!];
  const tone = def.target === 'enemy' ? 'enemy' : def.timing === 'question' ? 'help' : 'self';
  const label = def.target === 'enemy' ? 'CHẶN ĐỐI THỦ' : def.timing === 'question' ? 'HỖ TRỢ' : 'TỰ THÂN';
  const body = (
    <>
      <span className="card-band"><b>{label}</b><b title={def.timing === 'roll' ? 'Dùng trước khi đổ xúc xắc' : 'Dùng khi đang trả lời'}>{def.timing === 'roll' ? '🎲' : '❓'}</b></span>
      <span className="card-art" aria-hidden="true">{def.icon}</span>
      <span className="card-body"><strong>{def.name}</strong><span>{def.description}</span><em>{def.theme}</em></span>
    </>
  );
  const cls = `game-card ${tone}${big ? ' big' : ''}${selected ? ' is-selected' : ''}`;
  if (!onUse) return <div className={cls} style={style}>{body}</div>;
  return <button type="button" className={cls} style={style} disabled={!!disabledReason} onClick={onUse} title={disabledReason ?? def.theme} aria-pressed={selected}>{body}</button>;
}

export function RoomView({ code, mode = 'player' }: { code: string; mode?: RoomMode }) {
  const projector = mode === 'projector';
  const { view, error, busy, denied, gone, send, join, serverNow } = useRoom(code, mode);
  const [pending, setPending] = useState<SkillCard | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [fx, setFx] = useState<BoardFx | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [reveal, setReveal] = useState<NonNullable<View['game']>['skillLog'][number] | null>(null);
  const seenSkill = useRef<number | null | undefined>(undefined);
  const seenResolution = useRef<number | null | undefined>(undefined);
  const wasSeated = useRef(false);
  const [kicked, setKicked] = useState(false);
  useEffect(() => { try { setPlayerName(localStorage.getItem('vnr_player') ?? ''); } catch { /* storage unavailable */ } }, []);
  const rename = (v: string) => { setPlayerName(v); try { localStorage.setItem('vnr_player', v); } catch { /* ignore */ } };
  useClock();
  const rolling = useRolling(view?.game?.dice ? view.game.dice.join('-') : null);

  // Kick effect: play once per new resolution (never for the one already on screen at load).
  const res = view?.game?.resolution ?? null;
  useEffect(() => {
    if (!view?.game) return;
    if (seenResolution.current === undefined) { seenResolution.current = res?.id ?? null; return; }
    if (!res || res.id === seenResolution.current) return;
    seenResolution.current = res.id;
    const team = view.game.players[res.teamId];
    const idx = Math.max(0, team.horses.findIndex((h) => h.id === res.horseId));
    setFx({ id: res.id, kicked: res.kicked.map((k) => k.horseId), at: res.kicked.length ? positionOf(team.seat, res.to, idx, view.game.finish) : null });
    const t = setTimeout(() => setFx(null), 2200);
    return () => clearTimeout(t);
  }, [res, view?.game]);

  // Reveal every skill card played to the whole table for a few seconds (not the ones already in the log at load).
  const skillLog = view?.game?.skillLog;
  useEffect(() => {
    if (!skillLog) return;
    const last = skillLog.at(-1) ?? null;
    if (seenSkill.current === undefined) { seenSkill.current = last?.id ?? null; return; }
    if (!last || last.id === seenSkill.current) return;
    seenSkill.current = last.id;
    setReveal(last);
    const t = setTimeout(() => setReveal(null), 3600);
    return () => clearTimeout(t);
  }, [skillLog]);

  const seatedNow = !!view && view.teams.some((tm) => tm.members.some((m) => view.viewer.role === 'team' && m.id === view.viewer.playerId));
  useEffect(() => {
    if (!view) return;
    if (seatedNow) { wasSeated.current = true; setKicked(false); }
    else if (wasSeated.current && view.status === 'lobby') { wasSeated.current = false; setKicked(true); }
  }, [seatedNow, view]);

  const teamsById = useMemo(() => Object.fromEntries((view?.teams ?? []).map((t) => [t.id, t])), [view?.teams]);
  if (gone) return <main className="center-note"><h1>Phòng đã đóng</h1><p className="muted">Quản trị đã xóa phòng {code} hoặc phòng đã hết hạn.</p><Link className="btn primary" href={mode === 'admin' ? '/admin' : '/play'}>{mode === 'admin' ? 'Về danh sách phòng' : 'Vào phòng khác'}</Link></main>;
  if (denied) return <main className="center-note"><p className="error">Phiên quản trị đã hết hạn.</p><Link className="btn primary" href="/admin">Đăng nhập quản trị</Link></main>;
  if (!view) return <main className="center-note">{error ? <><p className="error">{error}</p><Link className="btn" href="/">Về trang chủ</Link></> : 'Đang kết nối phòng…'}</main>;

  const g = view.game;
  const meTeam = view.viewer.role === 'team' ? view.viewer.teamId : null;
  const meId = view.viewer.role === 'team' ? view.viewer.playerId : null;
  const isHost = mode === 'admin' && view.viewer.role === 'host';
  const teamName = (id?: string) => (id ? teamsById[id]?.name ?? '?' : '');
  const tint = (id?: string) => (id && teamsById[id] ? COLOR_HEX[teamsById[id].color] : '#555');
  const link = typeof window === 'undefined' ? '' : `${window.location.origin}/play?code=${view.code}`;
  const exitText = view.settings.exitRolls.join(' hoặc ');

  const run = (action: Parameters<typeof send>[0]) => { setPending(null); void send(action); };

  const g0 = view.game;
  const clockMs = g0 && g0.phase !== 'finished' ? (g0.paused ? g0.timeLeft : g0.endsAt !== null ? g0.endsAt - serverNow() : null) : null;
  const header = (
    <header className="topbar">
      <Link href={isHost ? '/admin' : '/'} className="brand"><span className="brand-mark">♞</span> CÁ NGỰA CÁCH MẠNG</Link>
      <div className="topbar-mid"><strong>{view.title}</strong><span>Mã phòng <b className="code">{view.code}</b>{clockMs !== null && <b className={`game-clock${clockMs < 120_000 ? ' low' : ''}`}> · ⏱ {g0?.paused ? '⏸ ' : ''}{fmtClock(clockMs)}</b>}</span></div>
      <div className="topbar-end">
        {meTeam && <span className="chip" style={{ background: tint(meTeam) }}>{teamName(meTeam)}</span>}
        {isHost && <><span className="chip dark">Quản trị</span><Link className="text-link" href="/admin">← Danh sách phòng</Link></>}
        {!meTeam && !isHost && <span className="chip dark">{projector ? 'Màn chiếu' : 'Khán giả'}</span>}
        {isHost && <Link className="text-link" href={`/rooms/${view.code}/board`} target="_blank">Màn chiếu ↗</Link>}
        {!projector && <Link className="text-link" href={isHost ? `/admin/rooms/${view.code}/cards` : '/cards'} target="_blank">{isHost ? 'Thẻ & câu hỏi ↗' : 'Xem thẻ ↗'}</Link>}
      </div>
    </header>
  );

  /* ------------------------------------------------------------------ lobby */
  if (view.status === 'lobby' || !g) {
    const mine = view.teams.find((t) => t.members.some((m) => m.id === meId));
    const canPick = mode === 'player';
    const filled = view.teams.filter((t) => t.members.length > 0).length;
    const boardTeams: BoardTeam[] = view.teams.filter((tm) => tm.members.length > 0).map((t) => ({
      teamId: t.id, seat: t.slot, color: t.color, name: t.name, handCount: 0, active: false, shield: false,
      horses: Array.from({ length: view.settings.horses }, (_, i) => ({ id: `${t.id}-h${i + 1}`, name: `Ngựa ${i + 1}`, progress: i === 0 ? 1 : 0, memberIdx: i, acting: false }))
    }));
    return (
      <>{header}
        <main className="shell lobby">
          <section className="panel">
            <p className="eyebrow">PHÒNG CHỜ · {view.teams.reduce((n, tt) => n + tt.members.length, 0)} NGƯỜI · {filled}/6 ĐỘI</p>
            <h1>{isHost ? 'Người chơi đang vào phòng' : 'Chọn đội của bạn'}</h1>
            <p className="muted">{isHost ? 'Bạn là quản trị: không chơi, chỉ điều khiển.' : <>Mã phòng <b className="code">{view.code}</b>.</>} Có 6 đội (màu cố định). <b>Mỗi đội có {view.settings.horses} ngựa dùng chung</b>; các thành viên (tối đa 6 người) lần lượt đổ xúc xắc và trả lời câu hỏi. Cần ít nhất 2 đội có người để bắt đầu.</p>
            <div className="rule-chips">
              <span>🐴 Một viên ra <b>{exitText}</b> để xuất chuồng</span>
              <span>🏁 Đội đưa <b>{view.settings.winHome}/{view.settings.horses}</b> ngựa về đích trước thắng</span><span>🎲 2 xúc xắc · ⏱ tối đa <b>{view.settings.timeLimitMin} phút</b></span>
              <span>🎲 Hai viên giống nhau, đá ngựa hoặc về đích: tung thêm</span>
            </div>
            {canPick && (
              <label className="field">Tên của bạn
                <input value={playerName} maxLength={24} onChange={(e) => rename(e.target.value)} placeholder="Ví dụ: Nguyễn An" />
              </label>
            )}
            <div className="slots">
              {view.teams.map((t: TeamView) => {
                const isMine = mine?.id === t.id;
                return (
                  <div key={t.id} className={`slot${t.members.length ? ' taken' : ''}${isMine ? ' mine' : ''}`} style={{ '--c': COLOR_HEX[t.color] } as CSSProperties}>
                    <div className="slot-head"><span className="slot-horse"><HorseIcon /></span><b>Đội {t.slot + 1} · {t.name.replace('Đội ', '')}</b><span className="muted small">{t.members.length}/6 người</span></div>
                    <ul className="slot-members">
                      {t.members.map((m) => (
                        <li key={m.id}><i className={m.online ? 'on' : ''} />{m.name}{m.id === meId ? ' (bạn)' : ''}
                          {isHost && <button className="text-link" onClick={() => run({ type: 'remove-player', playerId: m.id })}>Xóa</button>}</li>
                      ))}
                      {t.members.length === 0 && <li className="muted"><i />Chưa có ai</li>}
                    </ul>
                    <div className="slot-actions">
                      {canPick && !isMine && t.members.length < 6 && <button className="btn primary" disabled={busy || playerName.trim().length < 2} onClick={() => join(playerName, t.slot)}>{mine ? 'Chuyển sang đội này' : 'Vào đội này'}</button>}
                      {isMine && <button className="text-link" onClick={() => run({ type: 'leave' })}>Rời đội</button>}
                    </div>
                  </div>
                );
              })}
            </div>
            {kicked && <p className="notice warn">Bạn đã bị quản trị gỡ khỏi đội. Hãy chọn lại một đội nếu muốn tiếp tục.</p>}
            {canPick && playerName.trim().length < 2 && !mine && <p className="notice">Nhập tên của bạn rồi bấm “Vào đội này”.</p>}
            {mine && <p className="notice">Bạn đang ở {mine.name}. Có thể chuyển sang đội khác trước khi bắt đầu; hãy giữ nguyên trang này.</p>}
            {isHost && <button className="btn primary big" disabled={busy || filled < 2} onClick={() => run({ type: 'start' })}>Bắt đầu cuộc đua ({filled} đội)</button>}
            {isHost && filled < 2 && <p className="muted small">Cần ít nhất 2 đội có người chơi mới bắt đầu được. Gửi mã <b className="code">{view.code}</b> cho người chơi.</p>}
            {isHost && <div className="share"><span>Gửi cho người chơi (mã <b className="code">{view.code}</b>):</span><input className="copy" readOnly value={link} onFocus={(e) => e.currentTarget.select()} /></div>}
          </section>
          <section className="panel board-wrap"><Board teams={boardTeams} /></section>
          {error && <p className="toast error">{error}</p>}
        </main>
      </>
    );
  }

  /* ------------------------------------------------------------------ game */
  const turnTeam = g.turnTeamId;
  const turn = g.players[turnTeam];
  const actor = turn.members.find((m) => m.id === g.actingMemberId);
  const stableHorses = turn.horses.filter((h) => h.progress === 0).length;
  const gameLeft = g.paused ? g.timeLeft : g.endsAt !== null ? Math.max(0, g.endsAt - serverNow()) : null;
  const actorOffline = !!actor && view.teams.some((tm) => tm.members.some((m) => m.id === actor.id && !m.online));
  const myTurn = !!meId && meId === g.actingMemberId && g.phase !== 'finished' && !g.paused;
  const q = g.question;
  const hand = view.hand;
  const mineTeam = meTeam ? g.players[meTeam] : null;
  const remaining = g.paused ? g.pausedRemaining : g.deadline !== null ? Math.max(0, g.deadline - serverNow()) : null;
  const secs = remaining === null ? null : Math.ceil(remaining / 1000);

  const moveOptions = g.phase === 'move' && g.pending && myTurn ? g.pending.options : [];
  const boardTeams: BoardTeam[] = g.order.map((id) => {
    const p = g.players[id];
    return {
      teamId: id, seat: p.seat, color: teamsById[id].color, name: teamName(id), handCount: p.handCount,
      active: id === turnTeam && g.phase !== 'finished', shield: p.shield, stunned: p.stunned,
      horses: p.horses.map((h, i) => ({ id: h.id, name: h.name, progress: h.progress, memberIdx: i, acting: id === turnTeam, cap: h.cap, selectable: moveOptions.some((o) => o.horseId === h.id) }))
    };
  });

  const reason = (card: SkillCard): string | null => {
    const def = skillByKind[card.kind];
    if (!myTurn) return g.paused ? 'Ván đấu đang tạm dừng' : 'Chưa đến lượt của bạn';
    if (def.timing === 'roll' && g.phase !== 'roll') return 'Chỉ dùng trước khi đổ xúc xắc';
    if (def.timing === 'roll' && g.skillUsed) return 'Mỗi lượt chỉ dùng 1 thẻ trước khi đổ';
    if (def.timing === 'question' && g.phase !== 'question') return 'Chỉ dùng khi đang trả lời câu hỏi';
    return null;
  };
  const use = (card: SkillCard) => (skillByKind[card.kind].target === 'enemy' ? setPending(pending?.id === card.id ? null : card) : run({ type: 'game', action: { type: 'play-skill', cardId: card.id } }));
  const horseOk = (card: SkillCard, tid: string, h: Game['players'][string]['horses'][number]): string | null => {
    const ring = (x: { progress: number }) => x.progress >= 1 && x.progress <= RING_MAX;
    const horseLevel = ['barricade', 'push-back', 'swap'].includes(card.kind);
    if (horseLevel && h.progress >= g.finish) return 'Đã về đích';
    if (card.kind === 'stun' && g.players[tid].stunned) return 'Đội đã bị mất lượt';
    if (card.kind === 'barricade' && h.progress === 0) return 'Còn ở chuồng';
    if (card.kind === 'barricade' && h.cap !== null) return 'Đã bị Thuế Khóa';
    if (card.kind === 'push-back' && !ring(h)) return h.progress === 0 ? 'Còn ở chuồng' : 'Đang ở đường về nhà';
    if (card.kind === 'swap' && (!ring(h) || !turn.horses.some(ring))) return !turn.horses.some(ring) ? 'Đội bạn chưa có ngựa trên vòng đua' : h.progress === 0 ? 'Còn ở chuồng' : 'Đang ở đường về nhà';
    if (card.kind === 'steal' && g.players[tid].handCount === 0) return 'Đội này chưa có thẻ';
    return null;
  };

  const lastSkill = g.skillLog.at(-1) ?? null;
  const standings = [...g.order].sort((a, b) => g.players[b].home - g.players[a].home || g.players[b].lead - g.players[a].lead);

  return (
    <>{header}
      <main className={`shell game${projector ? ' projector' : ''}`}>
        <section className="left">
          <div className="panel board-wrap">
            <Board teams={boardTeams} fx={fx} highlight={hover} finish={g.finish} center={<Dice dice={g.dice} rolling={rolling} />} onPickHorse={(horseId) => run({ type: 'game', action: { type: 'choose-horse', horseId } })} />
            {reveal && (
              <div key={reveal.id} className="reveal" role="status">
                <SkillCardView kind={reveal.kind} big style={{ '--rot': '0deg', '--lift': '0px' } as CSSProperties} />
                <div className="reveal-text"><b style={{ color: tint(reveal.teamId) }}>{teamName(reveal.teamId)}</b> ({reveal.memberName}) dùng <b>{skillByKind[reveal.kind].name}</b>{reveal.targetName ? <> lên ngựa <b>{reveal.targetName}</b> của <b style={{ color: tint(reveal.targetTeamId) }}>{teamName(reveal.targetTeamId)}</b></> : null}{reveal.blocked ? <em> · bị Khiên chặn!</em> : null}</div>
              </div>
            )}
            <div className="tray">
              <div className="tray-slot"><span className="tray-label">BỘ BÀI</span><div className="deck-pile">{Array.from({ length: Math.min(4, Math.ceil(g.deckCount / 6)) }, (_, i) => <i key={i} className="card-back" style={{ '--i': i } as CSSProperties} />)}</div><small>{g.deckCount} lá</small></div>
              <div className="tray-slot wide">
                <span className="tray-label">THẺ VỪA DÙNG</span>
                {lastSkill ? (
                  <div key={lastSkill.id} className="played"><SkillCardView kind={lastSkill.kind} style={{ '--rot': '0deg', '--lift': '0px' } as CSSProperties} />
                    <small><b style={{ color: tint(lastSkill.teamId) }}>{teamName(lastSkill.teamId)}</b>{lastSkill.targetName ? <> → ngựa <b>{lastSkill.targetName}</b> ({teamName(lastSkill.targetTeamId)})</> : null}{lastSkill.blocked ? ' (bị khiên chặn)' : ''}</small></div>
                ) : <small className="muted">Chưa có thẻ nào được dùng</small>}
              </div>
              <div className="tray-slot"><span className="tray-label">XUẤT CHUỒNG</span><b className="exit-rule">🎲 {g.exitRolls.join(' / ')}</b><small>Thắng: {g.winHome}/{turn.horses.length} ngựa về đích</small></div>
            </div>
          </div>
        </section>

        <section className="right">
          {g.phase === 'finished' ? (
            <div className="panel winner" style={{ borderColor: tint(g.winnerId ?? undefined) }}>
              <p className="eyebrow">{g.endedBy === 'finish' ? 'VỀ ĐÍCH ĐẦU TIÊN' : g.endedBy === 'time' ? 'HẾT GIỜ VÁN ĐẤU · ĐỘI DẪN ĐẦU THẮNG' : 'VÁN ĐẤU KẾT THÚC'}</p>
              <h1 style={{ color: tint(g.winnerId ?? undefined) }}>🏆 {teamName(g.winnerId ?? undefined)}</h1>
              <ol className="rank">
                {g.ranking!.map((id, i) => (
                  <li key={id}><b>{i + 1}</b><i style={{ background: tint(id) }} />{teamName(id)}<span>{g.players[id].home}/{Math.min(g.winHome, g.players[id].horses.length)} ngựa về đích · đúng {g.players[id].correct}/{g.players[id].answered}</span></li>
                ))}
              </ol>
              {isHost && <button className="btn primary" onClick={() => run({ type: 'rematch' })}>Chơi ván mới với các đội này</button>}
            </div>
          ) : (
            <div className={`panel turn${myTurn ? ' mine' : ''}`} style={{ borderColor: tint(turnTeam) }}>
              <div className="turn-head">
                <div><p className="eyebrow">LƯỢT {g.turnNumber}{g.streak > 0 ? ` · TUNG THÊM ×${g.streak}` : ''} · {g.phase === 'roll' ? 'ĐỔ XÚC XẮC' : g.phase === 'question' ? 'TRẢ LỜI CÂU HỎI' : 'CHỌN NGỰA ĐI'}</p>
                  <h2 style={{ color: tint(turnTeam) }}>{myTurn ? 'Đến lượt bạn!' : `${teamName(turnTeam)} · ${actor?.name}`}</h2></div>
                <Dice dice={g.dice} rolling={rolling} />
                {secs !== null && <div className={`timer${secs <= 5 ? ' low' : ''}`}>{g.paused ? '⏸' : ''}{secs}s</div>}
              </div>
              {actorOffline && <p className="notice warn">⚠ {actor?.name} đang mất kết nối. Hệ thống sẽ tự chơi thay sau vài giây.</p>}
              {secs === 0 && g.phase === 'question' && !g.paused && <p className="muted small">Hết giờ, đang tính kết quả…</p>}
              {stableHorses > 0 && g.phase === 'roll' && (
                <p className="hint">🐴 {teamName(turnTeam)} còn {stableHorses} ngựa trong chuồng: cần ít nhất một viên xúc xắc ra <b>{exitText}</b> để xuất chuồng (vẫn được trả lời để nhận thẻ).</p>
              )}
              {g.phase === 'roll' && (
                myTurn
                  ? <button className="btn primary big" disabled={busy} onClick={() => run({ type: 'game', action: { type: 'roll' } })}>🎲 Đổ xúc xắc</button>
                  : <p className="muted">Chờ {actor?.name} ({teamName(turnTeam)}) đổ xúc xắc…</p>
              )}
              {g.phase === 'question' && q && (
                <div className="question">
                  <p className="q-text">{q.text}</p>
                  <div className="options">
                    {q.options.map((o, i) => (
                      <button key={i} className="option" disabled={!myTurn || busy || q.removed.includes(i) || secs === 0} onClick={() => run({ type: 'game', action: { type: 'answer', index: i } })}>
                        <b>{LETTERS[i]}</b>{q.removed.includes(i) ? <s>{o}</s> : o}
                      </button>
                    ))}
                  </div>
                  {q.hint && <p className="hint">💡 Gợi ý: {q.hint}</p>}
                  <p className="muted small">Đúng: nhận <b>1 thẻ kỹ năng</b>. Sai hoặc hết giờ: không có thẻ, ngựa vẫn đi theo tổng xúc xắc{g.dice ? ` (${g.dice[0] + g.dice[1]})` : ''}.</p>
                </div>
              )}
              {g.phase === 'move' && g.pending && (
                <div className="move-panel">
                  <p className="muted small">{g.pending.outcome === 'correct' ? '✅ Trả lời đúng, đã nhận thẻ kỹ năng.' : g.pending.outcome === 'wrong' ? '❌ Trả lời sai.' : '⌛ Hết giờ.'} Tổng xúc xắc <b>{g.dice ? g.dice[0] + g.dice[1] : ''}</b>: {myTurn ? 'chọn con ngựa muốn đi (hoặc bấm thẳng vào ngựa trên bàn cờ).' : `chờ ${actor?.name} chọn ngựa…`}</p>
                  <div className="move-options">
                    {g.pending.options.map((o) => {
                      const h = turn.horses.find((x) => x.id === o.horseId)!;
                      return (
                        <button key={o.horseId} className="move-option" disabled={!myTurn || busy} style={{ '--c': tint(turnTeam) } as CSSProperties}
                          onMouseEnter={() => setHover(o.horseId)} onMouseLeave={() => setHover(null)} onClick={() => run({ type: 'game', action: { type: 'choose-horse', horseId: o.horseId } })}>
                          <span className="mini-horse"><HorseIcon /></span>
                          <b>{h.name}</b>
                          <small>{o.kind === 'exit' ? 'Xuất chuồng ra ô xuất phát' : `Ô ${o.from} → ${o.to >= g.finish ? 'ĐÍCH' : o.to}${o.capped ? ' (bị Thuế Khóa)' : ''}`}</small>
                          {o.kicks.length > 0 && <em className="tag kick">ĐÁ {o.kicks.length} ngựa ({o.kicks.map((k) => teamName(k.teamId)).join(', ')})</em>}
                          {o.home && <em className="tag home">🏁 VỀ ĐÍCH</em>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {g.paused && <p className="notice">Ván đấu đang tạm dừng.</p>}
            </div>
          )}

          {mineTeam && g.phase !== 'finished' && (
            <div className="panel hand">
              <div className="panel-head"><h2>Thẻ kỹ năng của đội ({hand.length}/5)</h2>
                <div className="status-icons">{mineTeam.shield && <span>🛡️ Khiên</span>}{mineTeam.boost > 0 && <span>🚩 +{mineTeam.boost}</span>}{mineTeam.doubleDice && <span>🎲 x2</span>}{mineTeam.stunned && <span>💤 đội mất lượt kế</span>}{mineTeam.horses.filter((h) => h.cap !== null).map((h) => <span key={h.id}>🚧 {h.name} tối đa {h.cap}</span>)}</div></div>
              {hand.length === 0 ? <p className="muted">Chưa có thẻ. Trả lời đúng để đội nhận thẻ kỹ năng mới.</p> : (
                <div className="hand-fan">{hand.map((c, i) => { const off = i - (hand.length - 1) / 2; return <SkillCardView key={c.id} card={c} disabledReason={reason(c)} selected={pending?.id === c.id} onUse={() => use(c)} style={{ '--rot': `${off * 4}deg`, '--lift': `${Math.abs(off) * 7}px` } as CSSProperties} />; })}</div>
              )}
              {pending && (
                <TargetPicker card={pending} game={g} meTeam={meTeam!} tint={tint} teamName={teamName} horseOk={horseOk} busy={busy}
                  onHover={setHover} onCancel={() => { setPending(null); setHover(null); }}
                  onPick={(horseId) => { setHover(null); run({ type: 'game', action: { type: 'play-skill', cardId: pending.id, targetHorseId: horseId } }); }} />
              )}
            </div>
          )}

          {res && (
            <div className={`panel result ${res.outcome}`}>
              <p className="eyebrow">KẾT QUẢ LƯỢT {res.id}</p>
              <p><b style={{ color: tint(res.teamId) }}>{res.memberName} ({teamName(res.teamId)})</b> tung <b>{res.dice[0]} + {res.dice[1]} = {res.dice[0] + res.dice[1]}</b>{res.dice[0] === res.dice[1] ? ' (đôi!)' : ''} → {res.outcome === 'correct' ? '✅ trả lời đúng' : res.outcome === 'wrong' ? '❌ trả lời sai' : '⌛ hết giờ'}.{' '}
                {res.exited ? `${res.horseName} xuất chuồng! ` : res.horseId ? `${res.horseName} đi ${res.steps} ô (${res.from} → ${res.to})${res.capped ? ', bị Thuế Khóa giới hạn' : ''}. ` : `Không có ngựa nào đi được (cần ${exitText} để xuất chuồng). `}
                {res.gained && <>Nhận thẻ <b>{skillByKind[res.gained as SkillKind].icon} {skillByKind[res.gained as SkillKind].name}</b>. </>}
                {res.kicked.length > 0 && <b className="kick-text">ĐÁ {res.kicked.map((k) => `${k.name} của ${teamName(k.teamId)}`).join(', ')}! </b>}
                {res.bonus && g.phase !== 'finished' && 'Được tung thêm một lượt.'}</p>
              <p className="q-review"><b>Câu hỏi:</b> {res.questionText}<br /><b>Đáp án:</b> {res.correctText}<br /><span className="muted">{res.explain} ({res.ref})</span></p>
            </div>
          )}

          <div className="panel scores">
            <h2>Bảng xếp hạng</h2>
            {standings.map((id) => {
              const p = g.players[id];
              const need = Math.min(g.winHome, p.horses.length);
              return (
                <div key={id} className={`score${id === turnTeam ? ' turn' : ''}`}>
                  <i style={{ background: tint(id) }} />
                  <span className="score-name">{teamName(id)}{id === meTeam ? ' (đội bạn)' : ''}<small>{p.horses.length} ngựa · {p.members.length} người</small></span>
                  <span className="bar"><span style={{ width: `${(p.lead / g.finish) * 100}%`, background: tint(id) }} /></span>
                  <span className="score-num">🏁 {p.home}/{need}</span>
                  <span className="score-hand" title="Số thẻ kỹ năng đang giữ"><span className="score-cards">{Array.from({ length: Math.min(p.handCount, 5) }, (_, i) => <i key={i} className="card-back" />)}</span><b>{p.handCount}</b> thẻ{p.shield ? ' 🛡️' : ''}</span>
                </div>
              );
            })}
          </div>

          <div className="panel skill-log">
            <h2>Thẻ kỹ năng đã dùng</h2>
            {g.skillLog.length === 0 ? <p className="muted small">Chưa đội nào dùng thẻ.</p> : (
              <ul>
                {[...g.skillLog].reverse().slice(0, 8).map((u) => (
                  <li key={u.id} className={u.blocked ? 'blocked' : ''}>
                    <span className="log-icon">{skillByKind[u.kind].icon}</span>
                    <span><b style={{ color: tint(u.teamId) }}>{teamName(u.teamId)}</b> ({u.memberName}) dùng <b>{skillByKind[u.kind].name}</b>
                      {u.targetName ? <> lên ngựa <b>{u.targetName}</b> của <b style={{ color: tint(u.targetTeamId) }}>{teamName(u.targetTeamId)}</b></> : <> cho đội mình</>}
                      {u.blocked ? ' — bị khiên chặn' : ''} <small className="muted">· lượt {u.turn}</small></span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel log">
            <h2>Diễn biến</h2>
            <ul>
              {[...g.events].reverse().slice(0, 14).map((e) => (
                <li key={e.id} className={e.type === 'kick' ? 'kick' : ''}>
                  {e.teamId && teamsById[e.teamId] ? <b style={{ color: tint(e.teamId) }}>{teamName(e.teamId)}</b> : null} {e.text}
                  {e.targetId && teamsById[e.targetId] ? <> {e.type === 'kick' ? '→' : 'lên'} <b style={{ color: tint(e.targetId) }}>{teamName(e.targetId)}</b></> : null}
                </li>
              ))}
            </ul>
          </div>

          {isHost && g.phase !== 'finished' && (
            <div className="panel host-controls">
              {g.paused ? <button className="btn" onClick={() => run({ type: 'resume' })}>▶ Tiếp tục</button> : <button className="btn" onClick={() => run({ type: 'pause' })}>⏸ Tạm dừng</button>}
              <button className="btn danger" onClick={() => { if (confirm('Kết thúc ván đấu ngay? Đội dẫn đầu sẽ thắng.')) run({ type: 'end' }); }}>Kết thúc ván</button>
            </div>
          )}
        </section>
        {error && <p className="toast error" role="alert">{error}</p>}
      </main>
    </>
  );
}

function TargetPicker({ card, game, meTeam, tint, teamName, horseOk, busy, onHover, onCancel, onPick }: {
  card: SkillCard; game: Game; meTeam: string; tint: (id?: string) => string; teamName: (id?: string) => string;
  horseOk: (card: SkillCard, teamId: string, h: Game['players'][string]['horses'][number]) => string | null;
  busy: boolean; onHover: (id: string | null) => void; onCancel: () => void; onPick: (horseId: string) => void;
}) {
  const def = skillByKind[card.kind];
  const steal = card.kind === 'steal';
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, []);
  return (
    <div ref={ref} className="picker" role="dialog" aria-label={`Chọn mục tiêu cho ${def.name}`}>
      <div className="picker-head">
        <SkillCardView kind={card.kind} style={{ '--rot': '0deg', '--lift': '0px' } as CSSProperties} />
        <div>
          <p className="eyebrow">CHỌN MỤC TIÊU</p>
          <h3>{def.icon} {def.name}</h3>
          <p>{def.description}</p>
          <p className="muted small">{steal ? 'Chọn đội muốn lấy thẻ (bấm vào ngựa bất kỳ của đội).' : 'Bấm vào con ngựa bạn muốn tác động. Rê chuột để thấy ngựa sáng lên trên bàn cờ.'} Đội có 🛡️ sẽ chặn thẻ này.</p>
        </div>
        <button className="text-link" onClick={onCancel}>Hủy</button>
      </div>
      <div className="picker-teams">
        {game.order.filter((id) => id !== meTeam).map((id) => {
          const p = game.players[id];
          return (
            <div key={id} className="picker-team" style={{ borderColor: tint(id) }}>
              <div className="picker-team-head"><i style={{ background: tint(id) }} /><b>{teamName(id)}</b><span>🃏 {p.handCount} thẻ{p.shield ? ' · 🛡️ có khiên' : ''}</span></div>
              <div className="picker-horses">
                {p.horses.map((h) => {
                  const bad = horseOk(card, id, h);
                  const where = h.progress === 0 ? 'ở chuồng' : h.progress >= game.finish ? 'đã về đích' : h.progress <= RING_MAX ? `ô ${h.progress}/${RING_MAX}` : `đường về nhà ${h.progress - RING_MAX}/4`;
                  return (
                    <button key={h.id} className="picker-horse" disabled={!!bad || busy} onMouseEnter={() => onHover(h.id)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(h.id)} onBlur={() => onHover(null)}
                      style={{ '--c': tint(id) } as CSSProperties} onClick={() => onPick(h.id)} title={bad ?? `Dùng lên ngựa của ${h.name}`}>
                      <span className="mini-horse"><HorseIcon /></span>
                      <b>{h.name}</b><small>{where}{h.cap !== null ? ' · 🚧' : ''}</small>
                      {bad && <em>{bad}</em>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
