import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || (() => {
        throw new Error('JWT_SECRET is required');
      })(),
    }),
  ],
  providers: [JwtStrategy],
  exports: [JwtModule],
})
export class AuthModule {}
