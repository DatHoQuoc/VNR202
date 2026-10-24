import { INestApplication } from '@nestjs/common';
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
  app = mod.createNestApplication();
  await app.listen(0);
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});

afterAll(async () => {
  sockets.forEach((s) => s.close());
  await app.close();
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

  it('reflection wall: anonymous, moderated, one per player', async () => {
    expect((await ack(P.t1p0.s, 'reflection:submit', { text: 'hi' })).ok).toBe(false); // closed
    await host('reflection/open', 'POST');
    expect((await ack(P.t1p0.s, 'reflection:submit', { text: 'Bất ngờ vì ... ' })).ok).toBe(true);
    expect((await ack(P.t1p0.s, 'reflection:submit', { text: 'again' })).ok).toBe(false);
    expect((await ack(P.t1p1.s, 'reflection:submit', { text: 'x'.repeat(301) })).ok).toBe(false);

    expect(await (await fetch(`${base}/wall`)).json()).toEqual([]); // nothing approved yet
    const list = (await host('reflections')).body;
    expect(list[0]).not.toHaveProperty('playerId');
    await host(`reflections/${list[0].id}/approve`, 'POST', { approved: true });
    expect(await (await fetch(`${base}/wall`)).json()).toHaveLength(1);
  });
});
