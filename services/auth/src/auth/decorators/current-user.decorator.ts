import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../guards/jwt-auth.guard';
import { JwtPayload } from '../strategies/jwt.strategy';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
