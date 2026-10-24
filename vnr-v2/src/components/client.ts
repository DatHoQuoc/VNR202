'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomCommand, projectRoom } from '@/shared/room-core';

export type RoomView = ReturnType<typeof projectRoom>;

async function call(url: string, body?: unknown): Promise<RoomView> {
  const res = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST', cache: 'no-store',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Đã xảy ra lỗi.');
  return data as RoomView;
}

export type RoomMode = 'player' | 'admin' | 'projector';

export function useRoom(code: string, mode: RoomMode = 'player') {
  const base = mode === 'admin' ? '/api/admin/rooms' : '/api/rooms';
  const [view, setView] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [gone, setGone] = useState(false);
  const hadView = useRef(false);
  const offset = useRef(0);

  const apply = useCallback((next: RoomView) => { offset.current = next.serverNow - Date.now(); hadView.current = true; setView(next); }, []);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try { const next = await call(`${base}/${code}`); if (alive) { apply(next); setError(null); } }
      catch (e) { if (alive) { const m = e instanceof Error ? e.message : 'Mất kết nối.'; setError(m); if (mode === 'admin' && /đăng nhập/i.test(m)) setDenied(true); if (hadView.current && /Không tìm thấy phòng/.test(m)) setGone(true); } }
    };
    load();
    const timer = setInterval(load, 1000);
    return () => { alive = false; clearInterval(timer); };
  }, [code, apply, base, mode]);

  const send = useCallback(async (command: RoomCommand) => {
    setBusy(true);
    try { apply(await call(`${base}/${code}/command`, { command })); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không gửi được lệnh.'); }
    finally { setBusy(false); }
  }, [code, apply, base]);

  const join = useCallback(async (name: string, slot?: number) => {
    setBusy(true);
    try { apply(await call(`/api/rooms/${code}/join`, { name, slot })); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không tham gia được.'); }
    finally { setBusy(false); }
  }, [code, apply]);

  const serverNow = useCallback(() => Date.now() + offset.current, []);
  return { view, error, busy, denied, gone, send, join, serverNow };
}

/** Re-renders a few times a second so countdowns stay smooth between polls. */
export function useClock(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t); }, [intervalMs]);
  return now;
}
