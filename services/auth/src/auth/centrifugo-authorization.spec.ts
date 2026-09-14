import { ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('Centrifugo subscription token authorization', () => {
  const userId = '00000000-0000-4000-8000-000000000001';
  const resourceId = '00000000-0000-4000-8000-000000000002';
  let prisma: any;
  let jwt: any;
  let service: AuthService;
  const previousSecret = process.env.CENTRIFUGO_TOKEN_SECRET;

  beforeEach(() => {
    process.env.CENTRIFUGO_TOKEN_SECRET = 'unit-test-subscription-secret';
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: userId, role: 'operator', status: 'active' }) },
      room: { findUnique: jest.fn().mockResolvedValue({ productId: null, members: [] }) },
      call: { findUnique: jest.fn().mockResolvedValue({ productId: null, callerId: 'other', calleeId: 'other-operator' }) },
      operatorProduct: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    jwt = { sign: jest.fn().mockReturnValue('subscription-token') };
    service = new AuthService(prisma, {} as any, jwt);
  });

  afterAll(() => {
    if (previousSecret === undefined) delete process.env.CENTRIFUGO_TOKEN_SECRET;
    else process.env.CENTRIFUGO_TOKEN_SECRET = previousSecret;
  });

  it.each(['chat:room#', 'call:', 'call:call#'])('denies unrelated productless channels: %s', async prefix => {
    await expect(service.centrifugoSubscribe(userId, { channel: prefix + resourceId })).rejects.toThrow(ForbiddenException);
    expect(jwt.sign).not.toHaveBeenCalled();
    expect(prisma.operatorProduct.findFirst).not.toHaveBeenCalled();
  });

  it.each(['operator', 'supervisor'])('denies foreign-product channels to %s', async role => {
    prisma.user.findUnique.mockResolvedValue({ id: userId, role, status: 'active' });
    prisma.room.findUnique.mockResolvedValue({ productId: 'product-b', members: [] });
    prisma.call.findUnique.mockResolvedValue({ productId: 'product-b', callerId: 'other', calleeId: 'other-operator' });
    for (const prefix of ['chat:room#', 'call:']) {
      await expect(service.centrifugoSubscribe(userId, { channel: prefix + resourceId })).rejects.toThrow(ForbiddenException);
    }
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('allows active room members and call participants without a product', async () => {
    prisma.room.findUnique.mockResolvedValue({ productId: null, members: [{ userId, leftAt: null }] });
    prisma.call.findUnique.mockResolvedValue({ productId: null, callerId: userId, calleeId: 'operator' });
    for (const prefix of ['chat:room#', 'call:']) {
      await expect(service.centrifugoSubscribe(userId, { channel: prefix + resourceId })).resolves.toEqual({ token: 'subscription-token' });
    }
  });

  it('allows staff with explicit product access', async () => {
    prisma.room.findUnique.mockResolvedValue({ productId: 'product-a', members: [] });
    prisma.operatorProduct.findFirst.mockResolvedValue({ productId: 'product-a' });
    await expect(service.centrifugoSubscribe(userId, { channel: 'chat:room#' + resourceId })).resolves.toEqual({ token: 'subscription-token' });
    expect(prisma.operatorProduct.findFirst).toHaveBeenCalledWith({ where: { userId, productId: 'product-a' } });
  });

  it('preserves explicit admin access to productless resources', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: userId, role: 'admin', status: 'active' });
    for (const prefix of ['chat:room#', 'call:']) {
      await expect(service.centrifugoSubscribe(userId, { channel: prefix + resourceId })).resolves.toEqual({ token: 'subscription-token' });
    }
  });
});
