import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDeviceDto } from './dto/register-device.dto';

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async register(userId: string, dto: RegisterDeviceDto) {
    const device = await this.prisma.device.upsert({
      where: {
        userId_pushToken: { userId, pushToken: dto.pushToken },
      },
      update: {
        voipToken: dto.voipToken,
        deviceName: dto.deviceName,
        appVersion: dto.appVersion,
        locale: dto.locale as any,
        lastSeen: new Date(),
      },
      create: {
        userId,
        platform: dto.platform as any,
        pushToken: dto.pushToken,
        voipToken: dto.voipToken,
        deviceName: dto.deviceName,
        appVersion: dto.appVersion,
        locale: dto.locale as any,
      },
    });

    this.logger.log({ event: 'device_registered', userId, platform: dto.platform, deviceId: device.id });
    return { id: device.id, platform: device.platform, registeredAt: device.createdAt };
  }

  async unregister(userId: string, pushToken: string) {
    const deleted = await this.prisma.device.deleteMany({
      where: { userId, pushToken },
    });
    return { deleted: deleted.count };
  }

  async getUserDevices(userId: string) {
    return this.prisma.device.findMany({
      where: { userId },
      select: { id: true, platform: true, deviceName: true, locale: true, lastSeen: true },
    });
  }
}
