import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../../prisma/prisma.service';
import { assertAccountActive } from './account-status';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers['authorization'] as string;
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException();
    const token = auth.slice(7);

    let payload: any;
    try {
      const secret = process.env.JWT_SECRET;
      if (!secret || (secret === 'dev_secret' && process.env.NODE_ENV === 'production')) {
        throw new Error('JWT_SECRET is required and must not be dev_secret');
      }
      payload = jwt.verify(token, secret) as any;
    } catch {
      throw new UnauthorizedException();
    }

    req.user = payload;
    if (payload?.sub) await assertAccountActive(this.prisma, payload.sub, payload.role);
    return true;
  }
}
