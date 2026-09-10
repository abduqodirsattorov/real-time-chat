import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

@Injectable()
export class InternalOrJwtAuthGuard extends JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const serviceKey = req.headers['x-internal-service-key'];
    const expectedKey = process.env.INTERNAL_SERVICE_KEY;

    if (serviceKey) {
      if (!expectedKey || expectedKey === 'internal_service_default_secret_key') {
        throw new UnauthorizedException('INTERNAL_SERVICE_KEY xavfsiz sozlanmagan (fail-closed)');
      }
      if (serviceKey === expectedKey) {
        req.user = { sub: 'service_call', role: 'admin', locale: 'uz' };
        return true;
      }
      throw new UnauthorizedException('Ichki xizmat kaliti yaroqsiz');
    }

    // Fallback to standard JWT
    try {
      return (await super.canActivate(context)) as boolean;
    } catch {
      throw new UnauthorizedException('Ichki xizmat kaliti yoki JWT token talab qilinadi');
    }
  }
}
