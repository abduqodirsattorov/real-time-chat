import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { once } from 'events';
import * as net from 'net';
import { Readable } from 'stream';

export function assertScannerConfiguration(): boolean {
  const enabled = process.env.CLAMAV_ENABLED === 'true';
  if (!enabled && process.env.NODE_ENV === 'production') {
    throw new ServiceUnavailableException('CLAMAV_ENABLED must be true in production');
  }
  return enabled;
}

export async function scanWithClamAV(source: Readable, timeoutMs = 30_000): Promise<void> {
  let socket: net.Socket | undefined;
  let timer: NodeJS.Timeout | undefined;
  try {
    if (!assertScannerConfiguration()) return;
    socket = net.createConnection({
      host: process.env.CLAMAV_HOST || 'clamav',
      port: Number(process.env.CLAMAV_PORT || 3310),
    });
    timer = setTimeout(() => socket.destroy(new Error('Antivirus scan timed out')), timeoutMs);
    let sentAll = false;
    const response = new Promise<void>((resolve, reject) => {
      let reply = '';
      socket.on('data', data => {
        reply += data.toString('utf8');
        if (reply.length > 8192) return reject(new Error('Antivirus response too large'));
        if (!reply.includes('\0')) return;
        const result = reply.slice(0, reply.indexOf('\0'));
        if (/^stream: .+ FOUND$/.test(result)) {
          reject(new BadRequestException('Malware detected'));
        } else if (result === 'stream: OK' && sentAll) {
          resolve();
        } else {
          reject(new Error('Antivirus did not return a clean verdict'));
        }
      });
      socket.once('error', reject);
      socket.once('end', () => reject(new Error('Incomplete antivirus response')));
      socket.once('close', () => reject(new Error('Antivirus connection closed')));
    });
    const write = (data: Buffer) => new Promise<void>((resolve, reject) => {
      socket.write(data, error => error ? reject(error) : resolve());
    });
    const send = async () => {
      await once(socket, 'connect');
      await write(Buffer.from('zINSTREAM\0'));
      for await (const data of source) {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        for (let offset = 0; offset < buffer.length; offset += 64 * 1024) {
          const chunk = buffer.subarray(offset, offset + 64 * 1024);
          const header = Buffer.alloc(4);
          header.writeUInt32BE(chunk.length);
          // Await each write so a slow scanner cannot queue the entire file in memory.
          await write(Buffer.concat([header, chunk]));
        }
      }
      sentAll = true;
      await write(Buffer.alloc(4));
    };
    await Promise.all([response, send()]);
  } catch (error) {
    if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) throw error;
    throw new ServiceUnavailableException('Antivirus scanning is unavailable');
  } finally {
    clearTimeout(timer);
    socket?.destroy();
    source.destroy();
  }
}
