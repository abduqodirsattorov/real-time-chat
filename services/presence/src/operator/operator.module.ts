import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { OperatorService } from './operator.service';
import { OperatorController } from './operator.controller';
import { JwtStrategy } from '../common/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev_secret' }),
  ],
  providers: [OperatorService, JwtStrategy],
  controllers: [OperatorController],
  exports: [OperatorService],
})
export class OperatorModule {}
