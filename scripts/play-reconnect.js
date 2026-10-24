// /play connection indicator: online -> server stops -> reconnecting -> server back -> online + same player.
// Starts and stops its own server (with a snapshot file so the player survives the restart).
//   node scripts/play-reconnect.js
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = process.env.PORT || '3112';
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');
const DATA = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vnr202-')), 'game.json');
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
const players = async () => (await fetch(`${BASE}/host/players`, { headers: { 'x-host-key': 'test' } })).json();
const step = (m) => console.log('✓', m);

(async () => {
  await start();
  await fetch(`${BASE}/host/joining/open`, { method: 'POST', headers: { 'x-host-key': 'test' } });
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext()).newPage();
    page.on('pageerror', (e) => { throw e; });
    await page.goto(`${BASE}/play/`);
    await page.fill('#f-code', 'ABCDE');
    await page.fill('#f-name', 'Ann');
    await page.selectOption('#f-team', '1');
    await page.click('#join-btn');
    await page.waitForSelector('#s-wait:not([hidden])');
    await page.waitForFunction(() => document.getElementById('conn-text').textContent.trim() === 'Trực tuyến');
    const before = (await players())[0];
    assert.ok(before.online);
    step('joined and online');

    await stop();
    await page.waitForFunction(() => document.getElementById('conn-text').textContent.trim() === 'Đang kết nối lại…' && document.getElementById('conn').classList.contains('is-off'));
    assert.ok(await page.$eval('#who', (e) => !e.hidden), 'the page keeps the player on screen while offline');
    step('server stopped: indicator shows reconnecting');

    await start();
    await page.waitForFunction(() => document.getElementById('conn-text').textContent.trim() === 'Trực tuyến', null, { timeout: 30000 });
    await page.waitForSelector('#s-wait:not([hidden])');
    assert.ok(await page.$eval('#s-join', (e) => e.hidden), 'does not fall back to the join screen');
    const after = await players();
    assert.strictEqual(after.length, 1, 'no duplicate player');
    assert.strictEqual(after[0].id, before.id, 'same player id');
    assert.ok(after[0].online, 'server sees the player online again');
    step('server back: indicator online again, same player rejoined');
    console.log('ALL OK');
  } finally {
    await browser.close();
    await stop();
  }
})().catch((e) => { console.error(e); process.exit(1); });
