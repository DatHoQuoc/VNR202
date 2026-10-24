'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Board, COLOR_HEX, type BoardHorse } from './board';
import { useClock, useRoom, type RoomView as View } from './client';
import { skillByKind } from '@/game/skills';
import { COLOR_NAMES, TEAM_COLORS, type SkillCard, type SkillKind } from '@/game/types';

type Game = NonNullable<View['game']>;
const LETTERS = ['A', 'B', 'C', 'D'];

function Die({ value, rolling }: { value: number | null; rolling: boolean }) {
  const pips: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  return (
    <div className={`die${rolling ? ' rolling' : ''}`} aria-label={value ? `Xúc xắc ${value}` : 'Chưa đổ'}>
      {value ? Array.from({ length: 9 }, (_, i) => <span key={i} className={pips[value].includes(i) ? 'pip' : ''} />) : <b>?</b>}
    </div>
  );
}

function useRolling(dice: number | null): boolean {
  const [rolling, setRolling] = useState(false);
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (dice !== null && dice !== last.current) { setRolling(true); const t = setTimeout(() => setRolling(false), 700); last.current = dice; return () => clearTimeout(t); }
    if (dice === null) last.current = null;
  }, [dice]);
  return rolling;
}

function JoinForm({ onJoin, busy, taken }: { onJoin: (name: string, color?: string) => void; busy: boolean; taken: string[] }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>('');
  return (
    <form className="panel stack" onSubmit={(e) => { e.preventDefault(); onJoin(name, color || undefined); }}>
      <h2>Tham gia với tư cách một đội</h2>
      <label className="field">Tên đội<input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Bình Minh" required /></label>
      <div className="field">Màu ngựa (không bắt buộc)
        <div className="swatches">
          {TEAM_COLORS.map((c) => (
            <button key={c} type="button" disabled={taken.includes(c)} className={color === c ? 'swatch on' : 'swatch'} style={{ background: COLOR_HEX[c] }} onClick={() => setColor(color === c ? '' : c)} aria-label={COLOR_NAMES[c]} title={COLOR_NAMES[c]} />
          ))}
        </div>
      </div>
      <button className="btn primary" disabled={busy || name.trim().length < 2}>Vào phòng</button>
    </form>
  );
}

function SkillCardView({ card, disabledReason, onUse, selected }: { card: SkillCard; disabledReason: string | null; onUse: () => void; selected: boolean }) {
  const def = skillByKind[card.kind];
  return (
    <button className={`skill${selected ? ' selected' : ''} ${def.target}`} disabled={!!disabledReason} onClick={onUse} title={disabledReason ?? def.theme}>
      <span className="skill-icon">{def.icon}</span>
      <strong>{def.name}</strong>
      <small>{def.description}</small>
      <em>{def.target === 'enemy' ? 'Đối kháng' : def.timing === 'question' ? 'Hỗ trợ khi trả lời' : 'Tự thân'}</em>
    </button>
  );
}

export function RoomView({ code, projector = false }: { code: string; projector?: boolean }) {
  const { view, error, busy, send, join, serverNow } = useRoom(code);
  const [pending, setPending] = useState<SkillCard | null>(null);
  useClock();
  const rolling = useRolling(view?.game?.dice ?? null);

  const names = useMemo(() => Object.fromEntries((view?.teams ?? []).map((t) => [t.id, t])), [view?.teams]);
  if (!view) return <main className="center-note">{error ? <><p className="error">{error}</p><Link className="btn" href="/">Về trang chủ</Link></> : 'Đang kết nối phòng…'}</main>;

  const g = view.game;
  const me = view.viewer.role === 'team' ? view.viewer.teamId : null;
  const isHost = view.viewer.role === 'host' && !projector;
  const name = (id?: string) => (id ? names[id]?.name ?? '?' : '');
  const tint = (id?: string) => (id && names[id] ? COLOR_HEX[names[id].color] : '#555');
  const link = typeof window === 'undefined' ? '' : `${window.location.origin}/join?code=${view.code}`;

  const horses: BoardHorse[] = g
    ? g.order.map((id) => ({
        teamId: id, seat: g.players[id].seat, name: name(id), color: names[id].color, progress: g.players[id].progress,
        active: g.turnTeamId === id && g.phase !== 'finished', shield: g.players[id].shield, stunned: g.players[id].stunned
      }))
    : view.teams.map((t, seat) => ({ teamId: t.id, seat, name: t.name, color: t.color, progress: 0, active: false, shield: false, stunned: false }));

  const remaining = g && (g.paused ? g.pausedRemaining : g.deadline !== null ? Math.max(0, g.deadline - serverNow()) : null);
  const run = (action: Parameters<typeof send>[0]) => { setPending(null); void send(action); };
  const myTurn = !!g && me === g.turnTeamId && g.phase !== 'finished' && !g.paused;

  const header = (
    <header className="topbar">
      <Link href="/" className="brand"><span className="brand-mark">♞</span> CÁ NGỰA CÁCH MẠNG</Link>
      <div className="topbar-mid"><strong>{view.title}</strong><span>Mã phòng <b className="code">{view.code}</b></span></div>
      <div className="topbar-end">
        {me && <span className="chip" style={{ background: tint(me) }}>{name(me)}</span>}
        {isHost && <span className="chip dark">Người điều khiển</span>}
        {!me && !isHost && <span className="chip dark">Khán giả</span>}
        {!projector && <Link className="text-link" href={`/rooms/${view.code}/board`} target="_blank">Màn chiếu ↗</Link>}
      </div>
    </header>
  );

  if (view.status === 'lobby' || !g) {
    return (
      <>{header}
        <main className="shell lobby">
          <section className="panel">
            <p className="eyebrow">PHÒNG CHỜ · {view.teams.length}/6 ĐỘI</p>
            <h1>Chờ đủ đội để xuất phát</h1>
            <p className="muted">Chia sẻ mã <b className="code">{view.code}</b> hoặc liên kết bên dưới. Mỗi đội dùng một thiết bị; có thể chơi từ 2 đến 6 đội.</p>
            {!projector && <input className="copy" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />}
            <ul className="team-list">
              {view.teams.map((t) => (
                <li key={t.id}><i style={{ background: COLOR_HEX[t.color] }} /><b>{t.name}</b><span className="muted">{COLOR_NAMES[t.color]}{t.id === me ? ' · bạn' : ''}</span>
                  {isHost && <button className="text-link" onClick={() => run({ type: 'remove-team', teamId: t.id })}>Xóa</button>}</li>
              ))}
              {Array.from({ length: 6 - view.teams.length }, (_, i) => <li key={`e${i}`} className="empty">Đang chờ đội…</li>)}
            </ul>
            {isHost && <button className="btn primary big" disabled={busy || view.teams.length < 2} onClick={() => run({ type: 'start' })}>Bắt đầu cuộc đua ({view.teams.length} đội)</button>}
            {me && <p className="notice">Bạn đã vào phòng. Giữ nguyên trang này, người điều khiển sẽ bắt đầu ván đấu.</p>}
          </section>
          <section className="stack">
            <div className="panel board-wrap"><Board horses={horses} /></div>
            {view.viewer.role === 'spectator' && !projector && <JoinForm onJoin={join} busy={busy} taken={view.teams.map((t) => t.color)} />}
          </section>
          {error && <p className="toast error">{error}</p>}
        </main>
      </>
    );
  }

  const turnTeam = g.turnTeamId;
  const q = g.question;
  const mine = me ? g.players[me] : null;
  const hand = view.hand;
  const enemyCards = (card: SkillCard) => skillByKind[card.kind].target === 'enemy';

  const reason = (card: SkillCard): string | null => {
    const def = skillByKind[card.kind];
    if (!myTurn) return g.paused ? 'Ván đấu đang tạm dừng' : 'Chưa đến lượt của đội bạn';
    if (def.timing === 'roll' && g.phase !== 'roll') return 'Chỉ dùng trước khi đổ xúc xắc';
    if (def.timing === 'roll' && g.skillUsed) return 'Mỗi lượt chỉ dùng 1 thẻ trước khi đổ';
    if (def.timing === 'question' && g.phase !== 'question') return 'Chỉ dùng khi đang trả lời câu hỏi';
    return null;
  };
  const use = (card: SkillCard) => (enemyCards(card) ? setPending(pending?.id === card.id ? null : card) : run({ type: 'game', action: { type: 'play-skill', cardId: card.id } }));
  const targetOk = (card: SkillCard, id: string): string | null => {
    const t = g.players[id];
    const onRing = (p: number) => p >= 1 && p <= 23;
    if (card.kind === 'stun' && t.stunned) return 'Đã bị mất lượt';
    if (card.kind === 'barricade' && t.cap !== null) return 'Đã bị Thuế Khóa';
    if (card.kind === 'push-back' && !onRing(t.progress)) return 'Không nằm trên vòng đua';
    if (card.kind === 'swap' && (!onRing(t.progress) || !mine || !onRing(mine.progress) || t.progress === mine.progress)) return 'Không hoán đổi được';
    if (card.kind === 'steal' && t.handCount === 0) return 'Chưa có thẻ nào';
    return null;
  };

  const res = g.resolution;
  const secs = remaining === null ? null : Math.ceil(remaining / 1000);

  return (
    <>{header}
      <main className={`shell game${projector ? ' projector' : ''}`}>
        <section className="left">
          <div className="panel board-wrap">
            <Board horses={horses} finish={g.finish} />
          </div>
        </section>

        <section className="right">
          {g.phase === 'finished' ? (
            <div className="panel winner" style={{ borderColor: tint(g.winnerId ?? undefined) }}>
              <p className="eyebrow">{g.endedBy === 'finish' ? 'VỀ ĐÍCH ĐẦU TIÊN' : 'VÁN ĐẤU KẾT THÚC'}</p>
              <h1 style={{ color: tint(g.winnerId ?? undefined) }}>🏆 {name(g.winnerId ?? undefined)}</h1>
              <ol className="rank">
                {g.ranking!.map((id, i) => (
                  <li key={id}><b>{i + 1}</b><i style={{ background: tint(id) }} />{name(id)}<span>{g.players[id].progress}/{g.finish} ô · đúng {g.players[id].correct}/{g.players[id].answered}</span></li>
                ))}
              </ol>
              {isHost && <button className="btn primary" onClick={() => run({ type: 'rematch' })}>Chơi ván mới với các đội này</button>}
            </div>
          ) : (
            <div className={`panel turn${myTurn ? ' mine' : ''}`} style={{ borderColor: tint(turnTeam) }}>
              <div className="turn-head">
                <div><p className="eyebrow">LƯỢT {g.turnNumber} · {g.phase === 'roll' ? 'ĐỔ XÚC XẮC' : 'TRẢ LỜI CÂU HỎI'}</p>
                  <h2 style={{ color: tint(turnTeam) }}>{myTurn ? 'Đến lượt bạn!' : `Lượt của ${name(turnTeam)}`}</h2></div>
                <Die value={g.dice} rolling={rolling} />
                {secs !== null && <div className={`timer${secs <= 5 ? ' low' : ''}`}>{g.paused ? '⏸' : ''}{secs}s</div>}
              </div>
              {g.phase === 'roll' && (
                myTurn
                  ? <button className="btn primary big" disabled={busy} onClick={() => run({ type: 'game', action: { type: 'roll' } })}>🎲 Đổ xúc xắc</button>
                  : <p className="muted">Chờ {name(turnTeam)} đổ xúc xắc…</p>
              )}
              {g.phase === 'question' && q && (
                <div className="question">
                  <p className="q-text">{q.text}</p>
                  <div className="options">
                    {q.options.map((o, i) => (
                      <button key={i} className="option" disabled={!myTurn || busy || q.removed.includes(i)} onClick={() => run({ type: 'game', action: { type: 'answer', index: i } })}>
                        <b>{LETTERS[i]}</b>{q.removed.includes(i) ? <s>{o}</s> : o}
                      </button>
                    ))}
                  </div>
                  {q.hint && <p className="hint">💡 Gợi ý: {q.hint}</p>}
                  <p className="muted small">Trả lời đúng: đi {g.dice} ô <b>và nhận 1 thẻ kỹ năng</b>. Sai hoặc hết giờ: vẫn đi {g.dice} ô nhưng không có thẻ.</p>
                </div>
              )}
              {g.paused && <p className="notice">Ván đấu đang tạm dừng.</p>}
            </div>
          )}

          {mine && g.phase !== 'finished' && (
            <div className="panel hand">
              <div className="panel-head"><h2>Thẻ kỹ năng của bạn ({hand.length}/5)</h2>
                <div className="status-icons">{mine.shield && <span title="Có khiên">🛡️ Khiên</span>}{mine.boost > 0 && <span>🚩 +{mine.boost}</span>}{mine.doubleDice && <span>🎲 x2</span>}{mine.cap !== null && <span>🚧 tối đa {mine.cap}</span>}{mine.stunned && <span>💤 mất lượt</span>}</div></div>
              {hand.length === 0 ? <p className="muted">Chưa có thẻ. Trả lời đúng để nhận thẻ kỹ năng mới.</p> : (
                <div className="skills">{hand.map((c) => <SkillCardView key={c.id} card={c} disabledReason={reason(c)} selected={pending?.id === c.id} onUse={() => use(c)} />)}</div>
              )}
              {pending && (
                <div className="targets">
                  <p>Chọn đội để dùng <b>{skillByKind[pending.kind].name}</b>:</p>
                  {g.order.filter((id) => id !== me).map((id) => {
                    const bad = targetOk(pending, id);
                    return <button key={id} className="target" disabled={!!bad || busy} title={bad ?? ''} style={{ borderColor: tint(id) }} onClick={() => run({ type: 'game', action: { type: 'play-skill', cardId: pending.id, targetId: id } })}>
                      <i style={{ background: tint(id) }} />{name(id)} <small>{g.players[id].progress}/{g.finish}{g.players[id].shield ? ' 🛡️' : ''}{bad ? ` · ${bad}` : ''}</small></button>;
                  })}
                  <button className="text-link" onClick={() => setPending(null)}>Hủy</button>
                </div>
              )}
            </div>
          )}

          {res && (
            <div className={`panel result ${res.outcome}`}>
              <p className="eyebrow">KẾT QUẢ LƯỢT {res.id}</p>
              <p><b style={{ color: tint(res.teamId) }}>{name(res.teamId)}</b> đổ <b>{res.dice}</b> → {res.outcome === 'correct' ? '✅ trả lời đúng' : res.outcome === 'wrong' ? '❌ trả lời sai' : '⌛ hết giờ'}, đi {res.steps} ô ({res.from} → {res.to}){res.capped ? ' · bị Thuế Khóa giới hạn' : ''}.
                {res.gained && <> Nhận thẻ <b>{skillByKind[res.gained as SkillKind].icon} {skillByKind[res.gained as SkillKind].name}</b>.</>}
                {res.knocked.length > 0 && <> Húc lùi {res.knocked.map(name).join(', ')}.</>}</p>
              <p className="q-review"><b>Câu hỏi:</b> {res.questionText}<br /><b>Đáp án:</b> {res.correctText}<br /><span className="muted">{res.explain} ({res.ref})</span></p>
            </div>
          )}

          <ScoreBoard game={g} names={names} me={me} />
          <EventLog game={g} names={names} />

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

function ScoreBoard({ game, names, me }: { game: Game; names: Record<string, { name: string; color: keyof typeof COLOR_HEX; online: boolean }>; me: string | null }) {
  const sorted = [...game.order].sort((a, b) => game.players[b].progress - game.players[a].progress);
  return (
    <div className="panel scores">
      <h2>Bảng xếp hạng đường đua</h2>
      {sorted.map((id) => {
        const p = game.players[id];
        return (
          <div key={id} className={`score${id === game.turnTeamId ? ' turn' : ''}`}>
            <i style={{ background: COLOR_HEX[names[id].color] }} />
            <span className="score-name">{names[id].name}{id === me ? ' (bạn)' : ''}</span>
            <span className="bar"><span style={{ width: `${(p.progress / game.finish) * 100}%`, background: COLOR_HEX[names[id].color] }} /></span>
            <span className="score-num">{p.progress}/{game.finish}</span>
            <span className="score-meta">🃏{p.handCount}{p.shield ? ' 🛡️' : ''}{p.stunned ? ' 💤' : ''}{p.cap !== null ? ' 🚧' : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

function EventLog({ game, names }: { game: Game; names: Record<string, { name: string; color: keyof typeof COLOR_HEX }> }) {
  const events = [...game.events].reverse().slice(0, 14);
  return (
    <div className="panel log">
      <h2>Diễn biến</h2>
      <ul>
        {events.map((e) => (
          <li key={e.id}>
            {e.teamId && names[e.teamId] ? <b style={{ color: COLOR_HEX[names[e.teamId].color] }}>{names[e.teamId].name}</b> : null} {e.text}
            {e.targetId && names[e.targetId] ? <> {e.type === 'block' ? 'của' : 'lên'} <b style={{ color: COLOR_HEX[names[e.targetId].color] }}>{names[e.targetId].name}</b></> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
