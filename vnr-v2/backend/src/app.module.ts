import { Module } from '@nestjs/common';
import { AdminController } from './admin/admin.controller';
import { AdminService } from './admin/admin.service';
import { RoomsController } from './rooms/rooms.controller';
import { RoomsService } from './rooms/rooms.service';

@Module({ controllers: [AdminController, RoomsController], providers: [AdminService, RoomsService] })
export class AppModule {}
