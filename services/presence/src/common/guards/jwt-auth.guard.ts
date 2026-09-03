import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../../prisma/prisma.service';
import { assertAccountActive } from './account-status';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const ok = (await super.canActivate(ctx)) as boolean;
    if (!ok) return false;

    const req = ctx.switchToHttp().getRequest();
    if (req.user?.sub) await assertAccountActive(this.prisma, req.user.sub);
    return true;
  }

  handleRequest(err: any, user: any) {
    if (err || !user) throw new UnauthorizedException('Token yaroqsiz yoki yo\'q');
    return user;
  }
}
