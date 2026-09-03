import {
  Injectable,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomInt } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RegisterDto } from './dto/register.dto';
import { OtpVerifyDto } from './dto/otp-verify.dto';
import { NovaSsoDto } from './dto/nova-sso.dto';
import { CentrifugoSubscribeDto } from './dto/centrifugo-subscribe.dto';
import { UserLocale, UserRole } from '@prisma/client';

const OTP_TTL = 300;           // 5 min
const REFRESH_TTL = 2592000;   // 30 days
const ACCESS_TTL = '1h';
const OTP_RATE_DAY = 5;
const OTP_MAX_ATTEMPTS = 5;
const NOVA_TS_TOLERANCE = 300; // 5 min replay window

const K = {
  otp: (phone: string) => `auth:otp:${phone}`,
  otpAttempts: (phone: string) => `auth:otp:attempts:${phone}`,
  otpMin: (phone: string) => `auth:otp:min:${phone}`,
  otpDay: (phone: string, d: string) => `auth:otp:day:${phone}:${d}`,
  refresh: (jti: string) => `auth:refresh:${jti}`,
  sessions: (uid: string) => `auth:sessions:${uid}`,
  revoked: (uid: string) => `auth:revoked:${uid}`,
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
  ) {}

  // ── Register ────────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existing) throw new ConflictException('Bu telefon raqam allaqachon ro\'ylxatdan o\'tgan');

    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        fullName: dto.fullName ?? null,
        locale: (dto.locale as UserLocale) ?? 'uz',
        role: 'customer',
        status: 'active',
      },
    });

    this.logger.log({ event: 'user_registered', userId: user.id, phone: dto.phone });
    return { userId: user.id, message: 'Ro\'yxatdan o\'tdingiz. OTP yuborish uchun /auth/otp/send ga murojaat qiling.' };
  }

  // ── OTP Send ─────────────────────────────────────────────────────────────────

  async otpSend(phone: string) {
    await this.enforceOtpRateLimit(phone);

    const otp = this.generateOtp();
    await this.redis.set(K.otp(phone), otp, OTP_TTL);
    await this.redis.del(K.otpAttempts(phone));

    // SMS provider yo'q — lokal console.log fallback
    this.logger.warn({ event: 'otp_sent', phone });
    console.log(`[OTP] ${phone}: ${otp}`);

    return { message: 'OTP yuborildi', ttl: OTP_TTL };
  }

  // ── OTP Verify ───────────────────────────────────────────────────────────────

  async otpVerify(dto: OtpVerifyDto) {
    const attemptKey = K.otpAttempts(dto.phone);
    const attempts = await this.redis.incr(attemptKey);
    if (attempts === 1) await this.redis.expire(attemptKey, OTP_TTL);

    if (attempts > OTP_MAX_ATTEMPTS) {
      await this.redis.del(K.otp(dto.phone));
      throw new ForbiddenException('Ko\'p noto\'g\'ri urinishlar qilindi. Yangi OTP so\'rang.');
    }

    const stored = await this.redis.get(K.otp(dto.phone));
    if (!stored || stored !== dto.otp) {
      throw new UnauthorizedException('OTP noto\'g\'ri yoki muddati tugagan');
    }

    await this.redis.del(K.otp(dto.phone));
    await this.redis.del(attemptKey);

    const user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi. Avval /auth/register ga murojaat qiling.');
    if (user.status !== 'active') throw new ForbiddenException('Hisobingiz faol emas');

    this.logger.log({ event: 'otp_verified', userId: user.id });
    return this.issueTokens(user.id, user.role, user.locale);
  }

  // ── Login (existing user → send OTP) ─────────────────────────────────────────

  async login(phone: string) {
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    if (user.status !== 'active') throw new ForbiddenException('Hisobingiz faol emas');

    return this.otpSend(phone);
  }

  // ── Email + Password Login (operator/admin) ───────────────────────────────────

  async emailLogin(email: string, password: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const failedKey = `auth:failed_login:${normalizedEmail}`;
    const failedCount = Number((await this.redis.get(failedKey)) || 0);
    if (failedCount >= 5) {
      throw new HttpException(
        'Juda ko\'p muvaffaqiyatsiz urinishlar. Iltimos, 15 daqiqadan so\'ng qayta urinib ko\'ring',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || !user.passwordHash) {
      const attempts = await this.redis.incr(failedKey);
      if (attempts === 1) await this.redis.expire(failedKey, 900);
      throw new UnauthorizedException('Email yoki parol noto\'g\'ri');
    }
    if (user.status !== 'active') throw new ForbiddenException('Hisobingiz faol emas');
    if (user.role === 'customer') throw new ForbiddenException('Bu kirish turi faqat operator va adminlar uchun');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const attempts = await this.redis.incr(failedKey);
      if (attempts === 1) await this.redis.expire(failedKey, 900);
      throw new UnauthorizedException('Email yoki parol noto\'g\'ri');
    }

    // Reset failed attempts on successful login
    await this.redis.del(failedKey);

    this.logger.log({ event: 'email_login', userId: user.id });
    return this.issueTokens(user.id, user.role, user.locale);
  }

  // ── Refresh Token Rotation ────────────────────────────────────────────────────

  async refresh(refreshToken: string) {
    let payload: { sub: string; jti: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Refresh token yaroqsiz yoki muddati tugagan');
    }

    const { sub: userId, jti } = payload;
    const stored = await this.redis.get(K.refresh(jti));

    if (!stored) {
      // Token allaqachon ishlatilgan — theft detection
      this.logger.warn({ event: 'refresh_token_theft', userId });
      const sessions = await this.redis.smembers(K.sessions(userId));
      for (const s of sessions) await this.redis.del(K.refresh(s));
      await this.redis.del(K.sessions(userId));
      throw new UnauthorizedException('Barcha sessiyalar bekor qilindi (token o\'g\'irligi aniqlandi)');
    }

    // Eski tokenni o'chirish
    await this.redis.del(K.refresh(jti));
    await this.redis.srem(K.sessions(userId), jti);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'active') throw new UnauthorizedException();

    this.logger.log({ event: 'token_refreshed', userId });
    return this.issueTokens(user.id, user.role, user.locale);
  }

  // ── Logout ───────────────────────────────────────────────────────────────────

  async logout(userId: string, jti: string) {
    await this.redis.del(K.refresh(jti));
    await this.redis.srem(K.sessions(userId), jti);
    this.logger.log({ event: 'logout', userId });
    return { message: 'Tizimdan chiqdingiz' };
  }

  // ── Get Me ───────────────────────────────────────────────────────────────────

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        role: true,
        status: true,
        locale: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException();
    return user;
  }

  // ── Update Locale ─────────────────────────────────────────────────────────────

  async updateLocale(userId: string, locale: 'uz' | 'ru') {
    await this.prisma.user.update({
      where: { id: userId },
      data: { locale: locale as UserLocale },
    });
    return { locale };
  }

  // ── Centrifugo Connection Token ───────────────────────────────────────────────

  async centrifugoToken(userId: string, role: string, locale: string) {
    const secret = process.env.CENTRIFUGO_TOKEN_SECRET;
    if (!secret) throw new Error('CENTRIFUGO_TOKEN_SECRET not configured');

    const token = this.jwt.sign(
      { sub: userId, info: { role, locale } },
      { secret, expiresIn: '1h' },
    );
    return { token };
  }

  // ── Centrifugo Subscribe Token ────────────────────────────────────────────────

  async centrifugoSubscribe(userId: string, dto: CentrifugoSubscribeDto) {
    const secret = process.env.CENTRIFUGO_TOKEN_SECRET;
    if (!secret) throw new Error('CENTRIFUGO_TOKEN_SECRET not configured');

    const channel = dto.channel;
    const [ns] = channel.split(':');
    const allowed = ['chat', 'presence', 'call'];
    if (!allowed.includes(ns)) throw new BadRequestException('Noto\'g\'ri kanal namespace');

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Fetch requesting user
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Foydalanuvchi topilmadi yoki bloklangan');
    }

    const isStaff = ['operator', 'supervisor', 'admin'].includes(user.role);

    // 1. Shaxsiy bildirishnoma kanali: chat:user#<userId>
    if (channel.startsWith('chat:user#')) {
      const targetUserId = channel.replace('chat:user#', '');
      if (targetUserId !== userId && user.role !== 'admin') {
        this.logger.warn({ event: 'centrifugo_token_user_denied', userId, targetUserId });
        throw new ForbiddenException('Boshqa foydalanuvchi kanaliga obuna bo\'lish huquqi yo\'q');
      }
    }
    // 2. Chat xonasi kanali: chat:room#<roomId>
    else if (channel.startsWith('chat:room#')) {
      const roomId = channel.replace('chat:room#', '');
      if (!UUID_REGEX.test(roomId)) {
        throw new BadRequestException('Noto\'g\'ri xona ID formati');
      }

      const room = await this.prisma.room.findUnique({
        where: { id: roomId },
        include: {
          members: { where: { userId, leftAt: null } },
        },
      });

      if (!room) {
        throw new NotFoundException('Xona topilmadi');
      }

      let hasAccess = false;
      if (room.members.length > 0) {
        hasAccess = true;
      } else if (isStaff) {
        if (!room.productId || user.role === 'admin') {
          hasAccess = true;
        } else {
          const hasProductAccess = await this.prisma.operatorProduct.findFirst({
            where: { userId, productId: room.productId },
          });
          if (hasProductAccess) {
            hasAccess = true;
          }
        }
      }

      if (!hasAccess) {
        this.logger.warn({ event: 'centrifugo_token_room_denied', userId, roomId });
        throw new ForbiddenException('Ushbu xonaga obuna bo\'lish huquqingiz yo\'q');
      }
    }
    // 3. Operatorlar mavjudlik kanali: presence:operators
    else if (channel === 'presence:operators') {
      if (!isStaff) {
        this.logger.warn({ event: 'centrifugo_token_operators_presence_denied', userId });
        throw new ForbiddenException('Faqat operator/supervisor/admin obuna bo\'la oladi');
      }
    }
    // 4. Qo'ng'iroq kanali: call:call#<callId> yoki call:<callId>
    else if (channel.startsWith('call:call#') || channel.startsWith('call:')) {
      const callId = channel.replace('call:call#', '').replace('call:', '');
      if (UUID_REGEX.test(callId)) {
        const call = await this.prisma.call.findUnique({ where: { id: callId } });
        if (call && call.callerId !== userId && call.calleeId !== userId && !isStaff) {
          throw new ForbiddenException('Qo\'ng\'iroq kanaliga ruxsat yo\'q');
        }
      }
    }

    const token = this.jwt.sign(
      { sub: userId, channel: dto.channel },
      { secret, expiresIn: '1h' },
    );
    return { token };
  }

  // ── Nova SSO ─────────────────────────────────────────────────────────────────

  async novaSso(dto: NovaSsoDto) {
    const ssoSecret = process.env.NOVA_SSO_SECRET;
    if (!ssoSecret) {
      throw new BadRequestException('NOVA_SSO_SECRET konfiguratsiya qilinmagan');
    }

    // 1. Timestamp tekshirish (replay attack)
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - dto.timestamp) > NOVA_TS_TOLERANCE) {
      throw new UnauthorizedException('Timestamp muddati o\'tgan yoki kelgusidagi vaqt');
    }

    // 2. HMAC signature tekshirish (to'liq payload yoki legacy)
    const expected = createHmac('sha256', ssoSecret)
      .update(`${dto.novaUserId}:${dto.timestamp}:${dto.novaRole}:${dto.locale ?? 'uz'}`)
      .digest('hex');

    const legacyExpected = createHmac('sha256', ssoSecret)
      .update(`${dto.novaUserId}:${dto.timestamp}`)
      .digest('hex');

    if (!timingSafeEqual(expected, dto.signature) && !timingSafeEqual(legacyExpected, dto.signature)) {
      this.logger.warn({ event: 'nova_sso_invalid_signature', novaUserId: dto.novaUserId });
      throw new UnauthorizedException('Imzo yaroqsiz');
    }

    // 3. Foydalanuvchi topish yoki yaratish
    const externalId = `nova_${dto.novaUserId}`;
    let user = await this.prisma.user.findUnique({ where: { externalId } });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          externalId,
          fullName: dto.fullName,
          role: dto.novaRole as UserRole,
          locale: (dto.locale as UserLocale) ?? 'uz',
          status: 'active',
        },
      });
      this.logger.log({ event: 'nova_sso_user_created', userId: user.id, externalId });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          fullName: dto.fullName,
          role: dto.novaRole as UserRole,
          locale: (dto.locale as UserLocale) ?? user.locale,
        },
      });
      this.logger.log({ event: 'nova_sso_user_updated', userId: user.id });
    }

    return this.issueTokens(user.id, user.role, user.locale);
  }

  // ── Private helpers ────────────────────────────────────────────────────────────

  private async issueTokens(userId: string, role: UserRole, locale: UserLocale) {
    const jti = uuidv4();
    const refreshJti = uuidv4();

    const accessToken = this.jwt.sign(
      { sub: userId, role, locale, jti },
      { secret: process.env.JWT_SECRET, expiresIn: ACCESS_TTL },
    );

    const refreshToken = this.jwt.sign(
      { sub: userId, jti: refreshJti },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '30d' },
    );

    await this.redis.set(K.refresh(refreshJti), userId, REFRESH_TTL);
    await this.redis.sadd(K.sessions(userId), refreshJti);

    // Token faqat holati 'active' bo'lgan hisobga beriladi (yuqorida tekshirilgan),
    // shuning uchun eskirgan bekor qilish belgisi tozalanadi — aks holda parol
    // almashtirilgandan keyin foydalanuvchi o'z hisobiga kira olmay qolardi.
    await this.redis.del(K.revoked(userId));

    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: 3600 };
  }

  private generateOtp(): string {
    return randomInt(100000, 1000000).toString();
  }

  private async enforceOtpRateLimit(phone: string) {
    const minKey = K.otpMin(phone);
    const count = await this.redis.incr(minKey);
    if (count === 1) await this.redis.expire(minKey, 60);
    if (count > 1) throw new BadRequestException('Bir daqiqada faqat 1 ta OTP so\'rov mumkin');

    const today = new Date().toISOString().slice(0, 10);
    const dayKey = K.otpDay(phone, today);
    const dayCount = await this.redis.incr(dayKey);
    if (dayCount === 1) await this.redis.expire(dayKey, 86400);
    if (dayCount > OTP_RATE_DAY) throw new BadRequestException('Kunlik OTP limiti (5 ta) oshib ketdi');
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
