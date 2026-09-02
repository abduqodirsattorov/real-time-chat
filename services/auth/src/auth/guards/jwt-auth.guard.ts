import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../../redis/redis.service';

export const IS_PUBLIC_KEY = 'isPublic';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private redis: RedisService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const valid = await super.canActivate(context);
    if (!valid) return false;

    const req = context.switchToHttp().getRequest();
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
    if (err || !user) throw err ?? new UnauthorizedException('Token yaroqsiz yoki muddati tugagan');
    return user;
  }
}
