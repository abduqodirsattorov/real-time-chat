import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers['authorization'] as string;
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException();
    const token = auth.slice(7);
    try {
      const secret = process.env.JWT_SECRET ?? 'dev_secret';
      const payload = jwt.verify(token, secret) as any;
      req.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
