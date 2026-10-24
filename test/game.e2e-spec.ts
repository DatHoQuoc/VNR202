import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';

process.env.HOST_KEY = 'test-key';
process.env.ROOM_CODE = 'ABCDE';
process.env.DATA_FILE = '';
process.env.TEAMS = '6';

// imported after env is set
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AppModule } = require('../src/app.module');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { serveStatic } = require('../src/config/static');

let app: INestApplication;
let base: string;
const sockets: Socket[] = [];

const host = async (path: string, method = 'GET', body?: unknown, key = 'test-key') => {
  const res = await fetch(`${base}/host/${path}`, {
    method,
    headers: { 'x-host-key': key, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const ack = <T = any>(s: Socket, ev: string, payload: unknown): Promise<{ ok: boolean; data?: T; error?: string }> =>
  new Promise((resolve) => s.emit(ev, payload, resolve));

const connect = (): Promise<Socket> =>
  new Promise((resolve) => {
    const s = io(base, { transports: ['websocket'], forceNew: true });
    sockets.push(s);
    s.on('connect', () => resolve(s));
  });

async function player(name: string, team: number, code = 'ABCDE') {
  const s = await connect();
  const r = await ack(s, 'player:join', { code, name, team });
  return { s, r, id: r.data?.playerId as string };
}

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const nest = mod.createNestApplication<NestExpressApplication>();
  serveStatic(nest);
  app = nest;
  await app.listen(0);
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});

afterAll(async () => {
  sockets.forEach((s) => s.close());
  await app.close();
});

describe('player page', () => {
  it('serves /play/ with its title and assets', async () => {
    const res = await fetch(`${base}/play/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>VNR202 · Trang người chơi</title>');
    expect((await fetch(`${base}/play/play.js`)).status).toBe(200);
    expect((await fetch(`${base}/play/play.css`)).status).toBe(200);
  });
});

describe('host dashboard page', () => {
  it('is served at /host/ and does not shadow the host API', async () => {
    const page = await fetch(`${base}/host/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<title>VNR202 · Bảng điều khiển MC</title>');
    expect((await fetch(`${base}/host/host.js`)).status).toBe(200);
    expect((await fetch(`${base}/host/host.css`)).status).toBe(200);
    // API routes under the same prefix still need the key and still work with it
    for (const path of ['state', 'players', 'results', 'ranking', 'reflections']) {
      expect((await fetch(`${base}/host/${path}`)).status).toBe(401);
      expect((await fetch(`${base}/host/${path}`, { headers: { 'x-host-key': 'wrong' } })).status).toBe(401);
    }
    expect((await fetch(`${base}/host/state`, { headers: { 'x-host-key': 'test-key' } })).status).toBe(200);
    expect((await fetch(`${base}/host/joining/open`, { method: 'POST' })).status).toBe(401);
  });
});

describe('full session', () => {
  const P: Record<string, Awaited<ReturnType<typeof player>>> = {};

  it('rejects host calls without the key', async () => {
    expect((await host('state', 'GET', undefined, 'nope')).status).toBe(401);
  });

  it('players cannot join before joining opens, nor with a wrong code', async () => {
    const early = await player('x', 1);
    expect(early.r.ok).toBe(false);
    expect(early.r.error).toMatch(/not open/);
    await host('joining/open', 'POST');
    const wrong = await player('x', 1, 'ZZZZZ');
    expect(wrong.r.ok).toBe(false);
    const badTeam = await connect().then((s) => ack(s, 'player:join', { code: 'ABCDE', name: 'x', team: 9 }));
    expect(badTeam.ok).toBe(false);
  });

  it('joins 6 players in 3 teams', async () => {
    for (const [name, team] of [['t1p0', 1], ['t1p1', 1], ['t2p0', 2], ['t2p1', 2], ['t3p0', 3], ['t3p1', 3]] as const) {
      P[name] = await player(name, team);
      expect(P[name].r.ok).toBe(true);
      expect(P[name].r.data.joinedRound).toBe(1);
    }
    expect((await host('state')).body.joined).toBe(6);
  });

  it('enforces round order and phases', async () => {
    expect((await host('rounds/2/open-pick', 'POST')).status).toBe(409);
    expect((await host('rounds/1/open-guess', 'POST')).status).toBe(409);
    expect((await ack(P.t1p0.s, 'answer:pick', { round: 1, option: 'B' })).ok).toBe(false); // not open
  });

  it('round 1: pick, guess, reveal and personal result', async () => {
    await host('rounds/1/open-pick', 'POST');
    const picks: Record<string, string> = { t1p0: 'B', t1p1: 'B', t2p0: 'A', t2p1: 'B', t3p0: 'A', t3p1: 'A' };
    for (const [k, o] of Object.entries(picks)) expect((await ack(P[k].s, 'answer:pick', { round: 1, option: o })).ok).toBe(true);
    expect((await ack(P.t1p0.s, 'answer:pick', { round: 1, option: 'Z' })).ok).toBe(false);

    // guessing is not allowed during the pick step
    expect((await ack(P.t1p0.s, 'answer:guess', { round: 1, value: 10 })).ok).toBe(false);

    await host('rounds/1/open-guess', 'POST');
    const guesses: Record<string, number> = { t1p0: 25, t1p1: 35, t2p0: 50, t2p1: 0, t3p0: 70 }; // t3p1 stays silent
    for (const [k, v] of Object.entries(guesses)) expect((await ack(P[k].s, 'answer:guess', { round: 1, value: v })).ok).toBe(true);
    expect((await ack(P.t1p0.s, 'answer:guess', { round: 1, value: 101 })).ok).toBe(false);

    const revealed = new Promise<any>((resolve) => P.t1p0.s.once('round:reveal', resolve));
    const res = await host('rounds/1/reveal', 'POST');
    expect(res.status).toBe(200);
    const mine = await revealed;
    expect(mine.you).toMatchObject({ guess: 25, actual: 25, score: 100 });
    expect(mine.distribution.B).toBeCloseTo(50);

    const scores = Object.fromEntries(res.body.result.scores.map((s: any) => [s.playerId, s.score]));
    expect(scores[P.t1p1.id]).toBeCloseTo(90);
    expect(scores[P.t2p1.id]).toBeCloseTo(50);
    expect(scores[P.t3p0.id]).toBeCloseTo(95);
    expect(scores[P.t3p1.id]).toBe(0); // online and silent => 0
  });

  it('late joiner is scored from the next round; rejoin keeps identity', async () => {
    const late = await player('late', 3);
    expect(late.r.data.joinedRound).toBe(2);

    const again = await connect();
    const r = await ack(again, 'player:join', { code: 'ABCDE', playerId: P.t1p0.id });
    expect(r.ok).toBe(true);
    expect(r.data.playerId).toBe(P.t1p0.id);
  });

  it('round 2 shows the opening x% -> y% comparison', async () => {
    expect((await host('opening', 'POST', { percent: 140 })).status).toBe(400);
    await host('opening', 'POST', { percent: 40 });
    await host('rounds/2/open-pick', 'POST');
    for (const k of ['t1p0', 't1p1', 't2p0', 't2p1', 't3p0', 't3p1']) await ack(P[k].s, 'answer:pick', { round: 2, option: 'D' });
    await host('rounds/2/open-guess', 'POST');
    for (const k of ['t1p0', 't1p1', 't2p0', 't2p1', 't3p0', 't3p1']) await ack(P[k].s, 'answer:guess', { round: 2, value: 100 });
    const res = await host('rounds/2/reveal', 'POST');
    expect(res.body.result.comparison).toEqual({ x: 40, y: 100 });
  });

  it('rounds 3 and 4, then the announcement hides ranks until revealed', async () => {
    for (const n of [3, 4]) {
      await host(`rounds/${n}/open-pick`, 'POST');
      await host(`rounds/${n}/open-guess`, 'POST');
      await host(`rounds/${n}/reveal`, 'POST');
    }
    expect((await host('announce/next', 'POST')).status).toBe(409);
    expect((await host('announce/start', 'POST')).status).toBe(200);

    let state = await (await fetch(`${base}/state`)).json();
    expect(state.finale.standings.every((s: any) => s.team === null && s.score === null)).toBe(true);

    for (let i = 0; i < state.finale.total; i++) await host('announce/next', 'POST');
    state = await (await fetch(`${base}/state`)).json();
    const first = state.finale.standings.find((s: any) => s.rank === 1);
    expect(first.team).not.toBeNull();
    expect(first.perRound.length).toBeGreaterThan(0);
    expect((await host('announce/next', 'POST')).status).toBe(409);
  });

  it('rejoin returns own picks/guesses, past reveals and the reflected flag', async () => {
    const id = P.t1p0.id;
    const s = await connect();
    const r = await ack(s, 'player:join', { code: 'ABCDE', playerId: id });
    expect(r.ok).toBe(true);
    expect(r.data.playerId).toBe(id);
    const me = r.data.me;
    expect(me.picks['1']).toBe('B');
    expect(me.guesses['1']).toBe(25);
    expect(Object.keys(me.reveals).sort()).toEqual(['1', '2', '3', '4']);
    expect(me.reveals['1'].you).toMatchObject({ guess: 25, actual: 25, score: 100 });
    expect(me.reveals['2'].comparison).toEqual({ x: 40, y: 100 });
    expect(me.reflected).toBe(false);
    // another player's data is not leaked
    const other = await ack(await connect(), 'player:join', { code: 'ABCDE', playerId: P.t3p0.id });
    expect(other.data.me.guesses['1']).toBe(70);
    expect(other.data.me.picks['1']).toBe('A');
  });

  it('reflection wall: anonymous, moderated, one per player', async () => {
    expect((await ack(P.t1p0.s, 'reflection:submit', { text: 'hi' })).ok).toBe(false); // closed
    await host('reflection/open', 'POST');
    expect((await ack(P.t1p0.s, 'reflection:submit', { text: 'Bất ngờ vì ... ' })).ok).toBe(true);
    expect((await ack(P.t1p0.s, 'reflection:submit', { text: 'again' })).ok).toBe(false);
    expect((await ack(P.t1p1.s, 'reflection:submit', { text: 'x'.repeat(301) })).ok).toBe(false);

    expect(await (await fetch(`${base}/wall`)).json()).toEqual([]); // nothing approved yet
    const list = (await host('reflections')).body;
    expect(list[0]).not.toHaveProperty('playerId');
    for (const ref of list) expect(Object.keys(ref).sort()).toEqual(['approved', 'createdAt', 'id', 'text']);
    expect(JSON.stringify(list)).not.toContain(P.t1p0.id);

    // reflected survives a reconnect, still without any link stored on the reflection
    const again = await ack(await connect(), 'player:join', { code: 'ABCDE', playerId: P.t1p0.id });
    expect(again.data.me.reflected).toBe(true);
    const notYet = await ack(await connect(), 'player:join', { code: 'ABCDE', playerId: P.t1p1.id });
    expect(notYet.data.me.reflected).toBe(false);
    expect((await host('reflections')).body).toEqual(list);
    expect(JSON.stringify((await host('results')).body.reflections)).not.toContain(P.t1p0.id);
    await host(`reflections/${list[0].id}/approve`, 'POST', { approved: true });
    expect(await (await fetch(`${base}/wall`)).json()).toHaveLength(1);
  });
});
