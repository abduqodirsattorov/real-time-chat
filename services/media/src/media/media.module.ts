import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { JwtStrategy } from '../common/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || (() => {
        throw new Error('JWT_SECRET is required');
      })(),
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [MediaService, JwtStrategy],
  controllers: [MediaController],
})
export class MediaModule {}
