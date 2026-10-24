// Browser walk-through of /play against a running server.
//   HOST_KEY=test ROOM_CODE=ABCDE DATA_FILE= npm run dev   (in another shell)
//   node scripts/play-flow.js [baseUrl] [screenshotDir]
const { chromium } = require('playwright');
const assert = require('assert');

const BASE = process.argv[2] || 'http://127.0.0.1:3000';
const SHOTS = process.argv[3] || '';
const KEY = process.env.HOST_KEY || 'test';
const CODE = process.env.ROOM_CODE || 'ABCDE';

const host = async (path, method = 'POST', body) => {
  const r = await fetch(`${BASE}/host/${path}`, { method, headers: { 'x-host-key': KEY, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${await r.text()}`);
  return r.json().catch(() => null);
};
const visible = (page, id) => page.waitForSelector(`#${id}:not([hidden])`, { timeout: 4000 });
const only = async (page, id) => {
  await visible(page, 's-' + id);
  for (const s of ['join', 'wait', 'pick', 'guess', 'result', 'finale']) {
    const hidden = await page.$eval(`#s-${s}`, (e) => e.hidden);
    assert.strictEqual(hidden, s !== id, `#s-${s} hidden=${hidden}, expected screen ${id}`);
  }
};
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }) : null);
const step = (m) => console.log('✓', m);

(async () => {
  const browser = await chromium.launch();
  const mk = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 }, ...opts });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => { throw e; });
    await page.goto(`${BASE}/play/`);
    return { ctx, page };
  };
  const join = async (page, name, team, code = CODE) => {
    await page.fill('#f-code', code);
    await page.fill('#f-name', name);
    await page.selectOption('#f-team', String(team));
    await page.click('#join-btn');
  };

  const A = await mk(), B = await mk(), C = await mk();
  // E has no usable localStorage at all (private window / blocked site data)
  const E = { ctx: await browser.newContext({ viewport: { width: 1100, height: 760 } }) };
  await E.ctx.addInitScript(() => {
    const boom = () => { throw new Error('storage blocked'); };
    Object.defineProperty(window, 'localStorage', { get: boom });
  });
  E.page = await E.ctx.newPage();
  E.page.on('pageerror', (e) => { throw e; });
  await E.page.goto(`${BASE}/play/`);
  await visible(A.page, 's-join');
  assert.strictEqual(await A.page.locator('#f-team option').count(), 7, 'placeholder + 6 teams');
  await A.page.fill('#f-code', 'abcde');
  assert.strictEqual(await A.page.inputValue('#f-code'), 'ABCDE', 'code auto-uppercase');

  // join before the room is open
  await join(A.page, 'An', 1);
  await A.page.waitForSelector('#join-err:not([hidden])');
  assert.match(await A.page.textContent('#join-err'), /chưa mở/);
  await shot(A.page, '01-join-error');
  step('join refused while the room is closed, error shown');

  await host('joining/open');
  await join(A.page, 'An', 1, 'WRONG');
  await A.page.waitForSelector('#join-err:not([hidden])');
  assert.match(await A.page.textContent('#join-err'), /Mã phòng không đúng/);
  step('wrong code shows an error');

  await join(A.page, 'An', 1);
  await join(B.page, 'Binh', 2);
  await join(C.page, 'Chi', 3);
  await join(E.page, 'Em', 6);
  for (const p of [A, B, C, E]) await only(p.page, 'wait');
  await shot(A.page, '02-waiting');
  assert.strictEqual((await host('players', 'GET')).length, 4);
  step('4 players joined (one without localStorage), waiting screen');

  // round 1
  await host('rounds/1/open-pick');
  for (const p of [A, B, C, E]) await only(p.page, 'pick');
  assert.strictEqual(await A.page.locator('.opt').count(), 4);
  await E.page.click('.opt[data-option="A"]');
  await E.page.waitForSelector('.opt[data-option="A"][aria-pressed="true"]');
  await A.page.click('.opt[data-option="B"]');
  await A.page.waitForSelector('.opt[data-option="B"][aria-pressed="true"]');
  await A.page.click('.opt[data-option="A"]'); // change of mind
  await A.page.waitForSelector('.opt[data-option="A"][aria-pressed="true"]');
  assert.strictEqual(await A.page.locator('.opt[aria-pressed="true"]').count(), 1);
  await B.page.click('.opt[data-option="B"]');
  await C.page.click('.opt[data-option="D"]');
  await A.page.waitForSelector('#pick-sent:not([hidden])');
  await shot(A.page, '03-pick');
  step('step 1: pick, change pick, selection shown, "lower the screen" message');

  // reload mid-round keeps identity
  const idBefore = (await host('players', 'GET')).find((p) => p.name === 'Binh').id;
  await B.page.reload();
  await only(B.page, 'pick');
  await B.page.waitForSelector('.opt[data-option="B"][aria-pressed="true"]');
  const after = await host('players', 'GET');
  assert.strictEqual(after.length, 4, 'reload must not create a new player');
  assert.strictEqual(after.find((p) => p.name === 'Binh').id, idBefore);
  assert.match(await B.page.textContent('#who'), /Binh · Nhóm 2/);
  step('reload mid-round rejoins as the same player, pick restored');

  await host('rounds/1/open-guess');
  for (const p of [A, B, C, E]) await only(p.page, 'guess');
  await E.page.fill('#guess-input', '30'); await E.page.click('#guess-btn');
  await E.page.waitForSelector('#guess-sent:not([hidden])');
  await A.page.fill('#guess-input', '40');
  await A.page.click('#guess-btn');
  await A.page.waitForSelector('#guess-sent:not([hidden])');
  await A.page.fill('#guess-input', '35');
  await A.page.click('#guess-btn');
  await A.page.waitForFunction(() => /35%/.test(document.getElementById('guess-status').textContent));
  await A.page.fill('#guess-input', '150');
  await A.page.click('#guess-btn');
  await A.page.waitForSelector('#guess-err:not([hidden])');
  await A.page.fill('#guess-input', '35');
  await shot(A.page, '04-guess');
  await B.page.fill('#guess-input', '60'); await B.page.click('#guess-btn');
  await C.page.fill('#guess-input', '20'); await C.page.click('#guess-btn');
  await C.page.waitForSelector('#guess-sent:not([hidden])');
  // a state broadcast (someone joining) must not wipe what A is typing
  const D0 = await mk();
  await A.page.fill('#guess-input', '36');
  await join(D0.page, 'Dung', 4); // joins during the guess step -> scored from round 2
  await only(D0.page, 'guess');
  assert.ok(await D0.page.$eval('#guess-input', (e) => e.disabled), 'late joiner cannot guess');
  assert.match(await D0.page.textContent('#guess-late'), /từ vòng 2/);
  assert.strictEqual(await A.page.inputValue('#guess-input'), '36');
  await shot(D0.page, '05-guess-late-joiner');
  step('step 2: guess, resend, last value shown, invalid rejected, late joiner disabled, typing not wiped');

  await A.page.click('#guess-btn');
  await host('rounds/1/reveal');
  for (const p of [A, B, C, E]) await only(p.page, 'result');
  await E.page.waitForSelector('#res-you:not([hidden])');
  await A.page.waitForSelector('#res-you:not([hidden])');
  assert.strictEqual(await A.page.textContent('#res-guess'), '36%');
  assert.strictEqual(await A.page.locator('.bar').count(), 4);
  await shot(A.page, '06-result');
  await only(D0.page, 'result');
  await D0.page.waitForSelector('#res-noscore:not([hidden])');
  step('reveal: result screen with distribution, own guess/actual/score; late joiner told no score');

  // reload on the result screen keeps the stored result
  await A.page.reload();
  await only(A.page, 'result');
  await A.page.waitForSelector('#res-you:not([hidden])');
  step('reload on result screen keeps the result');

  // round 2 comparison
  await host('opening', 'POST', { percent: 40 });
  await host('rounds/2/open-pick');
  for (const p of [A, B, C, D0]) { await only(p.page, 'pick'); await p.page.click('.opt[data-option="D"]'); }
  await host('rounds/2/open-guess');
  for (const p of [A, B, C, D0]) { await only(p.page, 'guess'); await p.page.fill('#guess-input', '50'); await p.page.click('#guess-btn'); await p.page.waitForSelector('#guess-sent:not([hidden])'); }
  await host('rounds/2/reveal');
  await A.page.waitForFunction(() => !document.getElementById('res-compare').hidden && document.getElementById('res-title').textContent.includes('Tư bản'));
  assert.match(await A.page.textContent('#res-compare'), /đầu buổi 40% → bây giờ 100%/);
  await shot(A.page, '07-result-comparison');
  step('round 2 shows "đầu buổi x% → bây giờ y%"');

  // excused
  await host('rounds/3/open-pick');
  for (const p of [A, B, C, D0]) await only(p.page, 'pick');
  await A.page.click('.opt[data-option="A"]');
  await host('rounds/3/open-guess');
  await A.page.fill('#guess-input', '10'); await A.page.click('#guess-btn');
  const aId = (await host('players', 'GET')).find((p) => p.name === 'An').id;
  await host('rounds/3/reveal');
  await host(`rounds/3/excuse`, 'POST', { playerId: aId });
  await A.page.waitForFunction(() => !document.getElementById('res-excused').hidden);
  assert.match(await A.page.textContent('#res-excused'), /không tính cho bạn/);
  step('excused player is told the round does not count');

  await host('rounds/4/open-pick');
  for (const p of [A, B, C, D0]) await only(p.page, 'pick');
  await A.page.click('.opt[data-option="C"]');
  await host('rounds/4/open-guess');
  await A.page.fill('#guess-input', '25'); await A.page.click('#guess-btn');
  await host('rounds/4/reveal');
  await A.page.waitForFunction(() => !document.getElementById('res-correct').hidden);
  assert.match(await A.page.textContent('#res-correct'), /Đáp án đúng: C/);
  step('round 4 shows the correct option');

  // finale + reflection
  await host('announce/start');
  await host('announce/next');
  for (const p of [A, B, C, D0]) await only(p.page, 'finale');
  const items = await A.page.locator('#fin-list li').allTextContents();
  assert.ok(items.some((t) => t.includes('?')) && items.some((t) => t.includes('Nhóm')), items.join('|'));
  await shot(A.page, '08-finale');
  step('announce: finale screen with revealed and hidden ("?") ranks');

  await host('reflection/open');
  await A.page.waitForSelector('#s-reflect:not([hidden])');
  const max = await A.page.getAttribute('#ref-text', 'maxlength');
  assert.strictEqual(max, '300');
  await A.page.fill('#ref-text', 'Mình bất ngờ vì cả lớp nghĩ khác mình.');
  assert.match(await A.page.textContent('#ref-count'), /^38\/300$/);
  await shot(A.page, '09-reflection');
  await A.page.click('#ref-btn');
  await A.page.waitForSelector('#s-thanks:not([hidden])');
  assert.ok(await A.page.$eval('#s-reflect', (e) => e.hidden));
  await A.page.reload();
  await A.page.waitForSelector('#s-thanks:not([hidden])');
  assert.strictEqual((await host('reflections', 'GET')).length, 1);
  await shot(A.page, '10-thanks');
  step('reflection: counter, one submit, thank-you, stays after reload');

  // unknown session
  await A.page.evaluate(() => { const k = 'vnr202.player'; const v = JSON.parse(localStorage.getItem(k)); v.playerId = 'gone'; localStorage.setItem(k, JSON.stringify(v)); });
  await A.page.reload();
  await visible(A.page, 's-join');
  assert.match(await A.page.textContent('#join-err'), /Phiên cũ không còn/);
  step('unknown stored playerId falls back to the join screen');

  // dark mode + phone
  const dark = await mk({ colorScheme: 'dark', viewport: { width: 390, height: 800 } });
  await join(dark.page, 'Em', 5);
  await only(dark.page, 'finale');
  await shot(dark.page, '11-phone-dark-finale');

  // connection indicator: online, then reconnecting when the socket drops
  assert.strictEqual((await B.page.textContent('#conn-text')).trim(), 'Trực tuyến');
  await B.ctx.setOffline(true);
  await B.page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await B.page.evaluate(() => document.getElementById('conn-text').textContent); // let layout settle
  await B.ctx.setOffline(false);
  step('online indicator shown');
  await shot(B.page, '12-online');

  await browser.close();
  console.log('ALL OK');
})().catch((e) => { console.error(e); process.exit(1); });
