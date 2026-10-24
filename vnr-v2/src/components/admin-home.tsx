'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

interface RoomRow { code: string; title: string; status: 'lobby' | 'playing' | 'finished'; createdAt: number; players: number; teams: number; turn: number; winHome: number; horses?: number }
const STATUS = { lobby: 'Phòng chờ', playing: 'Đang chơi', finished: 'Đã kết thúc' };

async function api(url: string, method = 'GET', body?: unknown) {
  const res = await fetch(url, { method, cache: 'no-store', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? 'Đã xảy ra lỗi.'), { status: res.status });
  return data;
}

/** Admin entrance: password login, then a dashboard to create, open and delete rooms. */
export function AdminHome() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('Cá Ngựa Cách Mạng · Lớp VNR202');
  const [seconds, setSeconds] = useState(25);
  const [horses, setHorses] = useState(2);
  const [timeLimitMin, setTimeLimitMin] = useState(18);
  const [winHome, setWinHome] = useState(2);
  const [exitRule, setExitRule] = useState('one-six');

  useEffect(() => { api('/api/admin/session').then((d) => setAuthed(d.authenticated)).catch(() => setAuthed(false)); }, []);

  const refresh = useCallback(async () => {
    try { setRooms((await api('/api/admin/rooms')).rooms); }
    catch (e) { if ((e as { status?: number }).status === 401) setAuthed(false); }
  }, []);
  useEffect(() => { if (!authed) return; void refresh(); const t = setInterval(refresh, 3000); return () => clearInterval(t); }, [authed, refresh]);

  async function login(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('/api/admin/session', 'POST', { password }); setAuthed(true); setPassword(''); }
    catch (err) { setError(err instanceof Error ? err.message : 'Không đăng nhập được.'); }
    setBusy(false);
  }
  async function logout() { await api('/api/admin/session', 'DELETE').catch(() => undefined); setAuthed(false); setRooms([]); }
  async function create() {
    setBusy(true); setError('');
    try { const d = await api('/api/admin/rooms', 'POST', { title, questionSeconds: seconds, winHome: Math.min(winHome, horses), exitRule, horses, timeLimitMin }); window.location.href = `/admin/rooms/${d.code}`; }
    catch (err) { setError(err instanceof Error ? err.message : 'Không tạo được phòng.'); setBusy(false); }
  }
  async function remove(code: string) {
    if (!confirm(`Xóa phòng ${code}? Mọi người chơi trong phòng sẽ bị mất kết nối.`)) return;
    try { await api(`/api/admin/rooms/${code}`, 'DELETE'); void refresh(); } catch (err) { setError(err instanceof Error ? err.message : 'Không xóa được.'); }
  }

  const header = <header className="topbar"><Link href="/" className="brand"><span className="brand-mark">♞</span> CÁ NGỰA CÁCH MẠNG · QUẢN TRỊ</Link>{authed ? <button className="text-link" onClick={logout}>Đăng xuất</button> : <Link href="/" className="text-link">← Trang chủ</Link>}</header>;

  if (authed === null) return <main className="shell narrow">{header}<p className="muted">Đang kiểm tra phiên…</p></main>;
  if (!authed) return (
    <main className="shell narrow">{header}
      <form className="panel stack join-card" onSubmit={login}>
        <p className="eyebrow">QUẢN TRỊ</p><h1>Đăng nhập quản trị</h1>
        <p className="muted">Dành cho giảng viên hoặc người điều khiển. Mật khẩu là biến môi trường <code>ADMIN_PASSWORD</code> của máy chủ.</p>
        <label className="field">Mật khẩu<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" /></label>
        <button className="btn primary big" disabled={busy || !password}>Đăng nhập</button>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );

  return (
    <main className="shell admin">{header}
      <div className="admin-grid">
        <section className="panel stack">
          <h2>Tạo phòng mới</h2>
          <label className="field">Tên phòng<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} /></label>
          <label className="field">Thời gian trả lời mỗi câu: <b>{seconds} giây</b><input type="range" min={15} max={60} step={5} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} /></label>
          <label className="field">Xuất chuồng khi tung
            <select value={exitRule} onChange={(e) => setExitRule(e.target.value)}><option value="one-six">1 hoặc 6 (nhanh hơn)</option><option value="six">Chỉ 6 (luật cổ điển)</option></select></label>
          <label className="field">Số ngựa mỗi đội
            <select value={horses} onChange={(e) => { const h = Number(e.target.value); setHorses(h); setWinHome((w) => Math.min(w, h)); }}><option value={2}>2 ngựa (nhanh, khoảng 15 phút với 6 đội)</option><option value={3}>3 ngựa (nhiều chiến thuật hơn, khoảng 19 phút)</option></select></label>
          <label className="field">Đội thắng khi đưa về đích
            <select value={Math.min(winHome, horses)} onChange={(e) => setWinHome(Number(e.target.value))}><option value={1}>1 ngựa (rất nhanh)</option><option value={2}>2 ngựa{horses === 2 ? ' (cả đội)' : ''} (khuyên dùng)</option>{horses === 3 && <option value={3}>Cả 3 ngựa (dài)</option>}</select></label>
          <label className="field">Giới hạn thời gian ván: <b>{timeLimitMin} phút</b>
            <input type="range" min={10} max={20} step={1} value={timeLimitMin} onChange={(e) => setTimeLimitMin(Number(e.target.value))} />
            <small className="muted">Hết giờ, đội có nhiều ngựa về đích nhất (rồi đến tổng bước đi) thắng.</small></label>
          <button className="btn primary" disabled={busy} onClick={create}>Tạo phòng và mở trang điều khiển</button>
          {error && <p className="error">{error}</p>}
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Phòng đang mở ({rooms.length})</h2><span className="muted small">Tự cập nhật mỗi 3 giây</span></div>
          {rooms.length === 0 ? <p className="muted">Chưa có phòng nào. Hãy tạo phòng ở bên trái.</p> : (
            <table className="room-table">
              <thead><tr><th>Mã</th><th>Tên phòng</th><th>Trạng thái</th><th>Người chơi</th><th /></tr></thead>
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.code}>
                    <td><b className="code">{r.code}</b></td>
                    <td>{r.title}<br /><small className="muted">{new Date(r.createdAt).toLocaleTimeString('vi-VN')} · {r.winHome} ngựa về đích · {r.horses ?? 2} ngựa/đội</small></td>
                    <td><span className={`status ${r.status}`}>{STATUS[r.status]}</span>{r.status === 'playing' && <small className="muted"> · lượt {r.turn}</small>}</td>
                    <td>{r.players} người · {r.teams} đội</td>
                    <td className="row-actions">
                      <Link className="btn small primary" href={`/admin/rooms/${r.code}`}>Điều khiển</Link>
                      <Link className="text-link" href={`/rooms/${r.code}/board`} target="_blank">Màn chiếu ↗</Link>
                      <button className="text-link danger-link" onClick={() => remove(r.code)}>Xóa</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
