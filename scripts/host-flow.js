// Runs a whole session using only the MC dashboard's "Bước tiếp theo" button.
//   HOST_KEY=test ROOM_CODE=ABCDE DATA_FILE= npm run dev   (fresh server, in another shell)
//   node scripts/host-flow.js [baseUrl] [screenshotDir]
const { chromium } = require('playwright');
const assert = require('assert');

const BASE = process.argv[2] || 'http://127.0.0.1:3000';
const SHOTS = process.argv[3] || '';
const KEY = process.env.HOST_KEY || 'test';

const api = async (path, method = 'GET', body) => {
  const r = await fetch(`${BASE}/host/${path}`, { method, headers: { 'x-host-key': KEY, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok && r.status !== 409) throw new Error(`${method} ${path} -> ${r.status}`);
  return r.json().catch(() => null);
};
const step = (m) => console.log('✓', m);

(async () => {
  const browser = await chromium.launch();
  const newPage = async (w = 1280, h = 900) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => { throw e; });
    return { ctx, page };
  };
  const H = (await newPage(1280, 1000)).page;
  const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }) : null);
  const label = () => H.textContent('#next').then((t) => t.trim());
  const waitLabel = (re) => H.waitForFunction((src) => new RegExp(src).test(document.getElementById('next').textContent) && !document.getElementById('next').disabled, re.source, { timeout: 6000 })
    .catch(async (e) => { throw new Error(`label never matched ${re}; it is "${await label()}"`); });
  const click = async (re) => { await waitLabel(re); await H.click('#next'); };
  const confirm = async () => { await H.waitForSelector('#confirm:not([hidden])'); await H.click('#confirm-yes'); await H.waitForSelector('#confirm', { state: 'hidden' }); };

  // ----- login -----
  await H.goto(`${BASE}/host/`);
  await H.waitForSelector('#login:not([hidden])');
  await H.fill('#key', 'wrong-key');
  await H.click('#login-form button[type=submit]');
  await H.waitForSelector('#login-err:not([hidden])');
  assert.match(await H.textContent('#login-err'), /không đúng/);
  assert.ok(await H.$eval('#dash', (e) => e.hidden), 'dashboard stays hidden on a wrong key');
  await shot(H, '01-login-error');
  await H.fill('#key', KEY);
  await H.click('#login-form button[type=submit]');
  await H.waitForSelector('#dash:not([hidden])');
  assert.strictEqual((await H.textContent('#code')).trim(), 'ABCDE');
  assert.ok(!H.url().includes(KEY), 'key not in URL');
  assert.strictEqual(await H.evaluate(() => localStorage.length), 0, 'nothing in localStorage');
  step('wrong key rejected, right key opens the dashboard (key only in sessionStorage)');
  await H.waitForFunction(() => /Trực tuyến|trực tuyến/.test(document.getElementById('conn-text').textContent));
  await shot(H, '02-start');

  // ----- out-of-order action -> banner -----
  await waitLabel(/Mở phòng cho học sinh/);
  await H.route('**/host/joining/open', async (route) => {
    await api('joining/open', 'POST'); // someone else already did it
    await route.continue();
  });
  await H.click('#next');
  await H.waitForSelector('#banner:not([hidden])');
  assert.match(await H.textContent('#banner-text'), /Cannot open joining.*\(409\)/);
  await shot(H, '03-banner-409');
  await H.unroute('**/host/joining/open');
  await waitLabel(/Vòng 1: mở bước CHỌN/);
  await H.click('#banner-x');
  assert.ok(await H.$eval('#banner', (e) => e.hidden));
  step('out-of-order click shows the server message in the banner, then the dashboard resyncs');

  // ----- players join with the code shown on the dashboard -----
  const code = (await H.textContent('#code')).trim();
  const names = [['Ann', 1], ['Binh', 2], ['Chi', 3], ['Dung', 4]];
  const P = {};
  for (const [name, team] of names) {
    const { page } = await newPage(1000, 760);
    page.on('pageerror', (e) => { throw e; });
    await page.goto(`${BASE}/play/`);
    await page.fill('#f-code', code);
    await page.fill('#f-name', name);
    await page.selectOption('#f-team', String(team));
    await page.click('#join-btn');
    await page.waitForSelector('#s-wait:not([hidden])');
    P[name] = page;
  }
  await H.waitForFunction(() => document.getElementById('joined').textContent === '4' && document.getElementById('online').textContent === '4');
  assert.strictEqual(await H.locator('#player-table tbody tr').count(), 4);
  step('4 players joined; counts and the players table update live');

  // ----- station 0 -----
  await H.fill('#calc-d', '12');
  await H.fill('#calc-total', '30');
  await H.click('#calc-form button');
  assert.strictEqual(await H.inputValue('#open-pct'), '40');
  await H.click('#open-form button[type=submit]');
  await H.waitForFunction(() => /40%/.test(document.getElementById('open-state').textContent));
  assert.strictEqual((await api('state')).openingPercent, 40);
  step('station 0: x% computed from the hand count and saved');

  const pickAll = async (opts) => {
    for (const [name] of names) {
      await P[name].waitForSelector('#s-pick:not([hidden])');
      await P[name].click(`.opt[data-option="${opts[name]}"]`);
      await P[name].waitForSelector('#pick-sent:not([hidden])');
    }
  };
  const guessAll = async (vals) => {
    for (const [name] of names) {
      await P[name].waitForSelector('#s-guess:not([hidden])');
      await P[name].fill('#guess-input', String(vals[name]));
      await P[name].click('#guess-btn');
      await P[name].waitForSelector('#guess-sent:not([hidden])');
    }
  };
  const pickMap = { Ann: 'B', Binh: 'B', Chi: 'D', Dung: 'A' };
  const guessMap = { Ann: 30, Binh: 40, Chi: 50, Dung: 60 };

  // ----- round 1 -----
  await click(/Vòng 1: mở bước CHỌN/);
  await H.waitForFunction(() => /Vòng 1/.test(document.getElementById('phase').textContent) && /CHỌN/.test(document.getElementById('phase').textContent));
  await pickAll(pickMap);
  await H.waitForFunction(() => document.getElementById('c-picks').textContent === '4');
  assert.strictEqual(await H.locator('#res-body .bar-row').count(), 0, 'no distribution before reveal');
  await shot(H, '04-live-pick');
  await click(/Vòng 1: mở bước ĐOÁN/);
  await guessAll(guessMap);
  await H.waitForFunction(() => document.getElementById('c-guesses').textContent === '4');
  await waitLabel(/Vòng 1: CÔNG BỐ/);
  assert.strictEqual(await H.locator('#res-body .bar-row').count(), 0, 'no distribution before reveal');
  await H.click('#next');
  await H.waitForSelector('#confirm:not([hidden])');
  await shot(H, '05-confirm-reveal');
  assert.strictEqual(await H.locator('#res-body .bar-row').count(), 0, 'confirm alone reveals nothing');
  await H.click('#confirm-no');
  assert.strictEqual((await api('state')).rounds[0].phase, 'guess', 'cancel does not reveal');
  await click(/Vòng 1: CÔNG BỐ/);
  await confirm();
  await H.waitForSelector('#res-body .bar-row');
  assert.strictEqual(await H.locator('#res-body .bar-row').count(), 4);
  for (const [n] of names) await P[n].waitForSelector('#s-result:not([hidden])');
  await shot(H, '06-reveal');
  step('round 1: pick, guess, reveal behind a confirm (cancel does nothing), distribution only after reveal');

  // ----- excuse Dung in round 1 -----
  const dungId = (await api('players')).find((p) => p.name === 'Dung').id;
  const cell = H.locator('#player-table tbody tr', { hasText: 'Dung' }).locator('td').nth(4).locator('button');
  await cell.click();
  await H.waitForFunction(() => [...document.querySelectorAll('#player-table tbody tr')].some((r) => /Dung/.test(r.textContent) && /Đã miễn/.test(r.textContent)));
  assert.ok((await api('rounds/1')).excused.includes(dungId));
  await P.Dung.waitForSelector('#res-excused:not([hidden])');
  await shot(H, '07-players-excuse');
  await cell.click(); // toggle back
  await H.waitForFunction(() => [...document.querySelectorAll('#player-table tbody tr')].every((r) => !/Đã miễn/.test(r.textContent)));
  assert.ok(!(await api('rounds/1')).excused.includes(dungId));
  step('excuse toggles on and off; the player is told the round does not count');

  // ----- round 2, with reload of the dashboard mid-round -----
  await click(/Vòng 2: mở bước CHỌN/);
  await pickAll({ Ann: 'D', Binh: 'D', Chi: 'D', Dung: 'A' });
  await click(/Vòng 2: mở bước ĐOÁN/);
  await H.reload();
  await H.waitForSelector('#dash:not([hidden])');
  await waitLabel(/Vòng 2: CÔNG BỐ/);
  assert.match(await H.textContent('#phase'), /Vòng 2 · đang ĐOÁN/);
  assert.strictEqual((await H.textContent('#code')).trim(), 'ABCDE');
  assert.strictEqual(await H.locator('#steps li.cur').count(), 1);
  assert.match(await H.textContent('#steps li.cur'), /Vòng 2: CÔNG BỐ/);
  step('reload mid-round keeps the session and shows the correct step');
  // logging out and re-entering the key gives the same screen
  await H.click('#logout');
  await H.waitForSelector('#login:not([hidden])');
  await H.fill('#key', KEY);
  await H.click('#login-form button[type=submit]');
  await H.waitForSelector('#dash:not([hidden])');
  await waitLabel(/Vòng 2: CÔNG BỐ/);
  step('logout and re-entering the key restores the same state');

  await guessAll({ Ann: 70, Binh: 75, Chi: 80, Dung: 20 });
  await H.click('#next');
  await confirm();
  await H.waitForFunction(() => /Đầu buổi 40%/.test(document.getElementById('res-body').textContent));
  await shot(H, '08-reveal-comparison');
  step('round 2 shows the opening-vs-now comparison on the dashboard');

  // ----- round 3 is voided -----
  await click(/Vòng 3: mở bước CHỌN/);
  await H.locator('#round-table tbody tr', { hasText: 'Vòng 3' }).locator('button').click();
  await H.waitForSelector('#confirm:not([hidden])');
  assert.match(await H.textContent('#confirm-text'), /Hủy vòng 3/);
  await shot(H, '09-confirm-void');
  await H.click('#confirm-yes');
  await H.waitForFunction(() => /ĐÃ HỦY/.test(document.getElementById('round-table').textContent));
  await waitLabel(/Vòng 4: mở bước CHỌN/);
  await P.Ann.waitForFunction(() => /đã bị huỷ/.test(document.getElementById('wait-title').textContent));
  assert.strictEqual((await api('state')).rounds[2].voided, true);
  step('round 3 voided behind a confirm; sequence moves on to round 4');

  // ----- round 4 -----
  await H.click('#next');
  await pickAll({ Ann: 'C', Binh: 'C', Chi: 'A', Dung: 'D' });
  await click(/Vòng 4: mở bước ĐOÁN/);
  await guessAll({ Ann: 25, Binh: 25, Chi: 50, Dung: 25 });
  await click(/Vòng 4: CÔNG BỐ/);
  await confirm();
  await H.waitForFunction(() => /Đáp án đúng: C/.test(document.getElementById('res-body').textContent));
  assert.ok((await H.locator('#rank-table tbody tr').count()) >= 4);
  assert.match(await H.textContent('#rank-table caption, h2:has(+ #rank-table), section:has(#rank-table) h2'), /ẩn với lớp/);
  await shot(H, '10-players-ranking');
  step('round 4 shows the correct option; the MC-only ranking is filled and labelled');

  // ----- announce -----
  await click(/Bắt đầu công bố xếp hạng/);
  await confirm();
  for (const rank of [4, 3, 2, 1]) {
    await click(new RegExp(`Công bố hạng ${rank}$`));
  }
  for (const [n] of names) await P[n].waitForSelector('#s-finale:not([hidden])');
  assert.strictEqual((await api('state')).finale.revealed, 4);
  await shot(H, '11-announce-done');
  step('announce: confirm, then one click per team (rank 4 to 1); players see the finale');

  // ----- reflections -----
  await click(/Mở khung cảm nhận/);
  for (const n of ['Ann', 'Binh']) {
    await P[n].waitForSelector('#s-reflect:not([hidden])');
    await P[n].fill('#ref-text', `Cảm nhận của ${n} <b>không phải html</b>`);
    await P[n].click('#ref-btn');
    await P[n].waitForSelector('#s-thanks:not([hidden])');
  }
  await H.waitForFunction(() => document.querySelectorAll('#ref-list li').length === 2);
  assert.strictEqual(await H.locator('#ref-list b').count(), 0, 'reflection text is not parsed as html');
  assert.match(await H.textContent('#ref-list'), /<b>không phải html<\/b>/);
  assert.deepStrictEqual(await (await fetch(`${BASE}/wall`)).json(), []);
  await H.locator('#ref-list li', { hasText: 'Ann' }).locator('button').click();
  await H.waitForFunction(() => /1 đã duyệt/.test(document.getElementById('ref-state').textContent));
  const wall = await (await fetch(`${BASE}/wall`)).json();
  assert.strictEqual(wall.length, 1);
  assert.match(wall[0].text, /Ann/);
  await shot(H, '12-reflections');
  step('reflections: shown as text, approve one, only it appears at /wall');

  // ----- end -----
  await click(/Kết thúc buổi chơi/);
  await confirm();
  await H.waitForFunction(() => /Đã kết thúc/.test(document.getElementById('phase').textContent));
  assert.ok(await H.$eval('#next', (b) => b.disabled));
  assert.strictEqual(await H.locator('#steps li.done').count(), await H.locator('#steps li').count());
  await shot(H, '13-ended');
  step('end behind a confirm; the button is disabled afterwards');

  // ----- download -----
  const [dl] = await Promise.all([H.waitForEvent('download'), H.click('#download')]);
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  assert.strictEqual(data.code, 'ABCDE');
  assert.strictEqual(data.players.length, 4);
  assert.strictEqual(data.rounds[2].voided, true);
  step(`results downloaded as ${dl.suggestedFilename()}`);

  await browser.close();
  console.log('ALL OK');
})().catch((e) => { console.error(e); process.exit(1); });
