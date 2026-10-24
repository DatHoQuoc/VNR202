// Plays a real session against /stage/ (9A beats, then 9B live with fake players through the host API)
// and saves screenshots. Starts its own server (with a snapshot file so it can be restarted).
//   npm run build:stage && node scripts/stage-flow.js [outDir]
const { chromium } = require('playwright');
const { io } = require('socket.io-client');
const { spawn } = require('child_process');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = process.env.PORT || '3115';
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, 'docs', 'stage-screenshots', 'step-3');
const DATA = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vnr202-stage-')), 'game.json');
const env = { ...process.env, HOST_KEY: 'test', ROOM_CODE: 'ABCDE', DATA_FILE: DATA, PORT };

let server = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function start() {
  server = spawn(process.execPath, [path.join(ROOT, 'node_modules/ts-node/dist/bin.js'), 'src/main.ts'], { cwd: ROOT, env, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch (e) { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('server did not start');
}
async function stop() {
  if (!server) return;
  const s = server;
  server = null;
  s.kill('SIGKILL');
  await new Promise((r) => s.once('exit', r));
}
const host = async (p, method = 'POST', body) => {
  const r = await fetch(`${BASE}/host/${p}`, { method, headers: { 'x-host-key': 'test', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${await r.text()}`);
  return r.json().catch(() => null);
};
const step = (m) => console.log('✓', m);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await start();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const sockets = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_CONNECTION_REFUSED/.test(m.text()) && errors.push(m.text()));
    const shot = async (name, wait = 900) => { await sleep(wait); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log('  saved', name); };
    const ready = () => page.waitForFunction(() => document.body.dataset.ready, null, { timeout: 30000 });
    const at = () => page.evaluate(() => document.body.dataset.station + ':' + document.body.dataset.beat);
    const hudOn = () => page.locator('.hud .box.on').count();
    const open = async (q) => { await page.goto(`${BASE}/stage/?${q}`); await ready(); };

    // ---------- 9A: six beats, nothing about the three decisions ----------
    const names9a = ['1-title', '2-muc-tieu', '3-hai-cot', '4-quoc-te-vai-tro', '5-moi-ca-lop', '6-vao-phong'];
    for (let i = 1; i <= 6; i++) {
      await open(`station=9A&beat=${i}&code=ABCDE`);
      assert.strictEqual(await hudOn(), 0, '9A must not light any decision box');
      await shot(`9A-${names9a[i - 1]}`, 1200);
    }
    assert.match(await page.textContent('.join-addr'), /\/play$/);
    assert.strictEqual((await page.textContent('.join-code')).trim(), 'ABCDE');
    step('9A: six beats, no decision box lit, join screen shows address and room code');

    // ---------- 9B: live session ----------
    await open('station=9B&beat=1&code=ABCDE');
    await shot('9B-01-quy-tac');
    await host('joining/open');
    const players = [];
    for (let t = 1; t <= 6; t++) for (const k of [0, 1]) players.push({ name: `P${t}${k}`, team: t });
    for (const p of players) {
      p.s = io(BASE, { transports: ['websocket'], forceNew: true });
      sockets.push(p.s);
      await new Promise((r) => p.s.on('connect', r));
      const ack = await new Promise((r) => p.s.emit('player:join', { code: 'ABCDE', name: p.name, team: p.team }, r));
      p.id = ack.data.playerId;
    }
    const emit = (p, ev, body) => new Promise((r) => p.s.emit(ev, body, r));
    const dist = [['B', 'B', 'A', 'B', 'D', 'B', 'A', 'B', 'C', 'B', 'D', 'A'], ['D', 'D', 'D', 'A', 'D', 'C', 'D', 'D', 'B', 'D', 'D', 'A'], ['A', 'A', 'D', 'A', 'B', 'A', 'D', 'A', 'A', 'C', 'A', 'D'], ['C', 'C', 'C', 'A', 'C', 'B', 'C', 'D', 'C', 'C', 'A', 'C']];

    await host('opening', 'POST', { percent: 40 });
    const names = ['1-nhiem-vu', '2-luc-luong', '3-phuong-phap', '4-dap-an'];
    for (let n = 1; n <= 4; n++) {
      await host(`rounds/${n}/open-pick`);
      await page.waitForFunction((k) => document.body.dataset.beat === String(k + 1), n);
      await page.waitForSelector('.live .opts .opt');
      assert.strictEqual(await page.locator('.live .bar').count(), 0, 'no distribution while picking');
      assert.match(await page.textContent('.live .lower'), /Hạ màn hình xuống, nhìn lên máy chiếu\./);
      await shot(`9B-r${n}-a-chon`);
      for (let i = 0; i < players.length; i++) await emit(players[i], 'answer:pick', { round: n, option: dist[n - 1][i] });
      await host(`rounds/${n}/open-guess`);
      await page.waitForSelector('.live.view-guess');
      assert.strictEqual(await page.locator('.live .bar').count(), 0, 'no distribution while guessing');
      await shot(`9B-r${n}-b-doan`);
      for (let i = 0; i < players.length; i++) await emit(players[i], 'answer:guess', { round: n, value: 20 + ((i * 7 + n * 11) % 50) });
      const litBefore = await hudOn();
      await host(`rounds/${n}/reveal`);
      await page.waitForSelector('.live.view-reveal .bar');
      await shot(`9B-r${n}-c-ket-qua`, 3500);
      if (n <= 3) assert.strictEqual(await hudOn(), n, `box ${n} lit after round ${n}`);
      else assert.strictEqual(await hudOn(), 3);
      assert.ok(litBefore === (n <= 3 ? n - 1 : 3));
      if (n === 2) assert.match(await page.textContent('.compare'), /đầu buổi 40% → bây giờ \d+(\.\d)?% chọn 'đánh đổ'/);
      if (n === 4) assert.match(await page.textContent('.answer .ans'), /^C —/);
      step(`round ${n}: question, guess, reveal bars${n === 2 ? ' + comparison + rings' : ''}${n === 4 ? ' + correct answer' : ''}; auto-followed by the stage`);
    }

    // ---------- finale ----------
    await host('announce/start');
    await page.waitForSelector('.live.finale');
    assert.strictEqual(await page.locator('.frow.on').count(), 0);
    assert.strictEqual(await page.locator('.frow .tm', { hasText: '?' }).count(), 6);
    await shot('9B-finale-a-an');
    await host('announce/next');
    await page.waitForFunction(() => document.querySelectorAll('.frow.on').length === 1);
    await shot('9B-finale-b-hang-6');
    for (let i = 0; i < 5; i++) await host('announce/next');
    await page.waitForFunction(() => document.querySelectorAll('.frow.on').length === 6 && document.querySelector('.top1.on'));
    assert.ok((await page.locator('.top1 .pr').count()) >= 4, 'rank 1 shows per-round scores');
    await shot('9B-finale-c-hien-het', 1500);
    step('finale: hidden board, rank 6 first, rank 1 with per-round scores');

    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.body.dataset.beat === '7');
    await shot('9B-07-viet-cam-nhan', 1200);

    // ---------- the socket drops ----------
    await stop();
    await page.waitForSelector('.offline:not([hidden])', { timeout: 20000 });
    await shot('9B-mat-ket-noi', 500);
    await start();
    await page.waitForSelector('.offline', { state: 'hidden', timeout: 40000 });
    assert.strictEqual(await at(), '9B:7');
    step('server stopped: "mất kết nối" note appears; server back: note gone, stage state kept');

    // going back shows the stored finale again
    await page.keyboard.press('ArrowLeft');
    await page.waitForSelector('.live.finale');
    assert.strictEqual(await page.locator('.frow.on').count(), 6);
    assert.deepStrictEqual(errors, [], 'no console errors');
    step('going back to the finale beat shows the revealed board; no console errors');
    console.log('ALL OK');
  } finally {
    sockets.forEach((s) => s.close());
    await browser.close();
    await stop();
  }
})().catch((e) => { console.error(e); process.exit(1); });
