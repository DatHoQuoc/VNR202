import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';

process.env.HOST_KEY = 'test-key';
process.env.ROOM_CODE = 'ABCDE';
process.env.DATA_FILE = '';
process.env.TEAMS = '6';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AppModule } = require('../src/app.module');

let app: INestApplication;
let base: string;
const sockets: Socket[] = [];

const host = async (path: string, method = 'GET', body?: unknown) => {
  const res = await fetch(`${base}/host/${path}`, {
    method,
    headers: { 'x-host-key': 'test-key', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const pub = async (path: string) => {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, body: await res.json().catch(() => null) };
};
const ack = (s: Socket, ev: string, payload: unknown): Promise<any> => new Promise((resolve) => s.emit(ev, payload, resolve));
const connect = (): Promise<Socket> =>
  new Promise((resolve) => {
    const s = io(base, { transports: ['websocket'], forceNew: true });
    sockets.push(s);
    s.on('connect', () => resolve(s));
  });

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

describe('projector routes', () => {
  const ids: string[] = [];

  it('nothing is available before a round is revealed', async () => {
    expect((await pub('/stage/rounds/1')).status).toBe(409); // lobby
    expect((await pub('/stage/finale')).status).toBe(409);
    expect((await pub('/stage/rounds/99')).status).toBe(404);
    expect((await pub('/stage/rounds/abc')).status).toBe(400);

    await host('joining/open', 'POST');
    for (const [name, team] of [['a', 1], ['b', 2], ['c', 3]] as const) {
      const s = await connect();
      const r = await ack(s, 'player:join', { code: 'ABCDE', name, team });
      ids.push(r.data.playerId);
      (s as any).pid = r.data.playerId;
    }
    await host('rounds/1/open-pick', 'POST');
    for (const s of sockets) await ack(s, 'answer:pick', { round: 1, option: 'B' });
    expect((await pub('/stage/rounds/1')).status).toBe(409); // pick step
    await host('rounds/1/open-guess', 'POST');
    for (const s of sockets) await ack(s, 'answer:guess', { round: 1, value: 50 });
    const guessing = await pub('/stage/rounds/1');
    expect(guessing.status).toBe(409);
    expect(JSON.stringify(guessing.body)).not.toContain('distribution');
  });

  it('after reveal it returns only class-wide numbers', async () => {
    await host('rounds/1/reveal', 'POST');
    const r = await pub('/stage/rounds/1');
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['comparison', 'correctOption', 'distribution', 'n', 'phase', 'target', 'title']);
    expect(r.body).toMatchObject({ n: 1, phase: 'revealed', target: 'B', comparison: null, correctOption: null });
    expect(r.body.distribution.B).toBeCloseTo(100);
    const text = JSON.stringify(r.body);
    for (const id of ids) expect(text).not.toContain(id);
    expect(text).not.toMatch(/scores|playerId|guess|excused|name/i);
    // rounds not reached yet stay closed
    expect((await pub('/stage/rounds/2')).status).toBe(409);
  });

  it('round 2 carries the opening comparison; a voided round is closed again', async () => {
    await host('opening', 'POST', { percent: 40 });
    await host('rounds/2/open-pick', 'POST');
    for (const s of sockets) await ack(s, 'answer:pick', { round: 2, option: 'D' });
    await host('rounds/2/open-guess', 'POST');
    for (const s of sockets) await ack(s, 'answer:guess', { round: 2, value: 90 });
    await host('rounds/2/reveal', 'POST');
    expect((await pub('/stage/rounds/2')).body.comparison).toEqual({ x: 40, y: 100 });

    await host('rounds/2/void', 'POST', { voided: true });
    const voided = await pub('/stage/rounds/2');
    expect(voided.status).toBe(409);
    expect(JSON.stringify(voided.body)).not.toContain('distribution');
    await host('rounds/2/void', 'POST', { voided: false });
    expect((await pub('/stage/rounds/2')).status).toBe(200);
  });

  it('round 4 exposes the correct option; the finale keeps hidden entries hidden', async () => {
    for (const n of [3, 4]) {
      await host(`rounds/${n}/open-pick`, 'POST');
      for (const s of sockets) await ack(s, 'answer:pick', { round: n, option: 'A' });
      await host(`rounds/${n}/open-guess`, 'POST');
      for (const s of sockets) await ack(s, 'answer:guess', { round: n, value: 50 });
      await host(`rounds/${n}/reveal`, 'POST');
    }
    expect((await pub('/stage/rounds/4')).body.correctOption).toBe('C');

    expect((await pub('/stage/finale')).status).toBe(409); // not announced
    await host('announce/start', 'POST');
    const hidden = await pub('/stage/finale');
    expect(hidden.status).toBe(200);
    expect(hidden.body).toEqual((await pub('/state')).body.finale);
    expect(hidden.body.revealed).toBe(0);
    expect(hidden.body.standings.every((s: any) => s.team === null && s.score === null && s.perRound === null)).toBe(true);

    for (let i = 0; i < hidden.body.total; i++) await host('announce/next', 'POST');
    const shown = await pub('/stage/finale');
    expect(shown.body).toEqual((await pub('/state')).body.finale);
    expect(shown.body.standings.every((s: any) => s.team !== null)).toBe(true);
    expect(shown.body.standings.find((s: any) => s.rank === 1).perRound.length).toBeGreaterThan(0);
    expect(JSON.stringify(shown.body)).not.toContain(ids[0]);
  });
});
