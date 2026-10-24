'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { SkillCardView } from './room-view';
import { SKILLS } from '@/game/skills';
import type { Question } from '@/game/types';

/** Skill deck (public) and the question bank with answers (room host only). */
export function CardLibrary({ code }: { code?: string }) {
  const [bank, setBank] = useState<Question[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!code) return;
    fetch(`/api/admin/rooms/${code}/bank`, { cache: 'no-store' })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setBank(d.questions); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Không tải được ngân hàng câu hỏi.'));
  }, [code]);

  const shown = useMemo(() => (bank ?? []).filter((q) => `${q.id} ${q.text} ${q.correct} ${q.explain}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi'))), [bank, query]);
  const total = SKILLS.reduce((n, s) => n + s.copies, 0);
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(bank, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'vnr202-chuong1-cau-hoi.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <>
      <header className="topbar"><Link href="/" className="brand"><span className="brand-mark">♞</span> CÁ NGỰA CÁCH MẠNG</Link>{code ? <Link href={`/admin/rooms/${code}`} className="text-link">← Về phòng điều khiển</Link> : <Link href="/" className="text-link">← Trang chủ</Link>}</header>
      <main className="shell library">
        <section>
          <p className="eyebrow">BỘ BÀI KỸ NĂNG · {SKILLS.length} LOẠI · {total} THẺ</p>
          <h1>Thẻ kỹ năng</h1>
          <div className="deck-note">
            <div><b>Cách nhận:</b> trả lời đúng một câu hỏi → rút ngẫu nhiên 1 thẻ từ bộ bài. Sai hoặc hết giờ vẫn đi nhưng không có thẻ.</div>
            <div><b>Cách dùng:</b> thẻ đỏ (chặn đối thủ) và thẻ xanh (tự thân) dùng trước khi đổ xúc xắc, 1 thẻ mỗi lượt. Thẻ vàng dùng khi đang trả lời.</div>
            <div><b>Giới hạn:</b> tay tối đa 5 thẻ. Đối thủ chỉ thấy số thẻ của bạn, không thấy là thẻ gì. Khiên chặn được 1 thẻ đỏ.</div>
          </div>
        </section>
        <section className="deck-gallery">{SKILLS.map((s) => <div key={s.kind} style={{ textAlign: 'center' }}><SkillCardView kind={s.kind} big /><p className="muted small">Trong bộ bài: ×{s.copies}</p></div>)}</section>

        <section className="panel">
          <p className="eyebrow">NGÂN HÀNG CÂU HỎI · CHƯƠNG I</p>
          <h2>{bank ? `${bank.length} câu hỏi trắc nghiệm` : 'Ngân hàng câu hỏi'}</h2>
          {!code && <p className="muted">Đáp án chỉ hiển thị cho quản trị để không lộ đề. Hãy đăng nhập <Link href="/admin">trang quản trị</Link> rồi mở liên kết <b>“Thẻ & câu hỏi”</b> trong phòng điều khiển.</p>}
          {error && <p className="error">{error}</p>}
          {bank && (
            <>
              <div className="q-tools"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm theo từ khóa, ví dụ: 1930, Cương lĩnh…" /><button className="btn" onClick={download}>Tải JSON</button><span className="muted small">Hiển thị {shown.length}/{bank.length}</span></div>
              <div className="q-list">
                {shown.map((q) => (
                  <article key={q.id} className="q-card">
                    <p className="eyebrow">{q.id} · {q.ref}</p>
                    <h3>{q.text}</h3>
                    <div className="q-opts"><span className="ok">✓ {q.correct}</span>{q.wrong.map((w) => <span key={w}>{w}</span>)}</div>
                    <p className="small"><b>Gợi ý:</b> {q.hint}</p>
                    <p className="small muted"><b>Giải thích:</b> {q.explain}</p>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </main>
    </>
  );
}
