import { UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { CentrifugoWebhookController } from './centrifugo.controller';

describe('Centrifugo subscribe proxy authorization', () => {
  const userId = '00000000-0000-4000-8000-000000000001';
  const resourceId = '00000000-0000-4000-8000-000000000002';
  const secret = 'unit-test-webhook-secret';
  const previousSecret = process.env.CENTRIFUGO_WEBHOOK_SECRET;
  let prisma: any;
  let controller: CentrifugoWebhookController;

  beforeEach(() => {
    process.env.CENTRIFUGO_WEBHOOK_SECRET = secret;
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: userId, role: 'operator', status: 'active' }) },
      room: { findUnique: jest.fn().mockResolvedValue({ productId: null, members: [] }) },
      call: { findUnique: jest.fn().mockResolvedValue({ productId: null, callerId: 'other', calleeId: 'other-operator' }) },
      operatorProduct: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    controller = new CentrifugoWebhookController(prisma);
  });

  afterAll(() => {
    if (previousSecret === undefined) delete process.env.CENTRIFUGO_WEBHOOK_SECRET;
    else process.env.CENTRIFUGO_WEBHOOK_SECRET = previousSecret;
  });

  function subscribe(prefix: string) {
    const body = { user: userId, channel: prefix + resourceId };
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = createHmac('sha256', secret).update(rawBody).digest('hex');
    return controller.onSubscribe({ rawBody, headers: { 'x-centrifugo-signature': signature } } as any, body);
  }

  it.each(['chat:room#', 'call:', 'call:call#'])('denies unrelated productless channels: %s', async prefix => {
    await expect(subscribe(prefix)).resolves.toHaveProperty('error.code', 1000);
    expect(prisma.operatorProduct.findFirst).not.toHaveBeenCalled();
  });

  it.each(['operator', 'supervisor'])('denies cross-product subscriptions to %s', async role => {
    prisma.user.findUnique.mockResolvedValue({ id: userId, role, status: 'active' });
    prisma.room.findUnique.mockResolvedValue({ productId: 'product-b', members: [] });
    prisma.call.findUnique.mockResolvedValue({ productId: 'product-b' });
    for (const prefix of ['chat:room#', 'call:']) {
      await expect(subscribe(prefix)).resolves.toHaveProperty('error.code', 1000);
    }
  });

  it('allows members and participants of productless resources', async () => {
    prisma.room.findUnique.mockResolvedValue({ productId: null, members: [{ userId }] });
    prisma.call.findUnique.mockResolvedValue({ productId: null, callerId: userId });
    for (const prefix of ['chat:room#', 'call:']) {
      await expect(subscribe(prefix)).resolves.toEqual({ result: {} });
    }
  });

  it('allows explicit product access and admin access', async () => {
    prisma.room.findUnique.mockResolvedValue({ productId: 'product-a', members: [] });
    prisma.operatorProduct.findFirst.mockResolvedValue({ productId: 'product-a' });
    await expect(subscribe('chat:room#')).resolves.toEqual({ result: {} });
    prisma.user.findUnique.mockResolvedValue({ id: userId, role: 'admin', status: 'active' });
    await expect(subscribe('call:')).resolves.toEqual({ result: {} });
  });

  it('rejects unsigned requests before querying authorization data', async () => {
    await expect(controller.onSubscribe({ headers: {} } as any, { user: userId, channel: 'call:' + resourceId })).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
