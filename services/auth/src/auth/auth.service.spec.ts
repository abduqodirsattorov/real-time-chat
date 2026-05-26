import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

// ── Test env vars ────────────────────────────────────────────────────────────
process.env.JWT_SECRET = 'test_jwt_secret_32_chars_minimum_xx';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_32_chars_min_xx';
process.env.CENTRIFUGO_TOKEN_SECRET = 'test_centrifugo_secret';
process.env.NOVA_SSO_SECRET = 'test_nova_sso_secret';

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockUser = {
  id: 'user-uuid-1234',
  phone: '+998901234567',
  externalId: null,
  fullName: 'Test User',
  role: 'customer' as const,
  status: 'active' as const,
  locale: 'uz' as const,
};

const prisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

const redis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  sadd: jest.fn(),
  srem: jest.fn(),
  smembers: jest.fn(),
};

// ── Suite ────────────────────────────────────────────────────────────────────
describe('AuthService', () => {
  let service: AuthService;
  let jwt: JwtService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        JwtService,
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwt = module.get<JwtService>(JwtService);
  });

  // ── Register ───────────────────────────────────────────────────────────────

  describe('register', () => {
    it('yangi foydalanuvchi yaratadi', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockUser);

      const result = await service.register({ phone: '+998901234567', fullName: 'Test' });

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ phone: '+998901234567' }) }),
      );
      expect(result).toHaveProperty('userId');
    });

    it('mavjud telefon raqamda ConflictException tashlaydi', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.register({ phone: '+998901234567' })).rejects.toThrow(ConflictException);
    });
  });

  // ── OTP Send ──────────────────────────────────────────────────────────────

  describe('otpSend', () => {
    beforeEach(() => {
      redis.incr.mockResolvedValue(1);
      redis.expire.mockResolvedValue(1);
      redis.set.mockResolvedValue('OK');
    });

    it('OTP yuboradi va TTL qaytaradi', async () => {
      const result = await service.otpSend('+998901234567');
      expect(result).toHaveProperty('ttl', 300);
      expect(redis.set).toHaveBeenCalledWith(
        'auth:otp:+998901234567',
        expect.stringMatching(/^\d{6}$/),
        300,
      );
    });

    it('bir daqiqada ikkinchi so\'rovda BadRequestException tashlaydi', async () => {
      redis.incr.mockResolvedValue(2);
      await expect(service.otpSend('+998901234567')).rejects.toThrow(BadRequestException);
    });

    it('kunlik 5 ta limitdan oshganda BadRequestException tashlaydi', async () => {
      redis.incr
        .mockResolvedValueOnce(1)  // minute counter
        .mockResolvedValueOnce(6); // day counter > 5
      await expect(service.otpSend('+998901234567')).rejects.toThrow(BadRequestException);
    });
  });

  // ── OTP Verify ────────────────────────────────────────────────────────────

  describe('otpVerify', () => {
    it('to\'g\'ri OTP bilan token qaytaradi', async () => {
      redis.get.mockResolvedValue('123456');
      redis.del.mockResolvedValue(1);
      redis.set.mockResolvedValue('OK');
      redis.sadd.mockResolvedValue(1);
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.otpVerify({ phone: '+998901234567', otp: '123456' });
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.tokenType).toBe('Bearer');
    });

    it('noto\'g\'ri OTP bilan UnauthorizedException tashlaydi', async () => {
      redis.get.mockResolvedValue('999999');
      await expect(service.otpVerify({ phone: '+998901234567', otp: '123456' })).rejects.toThrow(UnauthorizedException);
    });

    it('OTP muddati tugagan bo\'lsa (null) UnauthorizedException tashlaydi', async () => {
      redis.get.mockResolvedValue(null);
      await expect(service.otpVerify({ phone: '+998901234567', otp: '123456' })).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── JWT Verify ────────────────────────────────────────────────────────────

  describe('JWT token validation', () => {
    it('yaroqli access token yaratadi va tekshiradi', async () => {
      redis.get.mockResolvedValue('123456');
      redis.del.mockResolvedValue(1);
      redis.set.mockResolvedValue('OK');
      redis.sadd.mockResolvedValue(1);
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const tokens = await service.otpVerify({ phone: '+998901234567', otp: '123456' });
      const payload = jwt.verify(tokens.accessToken, { secret: process.env.JWT_SECRET });

      expect(payload).toMatchObject({ sub: mockUser.id, role: 'customer', locale: 'uz' });
      expect(payload).toHaveProperty('jti');
      expect(payload).toHaveProperty('exp');
    });

    it('noto\'g\'ri secret bilan verify xato tashlaydi', () => {
      const token = jwt.sign({ sub: 'test' }, { secret: 'wrong_secret' });
      expect(() => jwt.verify(token, { secret: process.env.JWT_SECRET })).toThrow();
    });

    it('muddati tugagan token xato tashlaydi', () => {
      const token = jwt.sign({ sub: 'test' }, { secret: process.env.JWT_SECRET, expiresIn: -1 });
      expect(() => jwt.verify(token, { secret: process.env.JWT_SECRET })).toThrow();
    });
  });

  // ── Refresh Token Rotation ────────────────────────────────────────────────

  describe('refresh', () => {
    it('yangi token juftini qaytaradi va eskisini o\'chiradi', async () => {
      const { refreshToken } = await issueTestTokens(service, redis);

      redis.get.mockResolvedValue(mockUser.id);
      redis.del.mockResolvedValue(1);
      redis.srem.mockResolvedValue(1);
      redis.set.mockResolvedValue('OK');
      redis.sadd.mockResolvedValue(1);
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.refresh(refreshToken);
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(redis.del).toHaveBeenCalled();
    });

    it('qayta ishlatilgan token — theft detection — barcha sessiyalar o\'chiriladi', async () => {
      const { refreshToken } = await issueTestTokens(service, redis);

      redis.get.mockResolvedValue(null); // token allaqachon o'chirilgan
      redis.smembers.mockResolvedValue(['jti1', 'jti2']);
      redis.del.mockResolvedValue(1);

      await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);
      expect(redis.smembers).toHaveBeenCalled();
    });

    it('yaroqsiz refresh token xato tashlaydi', async () => {
      await expect(service.refresh('invalid.token.here')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── Nova SSO ──────────────────────────────────────────────────────────────

  describe('novaSso', () => {
    function makeDto(overrides: Partial<{ novaUserId: string; timestamp: number; signature: string }> = {}) {
      const novaUserId = overrides.novaUserId ?? '42';
      const timestamp = overrides.timestamp ?? Math.floor(Date.now() / 1000);
      const signature =
        overrides.signature ??
        createHmac('sha256', process.env.NOVA_SSO_SECRET).update(`${novaUserId}:${timestamp}`).digest('hex');
      return { novaUserId, novaRole: 'operator' as const, fullName: 'Nova Admin', locale: 'uz' as const, timestamp, signature };
    }

    it('yangi Nova foydalanuvchisini yaratadi va JWT beradi', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ ...mockUser, externalId: 'nova_42', role: 'operator' });
      redis.set.mockResolvedValue('OK');
      redis.sadd.mockResolvedValue(1);

      const result = await service.novaSso(makeDto());
      expect(result).toHaveProperty('accessToken');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ externalId: 'nova_42' }) }),
      );
    });

    it('mavjud Nova foydalanuvchisini yangilaydi', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, externalId: 'nova_42', role: 'operator' });
      prisma.user.update.mockResolvedValue({ ...mockUser, externalId: 'nova_42', role: 'operator' });
      redis.set.mockResolvedValue('OK');
      redis.sadd.mockResolvedValue(1);

      const result = await service.novaSso(makeDto());
      expect(result).toHaveProperty('accessToken');
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('noto\'g\'ri signature bilan UnauthorizedException tashlaydi', async () => {
      await expect(service.novaSso(makeDto({ signature: 'invalidsignature' }))).rejects.toThrow(UnauthorizedException);
    });

    it('eski timestamp bilan UnauthorizedException tashlaydi', async () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 400s old
      await expect(service.novaSso(makeDto({ timestamp: oldTimestamp }))).rejects.toThrow(UnauthorizedException);
    });
  });
});

// ── Test helper ──────────────────────────────────────────────────────────────

async function issueTestTokens(service: AuthService, redis: any) {
  redis.get.mockResolvedValue('123456');
  redis.del.mockResolvedValue(1);
  redis.set.mockResolvedValue('OK');
  redis.sadd.mockResolvedValue(1);
  (service['prisma'].user.findUnique as jest.Mock).mockResolvedValue({
    id: 'user-uuid-1234',
    phone: '+998901234567',
    role: 'customer',
    status: 'active',
    locale: 'uz',
  });

  return service.otpVerify({ phone: '+998901234567', otp: '123456' });
}
