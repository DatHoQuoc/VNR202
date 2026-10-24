import { Module } from '@nestjs/common';
import { GameGateway } from './game/game.gateway';
import { GameService } from './game/game.service';
import { HostController } from './game/host.controller';
import { HostGuard } from './game/host.guard';
import { PublicController } from './game/public.controller';

@Module({
  controllers: [PublicController, HostController],
  providers: [GameService, GameGateway, HostGuard],
})
export class AppModule {}
