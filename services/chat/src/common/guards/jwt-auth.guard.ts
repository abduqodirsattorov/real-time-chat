import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../../redis/redis.service';
import { PrismaService } from '../../prisma/prisma.service';
import { assertAccountActive } from './account-status';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private redis: RedisService,
    private prisma: PrismaService,
  ) {
    super();
  }

  async canActivate(ctx: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const valid = await super.canActivate(ctx);
    if (!valid) return false;

    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (user?.sub) {
      // Tezkor yo'l: Redis'dagi bekor qilish belgisi
      const revoked = await this.redis.get(`auth:revoked:${user.sub}`);
      if (revoked) {
        throw new UnauthorizedException('Akkaunt bloklangan yoki sessiya bekor qilingan');
      }
      // Haqiqat manbai: bazadagi hisob holati (Redis kaliti yo'qolsa ham ishlaydi)
      await assertAccountActive(this.prisma, user.sub);
    }

    return true;
  }

  handleRequest(err: any, user: any) {
    if (err || !user) throw err ?? new UnauthorizedException('Token yaroqsiz');
    return user;
  }
}
