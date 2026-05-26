import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export interface JwtUser {
  sub: string;
  role: string;
  locale: string;
  jti: string;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): JwtUser => {
  return ctx.switchToHttp().getRequest().user;
});

export const Public = () => SetMetadata('isPublic', true);
