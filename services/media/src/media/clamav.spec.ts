import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import * as net from 'net';
import { Readable } from 'stream';
import { assertScannerConfiguration, scanWithClamAV } from './clamav';

describe('ClamAV INSTREAM client', () => {
  let server: net.Server;
  const sockets = new Set<net.Socket>();
  let onFile: (socket: net.Socket, file: Buffer) => void;
  let received: Buffer;
  const saved = { ...process.env };

  beforeEach(async () => {
    process.env.CLAMAV_ENABLED = 'true';
    process.env.CLAMAV_HOST = '127.0.0.1';
    received = undefined;
    onFile = socket => socket.end('stream: OK\0');
    server = net.createServer(socket => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => {});
      let input = Buffer.alloc(0);
      let commandRead = false;
      const chunks: Buffer[] = [];
      socket.on('data', data => {
        input = Buffer.concat([input, data]);
        if (!commandRead) {
          if (input.length < 10) return;
          expect(input.subarray(0, 10).toString()).toBe('zINSTREAM\0');
          input = input.subarray(10);
          commandRead = true;
        }
        while (input.length >= 4) {
          const length = input.readUInt32BE(0);
          if (input.length < length + 4) return;
          if (!length) {
            received = Buffer.concat(chunks);
            onFile(socket, received);
            input = input.subarray(4);
            return;
          }
          expect(length).toBeLessThanOrEqual(64 * 1024);
          chunks.push(input.subarray(4, length + 4));
          input = input.subarray(length + 4);
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    process.env.CLAMAV_PORT = String((server.address() as net.AddressInfo).port);
  });

  afterEach(async () => {
    for (const socket of sockets) socket.destroy();
    if (server?.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    for (const key of ['NODE_ENV', 'CLAMAV_ENABLED', 'CLAMAV_HOST', 'CLAMAV_PORT']) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('sends framed chunks and accepts a fragmented clean verdict', async () => {
    const bytes = Buffer.alloc(200_000, 42);
    onFile = socket => { socket.write('stream: O'); setImmediate(() => socket.end('K\0')); };
    await expect(scanWithClamAV(Readable.from([bytes]))).resolves.toBeUndefined();
    expect(received).toEqual(bytes);
  });

  it('rejects malware even when its signature name contains OK', async () => {
    onFile = socket => socket.end('stream: Test.OK.Signature FOUND\0');
    await expect(scanWithClamAV(Readable.from(['test']))).rejects.toThrow(BadRequestException);
  });

  it.each(['stream: Limit exceeded ERROR\0', 'NOT OK\0', 'stream: OK', ''])('rejects incomplete or ambiguous scanner replies: %s', async reply => {
    onFile = socket => socket.end(reply);
    await expect(scanWithClamAV(Readable.from(['test']))).rejects.toThrow(ServiceUnavailableException);
  });

  it('times out instead of waiting forever for a verdict', async () => {
    onFile = () => {};
    await expect(scanWithClamAV(Readable.from(['test']), 50)).rejects.toThrow(ServiceUnavailableException);
  });

  it('fails closed on connection errors even in development', async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    process.env.NODE_ENV = 'development';
    await expect(scanWithClamAV(Readable.from(['test']))).rejects.toThrow(ServiceUnavailableException);
  });

  it('rejects disabled scanning at startup and at runtime in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CLAMAV_ENABLED = 'false';
    expect(() => assertScannerConfiguration()).toThrow(ServiceUnavailableException);
    await expect(scanWithClamAV(Readable.from(['test']))).rejects.toThrow(ServiceUnavailableException);
  });
});
