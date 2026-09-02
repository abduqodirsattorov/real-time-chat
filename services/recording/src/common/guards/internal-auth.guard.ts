import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

@Injectable()
export class InternalOrJwtAuthGuard extends JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const serviceKey = req.headers['x-internal-service-key'];
    const expectedKey = process.env.INTERNAL_SERVICE_KEY ?? 'internal_service_default_secret_key';

    if (serviceKey && serviceKey === expectedKey) {
      req.user = { sub: 'service_call', role: 'admin', locale: 'uz' };
      return true;
    }

    // Fallback to standard JWT
    try {
      return (await super.canActivate(context)) as boolean;
    } catch {
      throw new UnauthorizedException('Ichki xizmat kaliti yoki JWT token talab qilinadi');
    }
  }
}
