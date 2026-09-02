import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateAuditLogParams {
  actorId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  payload?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(params: CreateAuditLogParams): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: params.actorId ?? null,
          action: params.action,
          targetType: params.targetType ?? null,
          targetId: params.targetId ?? null,
          payload: params.payload ?? {},
          ipAddress: params.ipAddress ?? null,
          userAgent: params.userAgent ?? null,
        },
      });
    } catch (err: any) {
      this.logger.error(`Failed to create audit log for action ${params.action}: ${err.message}`);
    }
  }
}
