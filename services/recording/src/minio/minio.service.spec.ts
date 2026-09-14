import * as Minio from 'minio';
import { MinioService } from './minio.service';
import { ServiceUnavailableException } from '@nestjs/common';

jest.mock('minio', () => ({ Client: jest.fn() }));

describe('Recording download URLs', () => {
  const original = process.env.MINIO_PUBLIC_ENDPOINT;
  afterEach(() => {
    if (original === undefined) delete process.env.MINIO_PUBLIC_ENDPOINT;
    else process.env.MINIO_PUBLIC_ENDPOINT = original;
    jest.resetAllMocks();
  });

  it('signs URLs with the public endpoint rather than internal Docker DNS', async () => {
    process.env.MINIO_PUBLIC_ENDPOINT = 'https://files.example.test';
    const internal = { bucketExists: jest.fn().mockResolvedValue(true) };
    const publicClient = { presignedGetObject: jest.fn().mockResolvedValue('signed-url') };
    (Minio.Client as jest.Mock).mockReturnValueOnce(internal).mockReturnValueOnce(publicClient);
    const service = new MinioService();
    await service.onModuleInit();
    await expect(service.signedGetUrl('recordings/test.mp3')).resolves.toBe('signed-url');
    expect(Minio.Client).toHaveBeenNthCalledWith(2, expect.objectContaining({
      endPoint: 'files.example.test', port: 443, useSSL: true, region: 'us-east-1',
    }));
    publicClient.presignedGetObject.mockRejectedValue(new Error('Unavailable'));
    await expect(service.signedGetUrl('recordings/test.mp3')).rejects.toThrow(ServiceUnavailableException);
  });
});
