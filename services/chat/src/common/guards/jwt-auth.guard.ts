import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private redis: RedisService,
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
      const revoked = await this.redis.get(`auth:revoked:${user.sub}`);
      if (revoked) {
        throw new UnauthorizedException('Akkaunt bloklangan yoki sessiya bekor qilingan');
      }
    }

    return true;
  }

  handleRequest(err: any, user: any) {
    if (err || !user) throw err ?? new UnauthorizedException('Token yaroqsiz');
    return user;
  }
}
