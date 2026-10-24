'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SKILLS } from '@/game/skills';

export function Landing({ initialCode = '' }: { initialCode?: string }) {
  const router = useRouter();
  const [title, setTitle] = useState('Cá Ngựa Cách Mạng · Lớp VNR202');
  const [seconds, setSeconds] = useState(30);
  const [winHome, setWinHome] = useState(1);
  const [exitRule, setExitRule] = useState('one-six');
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, questionSeconds: seconds, winHome, exitRule }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/rooms/${data.code}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tạo được phòng.'); setBusy(false); }
  }

  return (
    <main className="shell landing">
      <header className="topbar"><span className="brand"><span className="brand-mark">♞</span> CÁ NGỰA CÁCH MẠNG</span><span className="muted">VNR202 · Chương I · phiên bản 2</span></header>
      <section className="hero">
        <div>
          <p className="eyebrow">LỊCH SỬ ĐẢNG CỘNG SẢN VIỆT NAM · ÔN TẬP THEO ĐỘI</p>
          <h1>Đưa ngựa về đích <em>3/2/1930</em></h1>
          <p className="lead">Sáu người chơi, mỗi người điều khiển một con ngựa, cùng đua trên một bàn cờ. Mỗi lượt đổ xúc xắc, trả lời một câu hỏi về sự ra đời của Đảng và Cương lĩnh chính trị đầu tiên. Đúng thì nhận <b>thẻ kỹ năng</b> để tăng tốc hoặc chặn đường đối thủ. Đội nào về đích trước sẽ thắng.</p>
        </div>
        <div className="stack">
          <div className="panel stack">
            <h2>Người điều khiển: tạo phòng</h2>
            <label className="field">Tên phòng<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} /></label>
            <label className="field">Thời gian trả lời mỗi câu: <b>{seconds} giây</b><input type="range" min={15} max={60} step={5} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} /></label>
            <label className="field">Xuất chuồng khi tung
              <select value={exitRule} onChange={(e) => setExitRule(e.target.value)}><option value="one-six">1 hoặc 6 (nhanh hơn)</option><option value="six">Chỉ 6 (luật cổ điển)</option></select></label>
            <label className="field">Đội thắng khi có bao nhiêu ngựa về đích
              <select value={winHome} onChange={(e) => setWinHome(Number(e.target.value))}><option value={1}>1 ngựa (ván nhanh, khoảng 25 phút)</option><option value={2}>2 ngựa</option><option value={3}>3 ngựa</option><option value={6}>Tất cả ngựa của đội (rất dài)</option></select></label>
            <button className="btn primary" disabled={busy} onClick={create}>Tạo phòng mới</button>
          </div>
          <form className="panel stack" onSubmit={(e) => { e.preventDefault(); router.push(`/rooms/${code.trim().toUpperCase()}`); }}>
            <h2>Người chơi: vào phòng</h2>
            <label className="field">Mã phòng<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={5} placeholder="VD: K7M2Q" /></label>
            <button className="btn" disabled={code.trim().length < 5}>Tiếp tục</button>
          </form>
          {error && <p className="error">{error}</p>}
        </div>
      </section>

      <section className="rules">
        <div className="panel">
          <h2>Luật chơi</h2>
          <ol>
            <li><b>6 đội</b> (màu cố định). Mỗi người vào đội có <b>một con ngựa riêng</b>, tối đa 6 người mỗi đội. Các thành viên trong đội lần lượt đến lượt.</li>
            <li><b>Xuất chuồng:</b> tung <b>1 hoặc 6</b> (hoặc chỉ 6 nếu chọn luật cổ điển) mới đưa ngựa ra ô xuất phát ★.</li>
            <li>Mỗi lượt: (tuỳ chọn) dùng <b>1 thẻ kỹ năng</b> → <b>đổ xúc xắc</b> → trả lời <b>1 câu hỏi</b>. <b>Đúng</b>: nhận <b>1 thẻ</b>. <b>Sai / hết giờ</b>: không có thẻ nhưng ngựa vẫn đi.</li>
            <li><b>Đá ngựa:</b> đáp xuống ô có ngựa đội khác (trừ ô ★ an toàn) thì ngựa đó bị <b>đá về chuồng</b>. Tung 6, đá ngựa hoặc về đích được <b>tung thêm lượt</b> (tối đa 2 lần liên tiếp).</li>
            <li>Đi hết một vòng rồi rẽ vào <b>đường về nhà</b> (không ai đá được). Đội có đủ số ngựa về đích trước (mặc định 1) thắng.</li>
          </ol>
        </div>
        <div className="panel">
          <h2>10 thẻ kỹ năng · <a className="text-link" href="/cards">xem thẻ ở kích thước lớn →</a></h2>
          <ul className="skill-legend">
            {SKILLS.map((s) => <li key={s.kind}><span>{s.icon}</span><div><b>{s.name}</b> <small>×{s.copies}</small><br /><small>{s.description}</small></div></li>)}
          </ul>
        </div>
      </section>
    </main>
  );
}
