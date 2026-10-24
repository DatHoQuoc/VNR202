/** Room code and short join address for the "open your laptop" screen. */

const CODE_KEY = 'vnr202.stage.code';

/**
 * The room code is not part of the public state, so the MC passes it once: /stage/?code=ABCDE.
 * It is remembered for the tab (sessionStorage) so a reload does not lose it.
 */
export function roomCode(search = window.location.search): string | null {
  const q = new URLSearchParams(search).get('code');
  if (q && q.trim()) {
    const code = q.trim().toUpperCase();
    try { sessionStorage.setItem(CODE_KEY, code); } catch { /* ignore */ }
    return code;
  }
  try { return sessionStorage.getItem(CODE_KEY); } catch { return null; }
}

/** Short address students type, e.g. "192.168.1.20:3000/play". */
export function joinAddress(loc: Pick<Location, 'host'> = window.location): string {
  return `${loc.host}/play`;
}
