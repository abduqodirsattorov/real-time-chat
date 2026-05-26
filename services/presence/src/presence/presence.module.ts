import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { PresenceService } from './presence.service';
import { PresenceController } from './presence.controller';
import { JwtStrategy } from '../common/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev_secret' }),
  ],
  providers: [PresenceService, JwtStrategy],
  controllers: [PresenceController],
  exports: [PresenceService],
})
export class PresenceModule {}
