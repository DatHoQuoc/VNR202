// Load check: 6 teams + 24 spectators (30 clients) polling every second through the Next proxy.
const base = process.argv[2] ?? 'http://localhost:3100';
const J = { 'Content-Type': 'application/json' };
const lat = [];
async function req(path, opt = {}) {
  const t = performance.now();
  const r = await fetch(base + path, opt);
  const body = await r.json();
  lat.push(performance.now() - t);
  return { r, body };
}
const ck = (r) => (r.headers.get('set-cookie') ?? '').split(';')[0];
const host = await req('/api/rooms', { method: 'POST', headers: J, body: '{}' });
const hostCookie = ck(host.r), code = host.body.code;
const teams = [];
for (let i = 0; i < 6; i++) { const j = await req(`/api/rooms/${code}/join`, { method: 'POST', headers: J, body: JSON.stringify({ name: `Đội ${i + 1}` }) }); teams.push({ id: j.body.viewer.teamId, cookie: ck(j.r) }); }
await req(`/api/rooms/${code}/command`, { method: 'POST', headers: { ...J, cookie: hostCookie }, body: JSON.stringify({ command: { type: 'start' } }) });
let done = false;
const pollers = Array.from({ length: 24 }, () => (async () => { while (!done) { await req(`/api/rooms/${code}`); await new Promise((r) => setTimeout(r, 1000)); } })());
let turns = 0, view;
while (turns < 600) {
  view = (await req(`/api/rooms/${code}`, { headers: { cookie: teams[0].cookie } })).body;
  if (view.game.phase === 'finished') break;
  const t = teams.find((x) => x.id === view.game.turnTeamId);
  const cmd = (action) => req(`/api/rooms/${code}/command`, { method: 'POST', headers: { ...J, cookie: t.cookie }, body: JSON.stringify({ command: { type: 'game', action } }) });
  const mine = (await req(`/api/rooms/${code}`, { headers: { cookie: t.cookie } })).body;
  const roll = mine.hand.find((c) => ['stun', 'barricade', 'push-back'].includes(c.kind));
  if (roll && !mine.game.skillUsed) { const foe = mine.game.order.find((o) => o !== t.id); await cmd({ type: 'play-skill', cardId: roll.id, targetHorseId: mine.game.players[foe].horses[0].id }); }
  await cmd({ type: 'roll' });
  await cmd({ type: 'answer', index: Math.floor(Math.random() * 4) });
  turns++;
}
done = true; await Promise.all(pollers);
lat.sort((a, b) => a - b);
console.log(`phase=${view.game.phase} winner=${view.game.winnerId} turns=${turns} requests=${lat.length} p50=${lat[lat.length >> 1].toFixed(1)}ms p99=${lat[Math.floor(lat.length * 0.99)].toFixed(1)}ms max=${lat.at(-1).toFixed(1)}ms`);
