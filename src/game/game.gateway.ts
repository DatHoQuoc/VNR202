import { HttpException } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { loadConfig } from '../config/config';
import { GameService } from './game.service';
import { keyMatches } from './host.guard';

type Ack<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

function run<T>(fn: () => T): Ack<T> {
  try {
    return { ok: true, data: fn() };
  } catch (e) {
    if (e instanceof HttpException) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * Client -> server (all return an ack {ok, data|error}):
 *   player:join        { code, name, team, playerId? }   -> { playerId, joinedRound, state }
 *   answer:pick        { round, option }
 *   answer:guess       { round, value }
 *   reflection:submit  { text }
 *   host:join          { key }                            -> live host:stats
 * Server -> client:
 *   state              public state (everyone)
 *   round:reveal       personal result after a round is revealed (to that player)
 *   host:stats         counts for the controller dashboard (host room)
 */
@WebSocketGateway({ cors: { origin: loadConfig().corsOrigin } })
export class GameGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(private readonly game: GameService) {}

  afterInit(): void {
    this.game.on('state', () => {
      this.server.emit('state', this.game.publicState());
      this.pushStats();
    });
    this.game.on('stats', () => this.pushStats());
    this.game.on('reveal', (n: number) => {
      for (const id of this.game.playerIds()) {
        const payload = this.game.revealFor(id, n);
        if (payload) this.server.to(`p:${id}`).emit('round:reveal', payload);
      }
    });
  }

  private pushStats(): void {
    this.server.to('host').emit('host:stats', this.game.hostStats());
  }

  handleDisconnect(client: Socket): void {
    this.game.detach(client.id);
  }

  @SubscribeMessage('player:join')
  join(@ConnectedSocket() client: Socket, @MessageBody() body: { code: string; name: string; team: number; playerId?: string }) {
    return run(() => {
      const p = this.game.join(body ?? ({} as never));
      client.data.playerId = p.id;
      client.join(`p:${p.id}`);
      this.game.attach(p.id, client.id);
      this.pushStats();
      return { playerId: p.id, team: p.team, joinedRound: p.joinedRound, state: this.game.publicState() };
    });
  }

  @SubscribeMessage('answer:pick')
  pick(@ConnectedSocket() client: Socket, @MessageBody() body: { round: number; option: string }) {
    return run(() => this.game.pick(client.data.playerId, Number(body?.round), String(body?.option)));
  }

  @SubscribeMessage('answer:guess')
  guess(@ConnectedSocket() client: Socket, @MessageBody() body: { round: number; value: number }) {
    return run(() => this.game.guess(client.data.playerId, Number(body?.round), body?.value));
  }

  @SubscribeMessage('reflection:submit')
  reflect(@ConnectedSocket() client: Socket, @MessageBody() body: { text: string }) {
    return run(() => this.game.submitReflection(client.data.playerId, body?.text));
  }

  @SubscribeMessage('host:join')
  host(@ConnectedSocket() client: Socket, @MessageBody() body: { key: string }) {
    if (!keyMatches(body?.key, this.game.config.hostKey)) return { ok: false, error: 'Bad host key' } as Ack;
    client.join('host');
    return { ok: true, data: this.game.hostStats() } as Ack;
  }
}
