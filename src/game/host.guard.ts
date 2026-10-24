import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { GameService } from './game.service';

export function keyMatches(given: unknown, expected: string): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Injectable()
export class HostGuard implements CanActivate {
  constructor(private readonly game: GameService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (!keyMatches(req.headers['x-host-key'], this.game.config.hostKey)) throw new UnauthorizedException('Bad host key');
    return true;
  }
}
