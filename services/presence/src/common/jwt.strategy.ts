import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const secret = process.env.JWT_SECRET;
    if (!secret || (secret === 'dev_secret' && process.env.NODE_ENV === 'production')) {
      throw new Error('JWT_SECRET is required and must not be dev_secret');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }
  async validate(payload: any) {
    return { sub: payload.sub, role: payload.role, locale: payload.locale ?? 'uz' };
  }
}
