(() => {
  'use strict';

  const KEY_STORE = 'vnr202.hostkey';
  const $ = (id) => document.getElementById(id);
  const show = (el, on) => { el.hidden = !on; };

  // ---------- helpers ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  const fmt = (n) => (n === null || n === undefined ? '—' : Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1));
  function btn(text, onClick, opts = {}) {
    const b = el('button', opts.cls || '', text);
    b.type = 'button';
    if (opts.disabled) b.disabled = true;
    if (opts.pressed !== undefined) b.setAttribute('aria-pressed', String(opts.pressed));
    b.addEventListener('click', onClick);
    return b;
  }

  // The session key lives in sessionStorage only (never in the URL or localStorage). Memory fallback.
  let memKey = '';
  const keyStore = {
    get() { try { return sessionStorage.getItem(KEY_STORE) || memKey; } catch (e) { return memKey; } },
    set(k) { memKey = k; try { sessionStorage.setItem(KEY_STORE, k); } catch (e) { /* memory only */ } },
    clear() { memKey = ''; try { sessionStorage.removeItem(KEY_STORE); } catch (e) { /* ignore */ } },
  };

  const S = {
    key: '',
    stats: null,
    players: [],
    rounds: {}, // n -> GET /host/rounds/:n
    labels: {}, // n -> { title, options, ask } (from the public state, kept per round)
    ranking: [],
    refs: [],
    tab: null,
    busy: false,
    hostJoined: false,
    pollOk: true,
    pending: null, // { stepKey, text, run }
    sigs: {},
    openDirty: false,
  };

  // ---------- API ----------
  class ApiError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }
  async function api(method, path, body) {
    let res;
    try {
      res = await fetch('/host/' + path, {
        method,
        headers: { 'x-host-key': S.key, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new ApiError(0, 'Không kết nối được máy chủ.');
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      let msg = data && data.message ? data.message : res.statusText;
      if (Array.isArray(msg)) msg = msg.join('; ');
      if (res.status === 401) logout('Khóa MC không đúng hoặc đã đổi. Hãy nhập lại.');
      throw new ApiError(res.status, String(msg));
    }
    return data;
  }

  function banner(msg) {
    $('banner-text').textContent = msg;
    show($('banner'), !!msg);
  }
  const clearBanner = () => banner('');
  $('banner-x').addEventListener('click', clearBanner);
  function reportError(e, what) {
    if (e instanceof ApiError && e.status === 401) return;
    const code = e instanceof ApiError && e.status ? ' (' + e.status + ')' : '';
    banner((what ? what + ': ' : 'Không thực hiện được: ') + e.message + code);
  }

  /** Run a host action. Failures are always shown in the banner; state is re-synced either way. */
  async function act(what, fn) {
    if (S.busy) return;
    S.busy = true;
    dismissConfirm();
    render();
    try {
      const out = await fn();
      clearBanner();
      return out;
    } catch (e) {
      reportError(e, what);
    } finally {
      S.busy = false;
      try { await resync(true); } catch (e) { /* shown by the poller */ }
      render();
    }
  }

  // ---------- login ----------
  function logout(msg) {
    S.key = '';
    keyStore.clear();
    S.stats = null;
    S.hostJoined = false;
    S.sigs = {};
    S.rounds = {};
    show($('dash'), false);
    show($('login'), true);
    $('key').value = '';
    const err = $('login-err');
    err.textContent = msg || '';
    show(err, !!msg);
    // drop the socket so it leaves the host room; it reconnects as a plain client
    socket.disconnect().connect();
  }
  $('logout').addEventListener('click', () => logout(''));

  async function tryLogin(key) {
    let res;
    try {
      res = await fetch('/host/state', { headers: { 'x-host-key': key } });
    } catch (e) {
      return 'Không kết nối được máy chủ.';
    }
    if (res.status === 401) return 'Khóa MC không đúng.';
    if (!res.ok) return 'Máy chủ trả lỗi ' + res.status + '.';
    S.key = key;
    keyStore.set(key);
    show($('login'), false);
    show($('dash'), true);
    setStats(await res.json());
    joinHostRoom();
    return '';
  }

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('login-err');
    err.textContent = '';
    show(err, false);
    const msg = await tryLogin($('key').value.trim());
    if (msg) { err.textContent = msg; show(err, true); } else $('key').value = '';
  });

  // ---------- socket + polling ----------
  const socket = io();
  function joinHostRoom() {
    if (!S.key || !socket.connected) return;
    socket.emit('host:join', { key: S.key }, (ack) => {
      if (ack && ack.ok) {
        S.hostJoined = true;
        setStats(ack.data);
      } else {
        S.hostJoined = false;
        logout('Khóa MC không đúng hoặc đã đổi. Hãy nhập lại.');
      }
      render();
    });
  }
  socket.on('connect', () => { joinHostRoom(); render(); });
  socket.on('disconnect', () => { S.hostJoined = false; render(); });
  socket.on('connect_error', () => { S.hostJoined = false; render(); });
  socket.on('host:stats', (st) => { if (S.key) setStats(st); });

  setInterval(async () => {
    if (!S.key || (socket.connected && S.hostJoined)) return;
    try {
      setStats(await api('GET', 'state'));
      S.pollOk = true;
    } catch (e) {
      S.pollOk = false;
    }
    render();
  }, 3000);

  // ---------- data refresh ----------
  function setStats(st) {
    S.stats = st;
    render();
    resync(false).catch(() => {});
  }

  const sigOf = (v) => JSON.stringify(v);
  /** Fetch the secondary data only when something it depends on changed (or when forced). */
  async function resync(force) {
    const st = S.stats;
    if (!st || !S.key) return;
    const jobs = [];
    const changed = (name, v) => {
      const s = sigOf(v);
      if (!force && S.sigs[name] === s) return false;
      S.sigs[name] = s;
      return true;
    };
    if (changed('players', [st.joined, st.online])) jobs.push(api('GET', 'players').then((p) => { S.players = p; }));
    if (changed('rounds', [st.rounds, st.currentRound])) {
      for (let n = 1; n <= st.currentRound; n++) {
        if (st.rounds[n - 1].phase === 'idle') continue;
        jobs.push(api('GET', 'rounds/' + n).then((r) => { S.rounds[n] = r; }));
      }
      jobs.push(api('GET', 'ranking').then((r) => { S.ranking = r; }));
    }
    if (changed('refs', st.reflections)) jobs.push(api('GET', 'reflections').then((r) => { S.refs = r; }));
    if (changed('labels', [st.currentRound, st.phase])) {
      jobs.push(fetch('/state').then((r) => r.json()).then((p) => {
        if (p.round) S.labels[p.round.n] = { title: p.round.title, options: p.round.step1.options, ask: p.round.step2.ask };
      }));
    }
    await Promise.all(jobs);
    render();
  }

  // ---------- the fixed order ----------
  function plan(st) {
    const R = st.rounds.length;
    const teams = Object.keys(st.byTeam).length;
    const annTotal = st.finale.total > 0 ? st.finale.total : teams;
    const steps = [{ id: 'joining', label: 'Mở phòng cho học sinh vào', run: () => api('POST', 'joining/open') }];
    for (let n = 1; n <= R; n++) {
      steps.push({ id: 'r' + n + '-pick', label: 'Vòng ' + n + ': mở bước CHỌN (bước 1)', run: () => api('POST', 'rounds/' + n + '/open-pick') });
      steps.push({ id: 'r' + n + '-guess', label: 'Vòng ' + n + ': mở bước ĐOÁN (bước 2)', run: () => api('POST', 'rounds/' + n + '/open-guess') });
      steps.push({
        id: 'r' + n + '-reveal',
        label: 'Vòng ' + n + ': CÔNG BỐ kết quả',
        confirm: 'Công bố kết quả vòng ' + n + '? Bước đoán sẽ đóng và không thể hoàn tác.',
        run: () => api('POST', 'rounds/' + n + '/reveal'),
      });
    }
    steps.push({
      id: 'announce-start',
      label: 'Bắt đầu công bố xếp hạng',
      confirm: 'Bắt đầu công bố xếp hạng? Sau bước này không mở thêm vòng chơi nữa.',
      run: () => api('POST', 'announce/start'),
    });
    for (let i = 1; i <= annTotal; i++) {
      steps.push({ id: 'announce-' + i, label: 'Công bố hạng ' + (annTotal - i + 1), run: () => api('POST', 'announce/next') });
    }
    steps.push({ id: 'reflect-open', label: 'Mở khung cảm nhận', run: () => api('POST', 'reflection/open') });
    steps.push({
      id: 'end',
      label: 'Kết thúc buổi chơi',
      confirm: 'Kết thúc buổi chơi? Khung cảm nhận sẽ đóng và không thể hoàn tác.',
      run: () => api('POST', 'end'),
    });
    return steps;
  }

  function currentId(st) {
    const R = st.rounds.length;
    if (st.phase === 'lobby') return 'joining';
    if (st.phase === 'joining') return 'r1-pick';
    if (st.phase === 'rounds') {
      const n = st.currentRound;
      if (st.roundPhase === 'pick') return 'r' + n + '-guess';
      if (st.roundPhase === 'guess') return 'r' + n + '-reveal';
      return n < R ? 'r' + (n + 1) + '-pick' : 'announce-start';
    }
    if (st.phase === 'announce') {
      if (st.finale.revealed < st.finale.total) return 'announce-' + (st.finale.revealed + 1);
      return st.reflections.open || st.reflections.total > 0 ? 'end' : 'reflect-open';
    }
    return null; // ended
  }

  // ---------- confirm ----------
  function dismissConfirm() {
    S.pending = null;
    show($('confirm'), false);
  }
  function ask(stepKey, text, run) {
    S.pending = { stepKey, run };
    $('confirm-text').textContent = text;
    show($('confirm'), true);
    $('confirm-yes').focus();
  }
  $('confirm-no').addEventListener('click', dismissConfirm);
  $('confirm-yes').addEventListener('click', () => {
    const p = S.pending;
    if (p) act('Không thực hiện được', p.run);
  });

  $('next').addEventListener('click', () => {
    const st = S.stats;
    if (!st || S.busy) return;
    const id = currentId(st);
    const step = plan(st).find((s) => s.id === id);
    if (!step) return;
    const run = async () => { await step.run(); };
    if (step.confirm) ask('step:' + id, step.confirm, run);
    else act('Không thực hiện được', run);
  });

  // ---------- station 0 ----------
  $('open-pct').addEventListener('input', () => { S.openDirty = true; });
  $('open-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = $('open-pct').value.trim();
    const v = Number(raw);
    if (raw === '' || !Number.isFinite(v) || v < 0 || v > 100) return banner('x% phải là số từ 0 đến 100.');
    act('Không lưu được x%', async () => { await api('POST', 'opening', { percent: v }); S.openDirty = false; });
  });
  $('calc-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const d = Number($('calc-d').value);
    const t = Number($('calc-total').value);
    if (!(t > 0) || !(d >= 0) || d > t) return banner('Số người chọn D phải nhỏ hơn hoặc bằng tổng số người.');
    clearBanner();
    $('open-pct').value = String(Math.round((d / t) * 1000) / 10);
    S.openDirty = true;
  });

  // ---------- reflections / download ----------
  $('ref-open').addEventListener('click', () => act('Không mở được khung cảm nhận', () => api('POST', 'reflection/open')));
  $('ref-close').addEventListener('click', () => act('Không đóng được khung cảm nhận', () => api('POST', 'reflection/close')));
  $('download').addEventListener('click', async () => {
    try {
      const data = await api('GET', 'results');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'vnr202-ketqua-' + ((S.stats && S.stats.code) || 'phong') + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      clearBanner();
    } catch (e) {
      reportError(e, 'Không tải được kết quả');
    }
  });

  // ---------- rendering ----------
  const ROUND_PHASE = { idle: 'chưa mở', pick: 'đang CHỌN', guess: 'đang ĐOÁN', revealed: 'đã công bố' };
  function phaseText(st) {
    switch (st.phase) {
      case 'lobby': return 'Chưa mở phòng';
      case 'joining': return 'Đang cho vào phòng';
      case 'rounds': return 'Vòng ' + st.currentRound + ' · ' + (ROUND_PHASE[st.roundPhase] || '');
      case 'announce': return 'Công bố xếp hạng';
      case 'ended': return 'Đã kết thúc';
      default: return st.phase;
    }
  }

  /** Rebuild a section only when its inputs changed, so buttons are never replaced under the pointer. */
  function paint(name, deps, build) {
    const s = sigOf(deps);
    if (S.sigs['paint:' + name] === s) return;
    S.sigs['paint:' + name] = s;
    build();
  }

  const playerName = (id) => {
    const p = S.players.find((x) => x.id === id);
    return p ? p.name + ' (nhóm ' + p.team + ')' : id;
  };

  function renderConn() {
    const c = $('conn');
    if (socket.connected && S.hostJoined) { c.className = 'conn is-on'; $('conn-text').textContent = 'Realtime · trực tuyến'; }
    else if (S.pollOk) { c.className = 'conn is-poll'; $('conn-text').textContent = 'Mất realtime · dò mỗi 3 giây'; }
    else { c.className = 'conn is-off'; $('conn-text').textContent = 'Mất kết nối máy chủ · đang thử lại'; }
  }

  function render() {
    renderConn();
    const st = S.stats;
    if (!st || !S.key) return;

    $('code').textContent = st.code;
    $('phase').textContent = phaseText(st);
    $('joined').textContent = st.joined;
    $('online').textContent = st.online;

    // next step
    const steps = plan(st);
    const id = currentId(st);
    const idx = id ? steps.findIndex((s) => s.id === id) : steps.length;
    const step = id ? steps[idx] : null;
    const nextBtn = $('next');
    const label = step ? step.label + (step.confirm ? ' …' : '') : 'Buổi chơi đã kết thúc';
    if (nextBtn.textContent !== label) nextBtn.textContent = label;
    nextBtn.disabled = !step || S.busy;
    let hint = '';
    if (step && step.id === 'r1-pick' && st.openingPercent === null) hint = 'Bạn chưa nhập x% đầu buổi (trạm 0). Vẫn có thể nhập sau, máy chủ sẽ cập nhật phần so sánh.';
    else if (step && /-reveal$/.test(step.id)) hint = 'Đã đoán ' + st.guesses + ' / ' + st.online + ' người đang online.';
    else if (step && /-guess$/.test(step.id)) hint = 'Đã chọn ' + st.picks + ' / ' + st.online + ' người đang online.';
    $('next-hint').textContent = S.busy ? 'Đang gửi lệnh…' : hint;
    if (S.pending && S.pending.stepKey !== 'step:' + id && S.pending.stepKey.startsWith('step:')) dismissConfirm();

    paint('steps', [steps.map((s) => s.id), idx], () => {
      const ol = $('steps');
      ol.textContent = '';
      steps.forEach((s, i) => {
        const li = el('li', i < idx ? 'done' : i === idx ? 'cur' : '', s.label);
        if (i === idx) li.setAttribute('aria-current', 'step');
        ol.appendChild(li);
      });
      const cur = ol.querySelector('.cur');
      if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
    });

    // station 0
    if (!S.openDirty && document.activeElement !== $('open-pct')) $('open-pct').value = st.openingPercent === null ? '' : String(st.openingPercent);
    $('open-state').textContent = st.openingPercent === null ? 'Chưa lưu.' : 'Đang lưu: ' + fmt(st.openingPercent) + '%.';

    // live panel
    const r = st.currentRound;
    $('live-title').textContent = r ? 'Vòng ' + r + ' · ' + (ROUND_PHASE[st.roundPhase] || '') : 'Chưa có vòng nào';
    $('c-picks').textContent = st.picks;
    $('c-guesses').textContent = st.guesses;
    $('c-picks-of').textContent = '/ ' + st.online + ' online';
    $('c-guesses-of').textContent = '/ ' + st.online + ' online';
    paint('teams', st.byTeam, () => {
      const tb = $('team-table').tBodies[0];
      tb.textContent = '';
      for (const [t, v] of Object.entries(st.byTeam)) {
        const tr = el('tr');
        tr.appendChild(el('td', '', 'Nhóm ' + t));
        tr.appendChild(el('td', '', v.joined));
        tr.appendChild(el('td', '', v.online));
        tb.appendChild(tr);
      }
    });

    paint('rounds', [st.rounds, st.currentRound, st.phase, S.busy], () => {
      const tb = $('round-table').tBodies[0];
      tb.textContent = '';
      st.rounds.forEach((rd) => {
        const tr = el('tr');
        tr.appendChild(el('td', '', 'Vòng ' + rd.n));
        const td = el('td', '', ROUND_PHASE[rd.phase] || rd.phase);
        if (rd.voided) td.appendChild(el('span', 'pill', 'ĐÃ HỦY'));
        tr.appendChild(td);
        const act_ = el('td');
        const can = rd.n <= st.currentRound && st.phase !== 'ended' && !S.busy;
        if (rd.voided) {
          act_.appendChild(btn('Khôi phục vòng', () => act('Không khôi phục được vòng ' + rd.n, () => api('POST', 'rounds/' + rd.n + '/void', { voided: false })), { disabled: !can, cls: 'small' }));
        } else {
          act_.appendChild(btn('Hủy vòng', () => ask('void:' + rd.n, 'Hủy vòng ' + rd.n + '? Vòng này sẽ không tính điểm cho mọi người.', () => api('POST', 'rounds/' + rd.n + '/void', { voided: true })), { disabled: !can, cls: 'small' }));
        }
        tr.appendChild(act_);
        tb.appendChild(tr);
      });
    });

    renderResults(st);
    renderPlayers(st);
    renderRanking(st);
    renderReflections(st);
  }

  function renderResults(st) {
    const revealed = st.rounds.filter((x) => x.n <= st.currentRound && x.phase === 'revealed').map((x) => x.n);
    if (!revealed.includes(S.tab)) S.tab = revealed.length ? revealed[revealed.length - 1] : null;
    const data = S.tab ? S.rounds[S.tab] : null;
    paint('results', [revealed, S.tab, data, S.labels, S.players.map((p) => [p.id, p.name, p.team])], () => {
      const tabs = $('res-tabs');
      const body = $('res-body');
      tabs.textContent = '';
      body.textContent = '';
      tabs.appendChild(el('h2', '', 'Kết quả đã công bố'));
      if (!revealed.length) { body.appendChild(el('p', 'muted', 'Chưa có vòng nào được công bố.')); return; }
      for (const n of revealed) {
        const b = btn('Vòng ' + n, () => { S.tab = n; render(); });
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(n === S.tab));
        tabs.appendChild(b);
      }
      if (!data) { body.appendChild(el('p', 'muted', 'Đang tải…')); return; }
      if (data.voided) body.appendChild(el('p', 'err', 'Vòng ' + data.n + ' đã bị hủy, không tính điểm.'));
      const res = data.result;
      if (!res) { if (!data.voided) body.appendChild(el('p', 'muted', 'Vòng này chưa có kết quả.')); return; }
      if (res.comparison) body.appendChild(el('p', 'ok-box', 'Đầu buổi ' + fmt(res.comparison.x) + '% → bây giờ ' + fmt(res.comparison.y) + '%'));
      const labels = (S.labels[data.n] || {}).options || {};
      if (res.correctOption) body.appendChild(el('p', 'ok-box', 'Đáp án đúng: ' + res.correctOption + (labels[res.correctOption] ? ' — ' + labels[res.correctOption] : '')));

      const two = el('div', 'two');
      const left = el('div');
      left.appendChild(el('h2', '', 'Cả lớp đã chọn'));
      for (const k of Object.keys(res.distribution).sort()) {
        const v = res.distribution[k];
        const row = el('div', 'bar-row' + (k === data.target ? ' hot' : ''));
        row.appendChild(el('strong', '', k));
        const track = el('div', 'track');
        const fill = el('div', 'fill');
        fill.style.width = Math.max(0, Math.min(100, v)) + '%';
        track.appendChild(fill);
        if (labels[k]) track.appendChild(el('span', 'nm', labels[k]));
        row.appendChild(track);
        row.appendChild(el('span', 'v', fmt(v) + '%'));
        left.appendChild(row);
      }
      two.appendChild(left);

      const right = el('div');
      right.appendChild(el('h2', '', 'Điểm trung bình theo nhóm'));
      const tt = el('table', 'tbl');
      const tbody = el('tbody');
      for (const t of Object.keys(res.teamScores).sort((a, b) => Number(a) - Number(b))) {
        const tr = el('tr');
        tr.appendChild(el('td', '', 'Nhóm ' + t));
        tr.appendChild(el('td', '', fmt(res.teamScores[t])));
        tbody.appendChild(tr);
      }
      tt.appendChild(tbody);
      right.appendChild(tt);
      two.appendChild(right);
      body.appendChild(two);

      const zero = res.scores.filter((s) => s.score === 0).map((s) => s.playerId);
      const lists = [
        ['Được 0 điểm', zero],
        ['Tự động miễn (offline lúc đóng bước đoán)', res.autoExcused],
        ['MC đã miễn', data.excused],
        ['Không có đối chiếu (không nhóm khác chọn)', res.skipped],
      ];
      for (const [title, ids] of lists) {
        const p = el('p', 'muted');
        p.appendChild(el('strong', '', title + ': '));
        p.appendChild(document.createTextNode(ids.length ? ids.map(playerName).join(', ') : 'không có'));
        body.appendChild(p);
      }
    });
  }

  function renderPlayers(st) {
    paint('players', [S.players, st.currentRound, st.rounds.map((r) => r.phase), Object.fromEntries(Object.entries(S.rounds).map(([n, r]) => [n, [r.excused, r.result && r.result.autoExcused]])), S.busy], () => {
      const tb = $('player-table').tBodies[0];
      tb.textContent = '';
      const sorted = S.players.slice().sort((a, b) => a.team - b.team || a.name.localeCompare(b.name));
      if (!sorted.length) {
        const tr = el('tr');
        const td = el('td', 'muted', 'Chưa có ai vào phòng.');
        td.colSpan = 8;
        tr.appendChild(td);
        tb.appendChild(tr);
        return;
      }
      for (const p of sorted) {
        const tr = el('tr');
        tr.appendChild(el('td', '', p.name));
        tr.appendChild(el('td', '', p.team));
        tr.appendChild(el('td', '', p.joinedRound));
        const on = el('td');
        const dot = el('span', 'dot' + (p.online ? ' on' : ''));
        dot.setAttribute('role', 'img');
        dot.setAttribute('aria-label', p.online ? 'online' : 'offline');
        on.appendChild(dot);
        tr.appendChild(on);
        for (const rd of st.rounds) {
          const td = el('td');
          const data = S.rounds[rd.n];
          if (p.joinedRound > rd.n) td.textContent = '—';
          else {
            const isEx = !!(data && data.excused.includes(p.id));
            const auto = !!(data && data.result && data.result.autoExcused.includes(p.id));
            const can = rd.n <= st.currentRound && rd.phase !== 'idle' && !S.busy;
            td.appendChild(btn(isEx ? 'Đã miễn' : 'Miễn vòng này', () => act('Không miễn được vòng ' + rd.n, async () => {
              S.rounds[rd.n] = await api('POST', 'rounds/' + rd.n + '/excuse', { playerId: p.id, excused: !isEx });
            }), { cls: 'tog small', pressed: isEx, disabled: !can }));
            if (auto) td.appendChild(el('span', 'pill', 'tự miễn'));
          }
          tr.appendChild(td);
        }
        tb.appendChild(tr);
      }
    });
  }

  function renderRanking() {
    paint('ranking', S.ranking, () => {
      const tb = $('rank-table').tBodies[0];
      tb.textContent = '';
      show($('rank-empty'), S.ranking.length === 0);
      for (const r of S.ranking) {
        const tr = el('tr');
        tr.appendChild(el('td', '', r.rank));
        tr.appendChild(el('td', '', 'Nhóm ' + r.team));
        tr.appendChild(el('td', '', fmt(r.score)));
        tr.appendChild(el('td', '', r.perRound.map((x) => 'V' + x.round + ': ' + fmt(x.score)).join(' · ')));
        tb.appendChild(tr);
      }
    });
  }

  function renderReflections(st) {
    $('ref-open').disabled = S.busy || st.reflections.open || st.phase === 'ended';
    $('ref-close').disabled = S.busy || !st.reflections.open;
    $('ref-state').textContent = (st.reflections.open ? 'Đang mở' : 'Đang đóng') + ' · ' + st.reflections.total + ' cảm nhận · ' + st.reflections.approved + ' đã duyệt';
    paint('refs', [S.refs, S.busy], () => {
      const ul = $('ref-list');
      ul.textContent = '';
      show($('ref-empty'), S.refs.length === 0);
      for (const rf of S.refs) {
        const li = el('li', rf.approved ? 'approved' : '');
        li.appendChild(el('span', 't', rf.text)); // textContent only
        li.appendChild(btn(rf.approved ? 'Ẩn' : 'Duyệt', () => act('Không cập nhật được cảm nhận', async () => {
          S.refs = await api('POST', 'reflections/' + encodeURIComponent(rf.id) + '/approve', { approved: !rf.approved });
        }), { disabled: S.busy, cls: rf.approved ? '' : 'primary' }));
        ul.appendChild(li);
      }
    });
  }

  // ---------- start ----------
  (async () => {
    const saved = keyStore.get();
    if (saved) {
      const msg = await tryLogin(saved);
      if (!msg) return;
      keyStore.clear();
      show($('login'), true);
      const err = $('login-err');
      err.textContent = msg;
      show(err, true);
    } else show($('login'), true);
  })();
})();
