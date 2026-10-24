'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Player entrance: just a room code. Team and name are chosen inside the room lobby. */
export function PlayEntry({ initialCode = '' }: { initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/rooms/${c}`, { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Không tìm thấy phòng.');
      router.push(`/rooms/${c}`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Không vào được phòng.'); setBusy(false); }
  }

  return (
    <main className="shell narrow">
      <header className="topbar"><Link href="/" className="brand"><span className="brand-mark">♞</span> CÁ NGỰA CÁCH MẠNG</Link><Link href="/" className="text-link">← Trang chủ</Link></header>
      <form className="panel stack join-card" onSubmit={go}>
        <p className="eyebrow">NGƯỜI CHƠI</p>
        <h1>Vào phòng chơi</h1>
        <p className="muted">Nhập mã 5 ký tự do quản trị cung cấp. Bước tiếp theo bạn sẽ nhập tên và chọn đội của mình.</p>
        <label className="field">Mã phòng<input className="code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={5} placeholder="VD: K7M2Q" autoFocus /></label>
        <button className="btn primary big" disabled={busy || code.trim().length < 5}>Vào phòng</button>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}
