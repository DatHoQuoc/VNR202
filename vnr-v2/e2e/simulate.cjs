/**
 * Full-flow simulation with Playwright: admin, players, projector, spectators, edge cases and
 * abuse attempts. Every screen is saved to ../screen/NN-name.png and a report is written to
 * ../screen/REPORT.md (steps, findings, console errors).
 *
 *   ADMIN_PASSWORD=lop-vnr202 node dist-backend/backend/src/main.js &     (backend)
 *   npx next start -p 3100 &                                               (frontend)
 *   ADMIN_PASSWORD=lop-vnr202 BASE=http://localhost:3100 node e2e/simulate.cjs
 *
 * Needs the `playwright` package (preinstalled in the cloud container; otherwise `npm i -D playwright`).
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium, request } = require('playwright');

const BASE = process.env.BASE ?? 'http://localhost:3100';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'lop-vnr202';
const OUT = path.join(__dirname, '..', 'screen');
const VP = { width: 1440, height: 900 };

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const steps = [];
const findings = [];
const consoleErrors = [];
let shotNo = 0;
const log = (...a) => console.log(...a);
const finding = (severity, area, text) => { findings.push({ severity, area, text }); log(`  ⚠ [${severity}] ${area}: ${text}`); };

async function shot(page, name, opts = {}) {
  const file = `${String(++shotNo).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: path.join(OUT, file), fullPage: opts.full ?? false });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth).catch(() => 0);
  if (overflow > 4) finding('thấp', name, `Trang bị tràn ngang ${overflow}px (thanh cuộn ngang).`);
  return file;
}

async function step(name, fn) {
  const t0 = Date.now();
  try { await fn(); steps.push({ name, ok: true, ms: Date.now() - t0 }); log(`✔ ${name}`); }
  catch (e) { steps.push({ name, ok: false, ms: Date.now() - t0, error: String(e.message ?? e).split('\n')[0] }); log(`✘ ${name}: ${String(e.message ?? e).split('\n')[0]}`); finding('cao', name, `Bước thất bại: ${String(e.message ?? e).split('\n')[0]}`); }
}

async function newPage(browser, label, viewport = VP) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => consoleErrors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`[${label}] console: ${m.text()}`); });
  page.on('dialog', (d) => { finding('cao', label, `Xuất hiện hộp thoại ${d.type()} ("${d.message()}") - có thể là XSS.`); d.dismiss(); });
  page.label = label;
  return page;
}

const apiCmd = (page, code, action) => page.evaluate(async ([c, a]) => {
  const r = await fetch(`/api/rooms/${c}/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: { type: 'game', action: a } }) });
  return { status: r.status, body: await r.json() };
}, [code, action]);
const apiView = (page, code) => page.evaluate(async (c) => (await fetch(`/api/rooms/${c}`, { cache: 'no-store' })).json(), code);

async function joinUi(browser, code, name, teamIdx) {
  const p = await newPage(browser, name);
  await p.goto(`${BASE}/play?code=${code}`);
  await p.locator('button:has-text("Vào phòng")').click();
  await p.waitForSelector('input[placeholder^="Ví dụ"]');
  await p.fill('input[placeholder^="Ví dụ"]', name);
  await p.locator('.slot').nth(teamIdx).locator('button:has-text("Vào đội này")').click();
  await p.waitForSelector('.slot.mine');
  return p;
}

(async () => {
  const browser = await chromium.launch();
  const api = await request.newContext({ baseURL: BASE });
  let code = '';
  const players = [];

  /* ------------------------------------------------------------------ public pages */
  const guest = await newPage(browser, 'khách');
  await step('Trang chủ hiển thị hai cổng vào', async () => {
    await guest.goto(BASE);
    await guest.waitForSelector('text=Tôi là người chơi'); await guest.waitForSelector('text=Tôi là quản trị');
    await shot(guest, 'trang-chu');
  });
  await step('/cards công khai hiển thị 10 lá bài', async () => {
    await guest.goto(`${BASE}/cards`); await guest.waitForSelector('.game-card');
    const n = await guest.locator('.game-card').count(); if (n !== 10) throw new Error(`Có ${n} lá bài, cần 10.`);
    const hasAnswers = await guest.locator('.q-card').count();
    if (hasAnswers) finding('cao', '/cards', 'Trang công khai lộ ngân hàng câu hỏi có đáp án.');
    await shot(guest, 'cards-cong-khai', { full: true });
  });
  await step('/play: mã phòng không tồn tại báo lỗi rõ ràng', async () => {
    await guest.goto(`${BASE}/play`);
    await shot(guest, 'play-trong');
    await guest.fill('.code-input', 'ZZZZZ'); await guest.locator('button:has-text("Vào phòng")').click();
    await guest.waitForSelector('.error'); await shot(guest, 'play-ma-sai');
  });
  await step('/rooms/ZZZZZ (mã sai gõ thẳng) không bị trắng trang', async () => {
    await guest.goto(`${BASE}/rooms/ZZZZZ`); await guest.waitForSelector('text=Không tìm thấy phòng', { timeout: 6000 });
    await shot(guest, 'phong-khong-ton-tai');
  });

  /* ------------------------------------------------------------------ admin */
  const admin = await newPage(browser, 'admin');
  await step('Admin: đăng nhập sai mật khẩu bị từ chối, đúng thì vào bảng điều khiển', async () => {
    await admin.goto(`${BASE}/admin`); await admin.waitForSelector('input[type=password]');
    await shot(admin, 'admin-dang-nhap');
    await admin.fill('input[type=password]', 'sai-mat-khau'); await admin.locator('button:has-text("Đăng nhập")').click();
    await admin.waitForSelector('.error'); await shot(admin, 'admin-sai-mat-khau');
    await admin.fill('input[type=password]', PASSWORD); await admin.locator('button:has-text("Đăng nhập")').click();
    await admin.waitForSelector('text=Tạo phòng mới');
    await shot(admin, 'admin-bang-dieu-khien');
  });
  await step('Admin: tạo phòng và vào trang điều khiển (phòng chờ trống)', async () => {
    await admin.click('text=Tạo phòng và mở trang điều khiển');
    await admin.waitForURL(/admin\/rooms\/[A-Z0-9]{5}/); code = admin.url().split('/').pop();
    await admin.waitForSelector('text=Người chơi đang vào phòng');
    const disabled = await admin.locator('button:has-text("Bắt đầu cuộc đua")').isDisabled();
    if (!disabled) finding('cao', 'phòng chờ', 'Nút Bắt đầu bật khi chưa có người chơi.');
    await shot(admin, 'admin-phong-cho-trong', { full: true });
  });
  await step('Admin mở màn chiếu và trang thẻ & câu hỏi', async () => {
    const proj = await newPage(browser, 'màn chiếu'); players.proj = proj;
    await proj.goto(`${BASE}/rooms/${code}/board`); await proj.waitForSelector('.board');
    await shot(proj, 'man-chieu-phong-cho');
    await admin.goto(`${BASE}/admin/rooms/${code}/cards`); await admin.waitForSelector('.q-card');
    await shot(admin, 'admin-the-va-cau-hoi');
    await admin.goto(`${BASE}/admin/rooms/${code}`); await admin.waitForSelector('text=Người chơi đang vào phòng');
  });

  /* ------------------------------------------------------------------ abuse probes (no login) */
  await step('Bảo mật: API quản trị không dùng được khi chưa đăng nhập', async () => {
    const probes = [
      ['GET', '/api/admin/rooms'], ['GET', `/api/admin/rooms/${code}`], ['GET', `/api/admin/rooms/${code}/bank`],
      ['POST', '/api/admin/rooms', {}], ['POST', `/api/admin/rooms/${code}/command`, { command: { type: 'start' } }], ['DELETE', `/api/admin/rooms/${code}`]
    ];
    for (const [m, u, d] of probes) {
      const r = await api.fetch(u, { method: m, data: d });
      if (r.status() !== 401) finding('cao', 'bảo mật', `${m} ${u} trả ${r.status()} thay vì 401 khi chưa đăng nhập.`);
    }
    const pub = await api.post('/api/rooms', { data: {} });
    if (pub.status() < 400) finding('cao', 'bảo mật', 'Vẫn tạo được phòng qua API công khai.');
    const csrf = await api.post('/api/admin/session', { headers: { 'Content-Type': 'text/plain' }, data: `{"password":"${PASSWORD}"}` });
    if (csrf.status() < 400) finding('cao', 'bảo mật', 'Đăng nhập quản trị chấp nhận Content-Type không phải JSON (rủi ro CSRF).');
  });
  await step('Bảo mật: giới hạn đăng nhập sai liên tiếp', async () => {
    const tmp = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { 'x-forwarded-for': '10.9.9.9' } });
    let blocked = false;
    for (let i = 0; i < 12; i++) { const r = await tmp.post('/api/admin/session', { data: { password: 'x' + i } }); if (r.status() === 401 && /quá nhiều/i.test((await r.json()).error)) { blocked = true; break; } }
    if (!blocked) finding('trung bình', 'bảo mật', 'Nhập sai mật khẩu 12 lần không bị chặn tạm thời.');
  });

  /* ------------------------------------------------------------------ player lobby */
  const visitor = await newPage(browser, 'người chơi mới');
  await step('Người chơi chưa chọn đội thấy phòng chờ; tên quá ngắn không bấm được', async () => {
    await visitor.goto(`${BASE}/play?code=${code}`); await visitor.locator('button:has-text("Vào phòng")').click();
    await visitor.waitForSelector('text=Chọn đội của bạn');
    await shot(visitor, 'nguoi-choi-phong-cho-chua-ten', { full: true });
    await visitor.fill('input[placeholder^="Ví dụ"]', 'A');
    const dis = await visitor.locator('.slot button:has-text("Vào đội này")').first().isDisabled();
    if (!dis) finding('trung bình', 'phòng chờ', 'Tên 1 ký tự vẫn bấm được "Vào đội này".');
    if (await visitor.locator('text=Bắt đầu cuộc đua').count()) finding('cao', 'phân quyền', 'Người chơi thấy nút Bắt đầu.');
  });
  await step('Người chơi: tên trùng, tên chứa HTML, chuyển đội, rời đội', async () => {
    await visitor.fill('input[placeholder^="Ví dụ"]', '<img src=x onerror=alert(1)>An');
    await visitor.locator('.slot').nth(0).locator('button:has-text("Vào đội này")').click(); await visitor.waitForSelector('.slot.mine');
    const text = await visitor.locator('.slot.mine').innerText();
    if (!text.includes('<img')) finding('cao', 'XSS', 'Tên chứa HTML không hiển thị nguyên văn (có thể bị diễn giải).');
    await shot(visitor, 'nguoi-choi-da-vao-doi-ten-html');
    const dup = await newPage(browser, 'tên trùng');
    await dup.goto(`${BASE}/rooms/${code}`); await dup.fill('input[placeholder^="Ví dụ"]', '<IMG src=x onerror=alert(1)>an');
    await dup.locator('.slot').nth(1).locator('button:has-text("Vào đội này")').click();
    await dup.waitForSelector('.toast.error', { timeout: 5000 }); await shot(dup, 'ten-trung-bao-loi');
    await dup.context().close();
    await visitor.locator('.slot').nth(1).locator('button:has-text("Chuyển sang đội này")').click(); await visitor.waitForTimeout(1200);
    const stillOne = await visitor.locator('.slot.mine').count();
    if (stillOne !== 1) finding('cao', 'phòng chờ', `Sau khi chuyển đội có ${stillOne} ô "mine" (cần đúng 1).`);
    await shot(visitor, 'nguoi-choi-chuyen-doi');
    await visitor.locator('.slot.mine button:has-text("Rời đội")').click(); await visitor.waitForTimeout(1200);
    if (await visitor.locator('.slot.mine').count()) finding('cao', 'phòng chờ', 'Bấm Rời đội nhưng vẫn còn trong đội.');
    await shot(visitor, 'nguoi-choi-roi-doi');
  });
  await step('Phòng chờ: 8 người vào 6 đội (2,2,1,1,1,1) bằng giao diện', async () => {
    const names = ['Lan', 'Minh', 'Hà', 'Tuấn', 'Quỳnh', 'Dũng', 'Mai', 'Phúc']; const team = [0, 0, 1, 1, 2, 3, 4, 5];
    for (let i = 0; i < names.length; i++) players.push(await joinUi(browser, code, names[i], team[i]));
    await admin.waitForTimeout(1500);
    await shot(admin, 'admin-phong-cho-day-du', { full: true });
    await shot(players[0], 'nguoi-choi-phong-cho-day-du', { full: true });
    await shot(players.proj, 'man-chieu-phong-cho-day-du');
  });
  await step('Admin xóa một người chơi; người đó thấy mình bị gỡ', async () => {
    const victim = await joinUi(browser, code, 'Tạm Thời', 5);
    await admin.waitForTimeout(1300);
    await admin.locator('.slot-members li:has-text("Tạm Thời") button:has-text("Xóa")').click();
    await victim.waitForTimeout(1800);
    const still = await victim.locator('.slot.mine').count();
    if (still) finding('trung bình', 'phòng chờ', 'Người bị admin xóa vẫn thấy mình ở trong đội (không có thông báo bị gỡ).');
    await shot(victim, 'nguoi-bi-xoa-nhin-thay-gi'); await victim.context().close();
  });
  await step('Phòng đầy 6 người: người thứ 7 bị từ chối', async () => {
    const extra = [];
    for (let i = 0; i < 6; i++) { const c = await request.newContext({ baseURL: BASE }); extra.push(c); const r = await c.post(`/api/rooms/${code}/join`, { data: { name: `Bot${i}`, slot: 4 } }); if (i < 5 && r.status() >= 400) throw new Error(`Bot${i} không vào được: ${(await r.json()).error}`); if (i === 5 && r.status() < 400) finding('cao', 'phòng chờ', 'Đội có thể vượt quá 6 người.'); }
    await admin.waitForTimeout(1300); await shot(admin, 'admin-doi-day-6-nguoi', { full: true });
    for (const bot of extra.slice(0, 5)) { /* leave to restore the lineup */ await bot.post(`/api/rooms/${code}/command`, { data: { command: { type: 'leave' } } }); }
    await admin.waitForTimeout(1300);
  });
  await step('Bảo mật: người chơi không gửi được lệnh quản trị', async () => {
    for (const type of ['start', 'pause', 'resume', 'end', 'rematch']) {
      const r = await players[0].evaluate(async ([c, t]) => (await fetch(`/api/rooms/${c}/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: { type: t } }) })).status, [code, type]);
      if (r < 400) finding('cao', 'bảo mật', `Người chơi gửi lệnh "${type}" được chấp nhận (HTTP ${r}).`);
    }
    const rm = await players[0].evaluate(async (c) => (await fetch(`/api/rooms/${c}/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: { type: 'remove-player', playerId: 'x' } }) })).status, code);
    if (rm < 400) finding('cao', 'bảo mật', 'Người chơi gửi remove-player được chấp nhận.');
    const view = JSON.stringify(await apiView(players[0], code));
    for (const key of ['token', 'hostToken', 'answerIndex', 'adminToken']) if (view.includes(`"${key}"`)) finding('cao', 'rò rỉ dữ liệu', `JSON phòng gửi cho người chơi chứa khóa "${key}".`);
  });

  /* ------------------------------------------------------------------ start + play */
  await step('Admin bắt đầu ván; người chơi và màn chiếu tự chuyển sang bàn cờ', async () => {
    await admin.click('text=Bắt đầu cuộc đua'); await admin.waitForSelector('text=LƯỢT 1');
    await players[0].waitForSelector('text=LƯỢT 1'); await players.proj.waitForSelector('text=LƯỢT 1');
    await admin.waitForTimeout(800);
    await shot(admin, 'admin-bat-dau-van', { full: true });
    await shot(players[0], 'nguoi-choi-bat-dau-van', { full: true });
    await shot(players.proj, 'man-chieu-bat-dau-van');
  });
  const byId = {};
  for (const p of players.filter((x) => x.label)) if (p !== players.proj) { const v = await apiView(p, code); if (v.viewer?.playerId) byId[v.viewer.playerId] = p; }
  const ensureRunning = async () => {
    const v = await apiView(players[0], code);
    if (v.game?.phase !== 'finished') return;
    await admin.goto(`${BASE}/admin/rooms/${code}`); await admin.waitForSelector('button:has-text("Chơi ván mới")');
    await admin.click('button:has-text("Chơi ván mới")'); await admin.waitForSelector('button:has-text("Tạm dừng")'); await admin.waitForTimeout(600);
  };
  const actingPage = async () => { await ensureRunning(); const v = await apiView(players[0], code); return { p: byId[v.game.actingMemberId], v }; };

  await step('Chỉ người đến lượt mới có nút đổ xúc xắc / đáp án', async () => {
    const { p: actor, v } = await actingPage();
    const others = Object.values(byId).filter((p) => p !== actor);
    for (const o of others) if (await o.locator('button:has-text("Đổ xúc xắc")').count()) finding('cao', 'lượt chơi', `${o.label} thấy nút Đổ xúc xắc dù chưa đến lượt.`);
    const wrong = await apiCmd(others[0], code, { type: 'roll' });
    if (wrong.status < 400) finding('cao', 'lượt chơi', 'Người chơi không đến lượt vẫn đổ được xúc xắc qua API.');
    await shot(others[0], 'cho-luot-nguoi-khac');
    await shot(actor, 'den-luot-ban-truoc-khi-do');
    if (!(await actor.locator('button:has-text("Đổ xúc xắc")').count())) throw new Error('Người đến lượt không có nút đổ xúc xắc.');
  });
  await step('Một vòng chơi bằng giao diện: đổ xúc xắc → câu hỏi → trả lời → kết quả', async () => {
    const { p: actor } = await actingPage();
    await actor.locator('button:has-text("Đổ xúc xắc")').click();
    await actor.waitForSelector('.option:not([disabled])');
    await actor.waitForTimeout(900);
    await shot(actor, 'dang-tra-loi-cau-hoi', { full: true });
    const spectator = Object.values(byId).find((p) => p !== actor);
    const answerBtns = await spectator.locator('.option:not([disabled])').count();
    if (answerBtns) finding('cao', 'lượt chơi', 'Người không đến lượt vẫn bấm được đáp án.');
    const leak = JSON.stringify(await apiView(spectator, code));
    if (/correctText/.test(leak) && !/"resolution"/.test(leak)) finding('cao', 'rò rỉ', 'Đáp án đúng xuất hiện trước khi lượt kết thúc.');
    await shot(spectator, 'nguoi-khac-xem-cau-hoi');
    await shot(players.proj, 'man-chieu-dang-hoi');
    await actor.locator('.option:not([disabled])').first().click();
    await actor.waitForSelector('.result'); await actor.waitForTimeout(1000);
    await shot(actor, 'ket-qua-luot', { full: true });
  });
  await step('Admin tạm dừng: người chơi không thao tác được, tiếp tục thì chơi lại được', async () => {
    await admin.click('button:has-text("Tạm dừng")'); await admin.waitForSelector('button:has-text("Tiếp tục")');
    const { p: actor } = await actingPage(); await actor.waitForTimeout(1300);
    const r = await apiCmd(actor, code, { type: 'roll' });
    if (r.status < 400) finding('cao', 'tạm dừng', 'Đổ xúc xắc được khi ván đang tạm dừng.');
    await shot(actor, 'tam-dung-nhin-tu-nguoi-choi'); await shot(admin, 'tam-dung-nhin-tu-admin');
    await admin.click('button:has-text("Tiếp tục")'); await admin.waitForSelector('button:has-text("Tạm dừng")');
  });
  await step('Tải lại trang giữa ván: người chơi vẫn giữ đội (cookie) và thấy bài của mình', async () => {
    const { p: actor, v } = await actingPage();
    const before = (await apiView(actor, code)).viewer.teamId;
    await actor.reload(); await actor.waitForSelector('.turn', { timeout: 8000 });
    const after = (await apiView(actor, code)).viewer.teamId;
    if (before !== after) finding('cao', 'phiên', 'Tải lại trang làm mất đội của người chơi.');
    await shot(actor, 'tai-lai-trang-giua-van');
  });

  // Drive the game through the API, grabbing the interesting screens as they come up.
  const wants = { enemy: false, help: false, kick: false, bonus: false };
  let turns = 0;
  const NAMES = { stun: 'Chia Để Trị', barricade: 'Thuế Khóa Nặng Nề', 'push-back': 'Đàn Áp Khởi Nghĩa', swap: 'Hoán Đổi Vận Mệnh', steal: 'Mua Chuộc', hint: 'Soi Sáng', fifty: 'Thu Hẹp Vòng Vây', boost: 'Đường Cách Mệnh', shield: 'Chủ Nghĩa Làm Cốt', 'double-dice': 'Nhãn Quan Sắc Bén' };
  await step('Dùng thẻ kỹ năng: chọn mục tiêu, hiệu ứng lá bài, bảng thẻ đã dùng', async () => {
    for (let i = 0; i < 260 && !wants.enemy; i++) {
      const { p: actor, v } = await actingPage(); const mv = await apiView(actor, code);
      const card = mv.hand.find((c) => ['stun', 'barricade', 'steal'].includes(c.kind));
      if (card && mv.game.phase === 'roll' && !mv.game.skillUsed) {
        await actor.waitForTimeout(1200);
        await shot(actor, 'tay-bai-co-the', { full: true });
        await actor.locator(`.hand-fan button:has-text("${NAMES[card.kind]}")`).first().click();
        await actor.waitForSelector('.picker'); await actor.waitForTimeout(500);
        await actor.locator('.picker-horse:not([disabled])').first().hover(); await actor.waitForTimeout(400);
        await shot(actor, 'chon-muc-tieu-skill', { full: true });
        await actor.locator('.picker-horse:not([disabled])').first().click();
        await admin.waitForTimeout(1500);
        await shot(admin, 'hieu-ung-lat-the-tren-ban');
        await shot(players.proj, 'man-chieu-hieu-ung-the');
        await admin.waitForTimeout(4200);
        await shot(admin, 'bang-the-da-dung', { full: true });
        wants.enemy = true; break;
      }
      await apiCmd(actor, code, { type: 'roll' });
      await apiCmd(actor, code, { type: 'answer', index: Math.floor(Math.random() * 4) }); turns++;
    }
    if (!wants.enemy) finding('thấp', 'mô phỏng', 'Không gặp thẻ chặn đối thủ trong 260 lượt (kiểm tra tỉ lệ rút thẻ).');
  });
  await step('Thẻ hỗ trợ khi trả lời (Soi Sáng / Thu Hẹp) dùng được đúng lúc', async () => {
    for (let i = 0; i < 260 && !wants.help; i++) {
      const { p: actor } = await actingPage(); const mv = await apiView(actor, code);
      const card = mv.hand.find((c) => ['hint', 'fifty'].includes(c.kind));
      if (card && mv.game.phase === 'roll') {
        await actor.waitForTimeout(1200);
        const early = await actor.locator(`.hand-fan button:has-text("${NAMES[card.kind]}")`).first().isDisabled();
        if (!early) finding('trung bình', 'thẻ', 'Thẻ hỗ trợ bấm được trước khi có câu hỏi.');
        await actor.locator('button:has-text("Đổ xúc xắc")').click(); await actor.waitForSelector('.option:not([disabled])');
        await actor.locator(`.hand-fan button:has-text("${NAMES[card.kind]}")`).first().click(); await actor.waitForTimeout(1300);
        await shot(actor, 'dung-the-ho-tro-khi-tra-loi', { full: true });
        await actor.locator('.option:not([disabled])').first().click(); wants.help = true; break;
      }
      await apiCmd(actor, code, { type: 'roll' }); await apiCmd(actor, code, { type: 'answer', index: Math.floor(Math.random() * 4) }); turns++;
    }
    if (!wants.help) finding('thấp', 'mô phỏng', 'Không gặp thẻ hỗ trợ trong 260 lượt.');
  });
  await step('Đá ngựa: hiệu ứng "ĐÁ!" và ngựa bị đá về chuồng', async () => {
    for (let i = 0; i < 900 && !wants.kick; i++) {
      const { p: actor } = await actingPage();
      await apiCmd(actor, code, { type: 'roll' });
      const r = await apiCmd(actor, code, { type: 'answer', index: Math.floor(Math.random() * 4) }); turns++;
      const res = r.body.game?.resolution;
      if (res?.kicked?.length) {
        await admin.waitForTimeout(1100); await shot(admin, 'da-ngua-hieu-ung', { full: false });
        await shot(players.proj, 'man-chieu-da-ngua');
        const back = r.body.game.players[res.kicked[0].teamId].horses.find((h) => h.id === res.kicked[0].horseId);
        if (back.progress !== 0) finding('cao', 'đá ngựa', 'Ngựa bị đá không về chuồng.');
        wants.kick = true;
      }
    }
    if (!wants.kick) finding('thấp', 'mô phỏng', 'Không xảy ra đá ngựa trong 900 lượt.');
  });
  await step('Khán giả vào giữa ván chỉ xem được, không có điều khiển', async () => {
    const late = await newPage(browser, 'khán giả muộn');
    await late.goto(`${BASE}/rooms/${code}`); await late.waitForSelector('.board');
    for (const t of ['button:has-text("Đổ xúc xắc")', 'button:has-text("Tạm dừng")', '.hand-fan', 'text=Vào đội này']) if (await late.locator(t).count()) finding('cao', 'khán giả', `Khán giả thấy phần tử không nên có: ${t}`);
    const j = await late.evaluate(async (c) => (await fetch(`/api/rooms/${c}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Muộn', slot: 5 }) })).status, code);
    if (j < 400) finding('cao', 'khán giả', 'Vào đội được sau khi ván đã bắt đầu.');
    await shot(late, 'khan-gia-vao-muon', { full: true }); await late.context().close();
  });
  await step('Chơi đến hết ván: màn hình người thắng cho người chơi / admin / màn chiếu', async () => {
    await ensureRunning();
    let finished = false;
    for (let i = 0; i < 1500 && !finished; i++) {
      const v0 = await apiView(players[0], code); const actor = byId[v0.game.actingMemberId];
      await apiCmd(actor, code, { type: 'roll' });
      const r = await apiCmd(actor, code, { type: 'answer', index: Math.floor(Math.random() * 4) }); turns++;
      finished = r.body.game?.phase === 'finished';
    }
    if (!finished) throw new Error('Ván không kết thúc sau 1500 lượt.');
    await admin.waitForTimeout(1500);
    await shot(admin, 'ket-thuc-admin', { full: true }); await shot(players[0], 'ket-thuc-nguoi-choi', { full: true }); await shot(players.proj, 'ket-thuc-man-chieu');
    const v = await apiView(players[0], code);
    if (!v.game.winnerId || !v.game.ranking || v.game.ranking[0] !== v.game.winnerId) finding('cao', 'kết thúc', 'Bảng xếp hạng không đặt người thắng ở vị trí đầu.');
    if (await players[0].locator('button:has-text("Chơi ván mới")').count()) finding('cao', 'phân quyền', 'Người chơi thấy nút Chơi ván mới.');
    log(`  (đã chơi khoảng ${turns} lượt qua API)`);
  });
  await step('Admin chơi lại ván mới với cùng các đội', async () => {
    await admin.click('button:has-text("Chơi ván mới")'); await admin.waitForSelector('text=LƯỢT 1');
    await players[0].waitForSelector('text=LƯỢT 1');
    const v = await apiView(players[0], code);
    if (v.game.turnNumber !== 1 || v.game.skillLog.length) finding('cao', 'chơi lại', 'Ván mới còn dữ liệu của ván cũ.');
    if (v.game.resolution) finding('trung bình', 'chơi lại', 'Ván mới vẫn hiện "kết quả lượt" của ván trước.');
    await shot(admin, 'choi-lai-van-moi', { full: true });
  });
  await step('Admin kết thúc sớm: đội dẫn đầu thắng', async () => {
    admin.removeAllListeners('dialog'); admin.once('dialog', (d) => d.accept());
    await admin.click('button:has-text("Kết thúc ván")'); await admin.waitForSelector('text=VÁN ĐẤU KẾT THÚC');
    await shot(admin, 'admin-ket-thuc-som', { full: true });
  });

  /* ------------------------------------------------------------------ side rooms: timeouts, deletion, logout */
  await step('Hết giờ: không đổ xúc xắc → hệ thống đổ thay; không trả lời → tính là hết giờ (phòng riêng)', async () => {
    const side = await request.newContext({ baseURL: BASE });
    await side.post('/api/admin/session', { data: { password: PASSWORD } });
    const created = await (await side.post('/api/admin/rooms', { data: { title: 'Phòng thử hết giờ', questionSeconds: 10 } })).json();
    const sp = [];
    for (let i = 0; i < 2; i++) { const p = await newPage(browser, `hết giờ ${i}`); await p.goto(`${BASE}/rooms/${created.code}`); await p.fill('input[placeholder^="Ví dụ"]', `Bạn ${i}`); await p.locator('.slot').nth(i).locator('button:has-text("Vào đội này")').click(); await p.waitForSelector('.slot.mine'); sp.push(p); }
    await side.post(`/api/admin/rooms/${created.code}/command`, { data: { command: { type: 'start' } } });
    await sp[0].waitForSelector('text=LƯỢT 1');
    const t0 = Date.now(); let sawAuto = false, sawTimeout = false;
    while (Date.now() - t0 < 45_000) {
      const v = await apiView(sp[0], created.code);
      if (v.game.events.some((e) => /chậm đổ xúc xắc/.test(e.text))) sawAuto = true;
      if (v.game.resolution?.outcome === 'timeout') { sawTimeout = true; break; }
      await sp[0].waitForTimeout(1000);
    }
    await shot(sp[0], 'het-gio-ket-qua', { full: true });
    if (!sawAuto) finding('cao', 'hết giờ', 'Không có sự kiện tự đổ xúc xắc sau khi quá giờ.');
    if (!sawTimeout) finding('cao', 'hết giờ', 'Câu hỏi không được tính hết giờ sau thời hạn.');
    // admin deletes the room under the players' feet
    const del = await side.delete(`/api/admin/rooms/${created.code}`); if (del.status() !== 200) finding('cao', 'xóa phòng', 'Xóa phòng không thành công.');
    await sp[0].waitForTimeout(2500);
    const msg = (await sp[0].locator('.toast.error').count()) + (await sp[0].locator('.center-note .error').count()) + (await sp[0].getByText('Không tìm thấy phòng').count()) + (await sp[0].getByText('Phòng đã đóng').count());
    await shot(sp[0], 'phong-bi-xoa-nhin-tu-nguoi-choi');
    if (!msg) finding('trung bình', 'xóa phòng', 'Khi admin xóa phòng, người chơi không thấy thông báo nào (màn hình đứng im).');
    else if (!(await sp[0].getByText('Phòng đã đóng').count())) finding('thấp', 'xóa phòng', 'Phòng đã bị xóa nhưng người chơi vẫn thấy bàn cờ cũ, chưa có thông báo "Phòng đã đóng" và nút quay về.');
  });
  await step('Mất kết nối: người đến lượt thoát giữa chừng thì hệ thống tự chơi thay (không treo cả bàn)', async () => {
    const side = await request.newContext({ baseURL: BASE });
    await side.post('/api/admin/session', { data: { password: PASSWORD } });
    const created = await (await side.post('/api/admin/rooms', { data: { title: 'Phòng thử mất kết nối', questionSeconds: 30 } })).json();
    const sp = [];
    for (let i = 0; i < 2; i++) { const p = await newPage(browser, `offline ${i}`); await p.goto(`${BASE}/rooms/${created.code}`); await p.fill('input[placeholder^="Ví dụ"]', `Bạn ${i}`); await p.locator('.slot').nth(i).locator('button:has-text("Vào đội này")').click(); await p.waitForSelector('.slot.mine'); sp.push(p); }
    await side.post(`/api/admin/rooms/${created.code}/command`, { data: { command: { type: 'start' } } });
    await sp[0].waitForSelector('text=LƯỢT 1');
    const v0 = await apiView(sp[0], created.code);
    const [gone, stay] = v0.game.actingMemberId === v0.viewer.playerId ? [sp[0], sp[1]] : [sp[1], sp[0]];
    await gone.context().close();           // the acting player vanishes
    const t0 = Date.now(); let moved = null;
    while (Date.now() - t0 < 60_000) {
      const v = await apiView(stay, created.code);
      if (v.game.turnNumber > 1 || v.game.resolution) { moved = (Date.now() - t0) / 1000; break; }
      if (Date.now() - t0 > 18_000 && !(await stay.getByText('mất kết nối').count())) { /* notice appears after ~15s offline */ }
      await stay.waitForTimeout(1000);
    }
    await shot(stay, 'mat-ket-noi-he-thong-choi-thay', { full: true });
    if (moved === null) finding('cao', 'mất kết nối', 'Sau 60 giây người thoát vẫn làm treo bàn.');
    else log(`  (hệ thống chơi thay sau ${moved.toFixed(0)}s)`);
    if (moved !== null && moved > 40) finding('trung bình', 'mất kết nối', `Hệ thống mất ${moved.toFixed(0)}s mới chơi thay người thoát (nên < 40s).`);
    await side.delete(`/api/admin/rooms/${created.code}`);
  });
  await step('Admin đăng xuất: trang điều khiển phòng yêu cầu đăng nhập lại', async () => {
    await admin.goto(`${BASE}/admin`); await admin.waitForSelector('.room-table');
    await shot(admin, 'admin-danh-sach-phong', { full: true });
    await admin.click('button:has-text("Đăng xuất")'); await admin.waitForSelector('input[type=password]');
    await admin.goto(`${BASE}/admin/rooms/${code}`); await admin.waitForSelector('text=Đăng nhập quản trị', { timeout: 8000 });
    await shot(admin, 'admin-het-phien');
  });
  await step('Màn hình laptop nhỏ 1280x720: bàn cờ và bảng điều khiển không bị cắt', async () => {
    const small = await newPage(browser, 'laptop-nho', { width: 1280, height: 720 });
    await small.goto(`${BASE}/rooms/${code}/board`); await small.waitForSelector('.board'); await small.waitForTimeout(800);
    await shot(small, 'laptop-1280x720', { full: false });
  });

  /* ------------------------------------------------------------------ report */
  const uniq = [...new Set(consoleErrors)];
  const sev = { cao: 0, 'trung bình': 1, thấp: 2 };
  findings.sort((a, b) => (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3));
  const md = [
    '# Báo cáo mô phỏng Playwright', '',
    `Chạy lúc ${new Date().toLocaleString('vi-VN')} · ${shotNo} ảnh chụp · ${steps.filter((s) => s.ok).length}/${steps.length} bước đạt`, '',
    '## Các bước', '', '| # | Bước | Kết quả | Thời gian |', '|---|---|---|---|',
    ...steps.map((s, i) => `| ${i + 1} | ${s.name} | ${s.ok ? '✅' : '❌ ' + s.error} | ${(s.ms / 1000).toFixed(1)}s |`), '',
    `## Phát hiện (${findings.length})`, '',
    ...(findings.length ? ['| Mức | Khu vực | Mô tả |', '|---|---|---|', ...findings.map((f) => `| ${f.severity} | ${f.area} | ${f.text.replace(/\|/g, '/')} |`)] : ['Không phát hiện vấn đề.']), '',
    `## Lỗi console / pageerror (${uniq.length})`, '', ...(uniq.length ? uniq.map((e) => `- ${e}`) : ['Không có.']), '',
    '## Ảnh chụp', '', ...fs.readdirSync(OUT).filter((f) => f.endsWith('.png')).sort().map((f) => `- ${f}`)
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'REPORT.md'), md);
  log(`\n${steps.filter((s) => s.ok).length}/${steps.length} bước đạt, ${findings.length} phát hiện, ${uniq.length} lỗi console, ${shotNo} ảnh → ${OUT}`);
  await browser.close();
})().catch((e) => { console.error('Kịch bản dừng bất ngờ:', e); process.exit(1); });
