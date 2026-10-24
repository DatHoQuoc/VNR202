// Screenshots of /stage/ at 1920x1080 with software WebGL (works headless, no GPU).
//   npm run build:stage && node scripts/stage-shots.js <step> [baseUrl]
// Starts its own server unless a baseUrl is given. Output: docs/stage-screenshots/step-<step>/
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const STEP = process.argv[2] || '2';
const EXTERNAL = process.argv[3];
const PORT = process.env.PORT || '3113';
const BASE = EXTERNAL || `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'stage-screenshots', `step-${STEP}`);

const SHOTS = {
  2: [
    ['01-room-hud-station-0', '?station=0&beat=1&debug=1'],
    ['02-room-beat-2-two-decisions-lit', '?station=5&beat=2&hud=1,2'],
    ['03-progress-9A-9B', '?station=9A&beat=2&hud=1'],
    ['04-last-station-all-lit', '?station=10&beat=2&hud=1,2,3'],
    ['05-no-webgl-message', '?station=0', { noWebgl: true }],
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function startServer() {
  const env = { ...process.env, HOST_KEY: 'test', ROOM_CODE: 'ABCDE', DATA_FILE: '', PORT };
  const s = spawn(process.execPath, [path.join(ROOT, 'node_modules/ts-node/dist/bin.js'), 'src/main.ts'], { cwd: ROOT, env, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return s; } catch (e) { /* not up yet */ }
    await sleep(500);
  }
  s.kill();
  throw new Error('server did not start');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = EXTERNAL ? null : await startServer();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    for (const [name, query, opts = {}] of SHOTS[STEP]) {
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      if (opts.noWebgl) await ctx.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => { throw e; });
      await page.goto(`${BASE}/stage/${query}`);
      await page.waitForFunction(() => document.body.dataset.ready, null, { timeout: 30000 });
      await sleep(opts.wait ?? 700);
      await page.screenshot({ path: path.join(OUT, `${name}.png`) });
      console.log('saved', name);
      await ctx.close();
    }
  } finally {
    await browser.close();
    if (server) server.kill('SIGKILL');
  }
})().catch((e) => { console.error(e); process.exit(1); });
