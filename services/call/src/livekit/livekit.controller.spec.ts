import { ForbiddenException } from '@nestjs/common';
import { LiveKitController } from './livekit.controller';

describe('LiveKit HTTP token endpoint', () => {
  it('uses participant authorization rather than call read access', async () => {
    const livekit = { generateToken: jest.fn() };
    const calls = {
      getCall: jest.fn().mockResolvedValue({ livekitRoom: 'foreign-room' }),
      getLivekitToken: jest.fn().mockRejectedValue(new ForbiddenException()),
    };
    const controller = new LiveKitController(livekit as any, calls as any);
    const user = { sub: 'operator-a', phone: '+998900000000', role: 'operator', locale: 'uz' };
    await expect(controller.getToken(user, { callId: 'foreign-call' })).rejects.toThrow(ForbiddenException);
    expect(calls.getLivekitToken).toHaveBeenCalledWith(user, 'foreign-call');
    expect(livekit.generateToken).not.toHaveBeenCalled();
  });
});
