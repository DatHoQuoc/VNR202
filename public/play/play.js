(() => {
  'use strict';

  const STORE_KEY = 'vnr202.player';
  const $ = (id) => document.getElementById(id);

  // ---------- storage (every access guarded; the page works without it) ----------
  let memory = {};
  function readStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return memory;
    }
  }
  const store = Object.assign({ picks: {}, guesses: {}, reveals: {}, reflected: false }, readStore());
  store.picks = store.picks || {};
  store.guesses = store.guesses || {};
  store.reveals = store.reveals || {};
  function save() {
    memory = store;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (e) {
      /* no storage: keep going in memory */
    }
  }

  // ---------- state ----------
  const S = {
    state: null, // last public state
    joined: false,
    rejoining: !!store.playerId,
    online: false,
    joinBusy: false,
    teamsBuilt: 0,
    optionSig: '',
  };

  // ---------- helpers ----------
  const fmt = (n) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1));
  const show = (el, on) => { el.hidden = !on; };
  function setErr(el, msg) {
    el.textContent = msg || '';
    show(el, !!msg);
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  const ERRORS = [
    [/wrong room code/i, 'Mã phòng không đúng.'],
    [/not open yet/i, 'Phòng chưa mở. Hãy chờ MC mở phòng rồi thử lại.'],
    [/session has ended/i, 'Buổi chơi đã kết thúc.'],
    [/name must be/i, 'Tên phải có từ 1 đến 30 ký tự.'],
    [/team must be/i, 'Nhóm không hợp lệ.'],
    [/not accepting picks/i, 'Bước chọn đã đóng.'],
    [/not accepting guesses/i, 'Bước dự đoán đã đóng.'],
    [/must be one of/i, 'Lựa chọn không hợp lệ.'],
    [/value must be/i, 'Hãy nhập một số từ 0 đến 100.'],
    [/joined after round/i, 'Bạn vào phòng muộn nên vòng này chưa tính cho bạn.'],
    [/already wrote/i, 'Bạn đã gửi cảm nhận rồi.'],
    [/reflection wall is not open/i, 'Khung cảm nhận đã đóng.'],
    [/text must be/i, 'Cảm nhận phải có từ 1 đến giới hạn ký tự cho phép.'],
    [/join the room first/i, 'Phiên của bạn không còn. Hãy vào lại phòng.'],
  ];
  function viError(raw) {
    const msg = String(raw || '');
    for (const [re, vi] of ERRORS) if (re.test(msg)) return vi;
    return 'Có lỗi: ' + (msg || 'không rõ');
  }

  // ---------- socket ----------
  const socket = io();

  function emit(ev, payload) {
    return new Promise((resolve) => {
      if (!socket.connected) return resolve({ ok: false, error: 'Mất kết nối. Đang kết nối lại…' });
      socket.timeout(8000).emit(ev, payload, (err, res) => {
        resolve(err ? { ok: false, error: 'Máy chủ không phản hồi. Hãy thử lại.' } : res);
      });
    });
  }

  function setConn(on) {
    S.online = on;
    const c = $('conn');
    c.className = 'conn ' + (on ? 'is-on' : 'is-off');
    $('conn-text').textContent = on ? 'Trực tuyến' : 'Đang kết nối lại…';
  }

  socket.on('connect', () => {
    setConn(true);
    if (store.playerId) rejoin();
    else fetchState();
  });
  socket.on('disconnect', () => setConn(false));
  socket.on('connect_error', () => setConn(false));
  socket.io.on('reconnect_attempt', () => setConn(false));

  socket.on('state', (st) => {
    S.state = st;
    render();
  });
  socket.on('round:reveal', (p) => {
    if (!p || typeof p.round !== 'number') return;
    store.reveals[p.round] = p;
    save();
    render();
  });

  function fetchState() {
    fetch('/state')
      .then((r) => r.json())
      .then((st) => { if (!S.state) { S.state = st; render(); } })
      .catch(() => {});
  }

  // ---------- join / rejoin ----------
  function applyJoin(data) {
    const fresh = store.playerId !== data.playerId;
    if (fresh) {
      store.picks = {}; store.guesses = {}; store.reveals = {}; store.reflected = false;
    }
    store.playerId = data.playerId;
    store.team = data.team;
    store.joinedRound = data.joinedRound;
    S.joined = true;
    S.rejoining = false;
    save();
    S.state = data.state;
    render();
  }

  async function rejoin() {
    S.rejoining = true;
    render();
    const res = await emit('player:join', { code: store.code, playerId: store.playerId });
    if (res && res.ok) return applyJoin(res.data);
    if (res && !res.ok && /kết nối|phản hồi/.test(res.error)) return; // transient; next connect retries
    // the server no longer knows this player: back to the join screen
    delete store.playerId;
    S.joined = false;
    S.rejoining = false;
    save();
    fetchState();
    render();
    setErr($('join-err'), 'Phiên cũ không còn. Hãy vào lại phòng. (' + viError(res && res.error) + ')');
  }

  $('f-code').addEventListener('input', (e) => {
    const v = e.target.value.toUpperCase();
    if (v !== e.target.value) e.target.value = v;
  });

  $('join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (S.joinBusy) return;
    const code = $('f-code').value.trim().toUpperCase();
    const name = $('f-name').value.trim();
    const team = Number($('f-team').value);
    if (!code) return setErr($('join-err'), 'Hãy nhập mã phòng.');
    if (name.length < 1 || name.length > 30) return setErr($('join-err'), 'Tên phải có từ 1 đến 30 ký tự.');
    if (!team) return setErr($('join-err'), 'Hãy chọn nhóm.');
    S.joinBusy = true;
    $('join-btn').disabled = true;
    setErr($('join-err'), '');
    const res = await emit('player:join', { code, name, team });
    S.joinBusy = false;
    $('join-btn').disabled = false;
    if (res && res.ok) {
      store.code = code; store.name = name;
      return applyJoin(res.data);
    }
    setErr($('join-err'), viError(res && res.error) + (res && res.error && !/^Mất|^Máy/.test(res.error) ? ' (' + res.error + ')' : ''));
  });

  // ---------- answers ----------
  async function sendPick(round, option) {
    setErr($('pick-err'), '');
    const res = await emit('answer:pick', { round, option });
    if (res && res.ok) {
      store.picks[round] = option;
      save();
    } else {
      setErr($('pick-err'), viError(res && res.error));
    }
    render();
  }

  $('guess-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const st = S.state;
    if (!st || !st.round || st.round.phase !== 'guess') return;
    const raw = $('guess-input').value.trim();
    const value = Number(raw);
    if (raw === '' || !Number.isFinite(value) || value < 0 || value > 100) {
      return setErr($('guess-err'), 'Hãy nhập một số từ 0 đến 100.');
    }
    setErr($('guess-err'), '');
    $('guess-btn').disabled = true;
    const res = await emit('answer:guess', { round: st.round.n, value });
    if (res && res.ok) {
      store.guesses[st.round.n] = value;
      save();
    } else {
      setErr($('guess-err'), viError(res && res.error));
    }
    render();
  });

  // ---------- reflection ----------
  function updateCount() {
    const max = (S.state && S.state.reflection && S.state.reflection.max) || 0;
    const len = $('ref-text').value.length;
    $('ref-count').textContent = len + '/' + max;
  }
  $('ref-text').addEventListener('input', updateCount);
  $('ref-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('ref-text').value.trim();
    if (!text) return setErr($('ref-err'), 'Hãy viết vài chữ trước khi gửi.');
    setErr($('ref-err'), '');
    $('ref-btn').disabled = true;
    const res = await emit('reflection:submit', { text });
    $('ref-btn').disabled = false;
    if (res && (res.ok || /already wrote/i.test(res.error || ''))) {
      store.reflected = true;
      save();
      render();
    } else {
      setErr($('ref-err'), viError(res && res.error));
    }
  });

  // ---------- rendering ----------
  const SECTIONS = ['join', 'wait', 'pick', 'guess', 'result', 'finale'];
  function showOnly(name) {
    for (const s of SECTIONS) show($('s-' + s), s === name);
  }

  function buildTeams(n) {
    if (S.teamsBuilt === n) return;
    const sel = $('f-team');
    const keep = sel.value || (store.team ? String(store.team) : '');
    sel.textContent = '';
    const ph = el('option', '', 'Chọn nhóm…');
    ph.value = '';
    sel.appendChild(ph);
    for (let t = 1; t <= n; t++) {
      const o = el('option', '', 'Nhóm ' + t);
      o.value = String(t);
      sel.appendChild(o);
    }
    sel.value = keep;
    S.teamsBuilt = n;
  }

  function renderJoin(st) {
    buildTeams((st && st.teams) || 6);
    const code = $('f-code');
    if (!code.value) {
      let q = '';
      try { q = new URLSearchParams(location.search).get('code') || ''; } catch (e) { /* ignore */ }
      code.value = (q || store.code || '').toUpperCase();
    }
    if (!$('f-name').value && store.name) $('f-name').value = store.name;
  }

  function renderWait(st) {
    let title = 'Đang chờ…';
    let text = '';
    if (S.rejoining && !S.joined) {
      title = 'Đang vào lại phòng…';
      text = 'Bạn sẽ được nhận lại đúng tên và nhóm của mình.';
    } else if (!st || st.phase === 'lobby') {
      title = 'Bạn đã vào phòng';
      text = 'Chờ MC mở phòng và bắt đầu vòng chơi.';
    } else if (st.phase === 'joining') {
      title = 'Bạn đã vào phòng';
      text = 'Chờ MC bắt đầu vòng 1.';
    } else if (st.round && st.round.voided) {
      title = 'Vòng ' + st.round.n + ' đã bị huỷ';
      text = 'Vòng này không tính điểm. Chờ MC mở vòng tiếp theo.';
    } else {
      title = 'Chờ vòng tiếp theo';
      text = 'Hãy nhìn lên màn hình chiếu.';
    }
    $('wait-title').textContent = title;
    $('wait-text').textContent = text;
  }

  function renderPick(st) {
    const r = st.round;
    $('pick-kicker').textContent = 'Vòng ' + r.n + ' · ' + r.title + ' · Bước 1';
    $('pick-prompt').textContent = r.step1.prompt;
    const sig = r.n + '|' + JSON.stringify(r.step1.options);
    const box = $('pick-options');
    if (sig !== S.optionSig) {
      S.optionSig = sig;
      box.textContent = '';
      for (const [k, label] of Object.entries(r.step1.options)) {
        const b = el('button', 'opt');
        b.type = 'button';
        b.dataset.option = k;
        b.appendChild(el('span', 'letter', k));
        b.appendChild(el('span', 'label', label));
        b.addEventListener('click', () => sendPick(S.state.round.n, k));
        box.appendChild(b);
      }
    }
    const chosen = store.picks[r.n];
    for (const b of box.children) b.setAttribute('aria-pressed', String(b.dataset.option === chosen));
    $('pick-status').textContent = chosen
      ? 'Bạn đang chọn: ' + chosen + '. Có thể đổi lại khi bước này còn mở.'
      : 'Chọn một đáp án.';
    show($('pick-sent'), !!chosen);
  }

  function renderGuess(st) {
    const r = st.round;
    $('guess-kicker').textContent = 'Vòng ' + r.n + ' · ' + r.title + ' · Bước 2';
    $('guess-ask').textContent = r.step2.ask;
    const late = typeof store.joinedRound === 'number' && store.joinedRound > r.n;
    const notice = $('guess-late');
    show(notice, late);
    if (late) notice.textContent = 'Bạn vào phòng muộn nên được tính điểm từ vòng ' + store.joinedRound + '. Vòng này bạn chỉ xem, chưa cần dự đoán.';
    $('guess-input').disabled = late;
    $('guess-btn').disabled = late;
    const last = store.guesses[r.n];
    if (last !== undefined && document.activeElement !== $('guess-input') && $('guess-input').value === '') {
      $('guess-input').value = String(last);
    }
    $('guess-status').textContent = late
      ? ''
      : last !== undefined
        ? 'Giá trị đã gửi gần nhất: ' + fmt(last) + '%. Có thể gửi lại khi bước này còn mở.'
        : 'Nhập một số từ 0 đến 100 rồi bấm Gửi.';
    show($('guess-sent'), !late && last !== undefined);
  }

  function renderResult(st) {
    const r = st.round;
    const p = store.reveals[r.n];
    const has = !!p;
    show($('res-missing'), !has);
    for (const id of ['res-excused', 'res-you', 'res-noscore', 'res-compare', 'res-correct', 'res-ask']) show($(id), false);
    $('res-kicker').textContent = 'Vòng ' + r.n + ' · Kết quả';
    $('res-title').textContent = r.title;
    const bars = $('res-bars');
    bars.textContent = '';
    if (!has) return;

    $('res-ask').textContent = r.step2.ask;
    show($('res-ask'), true);

    if (p.excused) {
      $('res-excused').textContent = 'Vòng này không tính cho bạn.';
      show($('res-excused'), true);
    } else if (p.you) {
      $('res-guess').textContent = fmt(p.you.guess) + '%';
      $('res-actual').textContent = fmt(p.you.actual) + '%';
      $('res-score').textContent = fmt(p.you.score);
      show($('res-you'), true);
    } else {
      $('res-noscore').textContent = 'Vòng này chưa có điểm cho bạn (bạn vào phòng muộn hoặc không gửi dự đoán).';
      show($('res-noscore'), true);
    }

    if (p.comparison) {
      $('res-compare').textContent = 'đầu buổi ' + fmt(p.comparison.x) + '% → bây giờ ' + fmt(p.comparison.y) + '%';
      show($('res-compare'), true);
    }
    const labels = r.n === p.round ? r.step1.options : {};
    if (p.correctOption) {
      const lbl = labels[p.correctOption];
      $('res-correct').textContent = 'Đáp án đúng: ' + p.correctOption + (lbl ? ' — ' + lbl : '');
      show($('res-correct'), true);
    }
    for (const k of Object.keys(p.distribution).sort()) {
      const v = p.distribution[k];
      const row = el('div', 'bar' + (k === p.target ? ' hot' : ''));
      row.appendChild(el('span', 'l', k));
      const track = el('div', 'track');
      const fill = el('div', 'fill');
      fill.style.width = Math.max(0, Math.min(100, v)) + '%';
      track.appendChild(fill);
      if (labels[k]) track.appendChild(el('span', 'name', labels[k]));
      row.appendChild(track);
      row.appendChild(el('span', 'v', fmt(v) + '%'));
      bars.appendChild(row);
    }
  }

  function renderFinale(st) {
    const f = st.finale;
    const list = $('fin-list');
    list.textContent = '';
    if (!f) return;
    for (const s of f.standings) {
      const known = s.team !== null && s.team !== undefined;
      const li = el('li', known ? '' : 'hidden');
      li.appendChild(el('span', '', 'Hạng ' + s.rank));
      li.appendChild(el('span', '', known ? 'Nhóm ' + s.team + (s.score !== null ? ' · ' + fmt(s.score) + ' điểm' : '') : '?'));
      list.appendChild(li);
    }
  }

  function render() {
    const st = S.state;
    // header
    const who = $('who');
    if (S.joined && store.name) {
      who.textContent = store.name + (store.team ? ' · Nhóm ' + store.team : '');
      show(who, true);
    } else show(who, false);

    let main;
    if (!S.joined) main = S.rejoining ? 'wait' : 'join';
    else if (!st) main = 'wait';
    else if (st.phase === 'announce' || st.phase === 'ended') main = 'finale';
    else if (st.phase === 'rounds' && st.round && !st.round.voided) {
      main = { pick: 'pick', guess: 'guess', revealed: 'result' }[st.round.phase] || 'wait';
    } else main = 'wait';

    showOnly(main);
    if (main === 'join') renderJoin(st);
    else if (main === 'wait') renderWait(st);
    else if (main === 'pick') renderPick(st);
    else if (main === 'guess') renderGuess(st);
    else if (main === 'result') renderResult(st);
    else if (main === 'finale') renderFinale(st);

    // reflection (anonymous, one per student) can sit under any screen once the MC opens it
    const open = !!(S.joined && st && st.reflection && st.reflection.open);
    show($('s-reflect'), open && !store.reflected);
    show($('s-thanks'), open && !!store.reflected);
    if (open && st.reflection) {
      $('ref-prompt').textContent = st.reflection.prompt || '';
      $('ref-text').maxLength = st.reflection.max;
      updateCount();
    }
  }

  render();
})();
