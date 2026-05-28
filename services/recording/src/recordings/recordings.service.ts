import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { LiveKitEgressService } from '../livekit/livekit-egress.service';
import { MinioService } from '../minio/minio.service';
import { JwtUser } from '../common/decorators/current-user.decorator';

const PRIVILEGED_ROLES = new Set(['admin', 'supervisor']);
const OPERATOR_ROLES = new Set(['operator', 'supervisor', 'admin']);

@Injectable()
export class RecordingsService {
  private readonly logger = new Logger(RecordingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitmq: RabbitMQService,
    private readonly egress: LiveKitEgressService,
    private readonly minio: MinioService,
  ) {}

  // ── QISM 2: POST /recordings/start ──────────────────────────────────────────
  // Called by call-service after consent-ack. Starts Egress and updates DB.

  async start(dto: { recordingId: string; callId: string; livekitRoom: string }) {
    const recording = await this.prisma.recording.findUnique({ where: { id: dto.recordingId } });
    if (!recording) throw new NotFoundException('Recording topilmadi');
    if (!recording.consentAnnounced) throw new BadRequestException('Consent tasdiqlanmagan — Egress boshlanmaydi');
    if (recording.status !== 'starting') throw new BadRequestException(`Recording holati: ${recording.status}`);

    const storageKey = this.minio.storageKey(dto.callId);
    const egressId = await this.egress.startRoomEgress(dto.callId, dto.livekitRoom);

    const updated = await this.prisma.recording.update({
      where: { id: dto.recordingId },
      data: {
        status: egressId ? 'active' : 'starting',
        egressId: egressId ?? null,
        storageKey,
      },
    });

    this.logger.log({ event: 'recording_started', recordingId: dto.recordingId, egressId, callId: dto.callId });
    return { recordingId: dto.recordingId, status: updated.status, egressId, storageKey };
  }

  // ── QISM 2: POST /recordings/stop ───────────────────────────────────────────

  async stop(dto: { recordingId: string }) {
    const recording = await this.prisma.recording.findUnique({ where: { id: dto.recordingId } });
    if (!recording) throw new NotFoundException('Recording topilmadi');
    if (!['active', 'starting'].includes(recording.status))
      throw new BadRequestException(`Recording holati: ${recording.status}`);

    if (recording.egressId) await this.egress.stopEgress(recording.egressId);

    const now = new Date();
    const durationMs = now.getTime() - recording.startedAt.getTime();

    await this.prisma.recording.update({
      where: { id: dto.recordingId },
      data: { status: 'processing', stoppedAt: now, durationMs },
    });

    this.logger.log({ event: 'recording_stopped', recordingId: dto.recordingId });
    return { recordingId: dto.recordingId, status: 'processing', durationMs };
  }

  // ── QISM 5: GET /recordings/:id (access control) ────────────────────────────

  async getRecording(user: JwtUser, recordingId: string, request: any) {
    const recording = await this.prisma.recording.findUnique({
      where: { id: recordingId },
      include: { call: true },
    });
    if (!recording) throw new NotFoundException('Recording topilmadi');

    this.assertAccess(user, recording);

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        actorId: user.sub,
        action: 'recording.accessed',
        targetType: 'recording',
        targetId: recordingId,
        payload: { callId: recording.callId, status: recording.status },
        ipAddress: request.ip ?? null,
        userAgent: request.headers?.['user-agent'] ?? null,
      },
    });

    let signedUrl: string | null = null;
    if (recording.storageKey && recording.status === 'completed') {
      signedUrl = await this.minio.signedGetUrl(recording.storageKey);
    }

    return { ...recording, signedUrl };
  }

  // ── QISM 2: GET /recordings/by-call/:callId ──────────────────────────────────

  async getByCall(user: JwtUser, callId: string) {
    if (!OPERATOR_ROLES.has(user.role)) throw new ForbiddenException('Ruxsat yo\'q');

    const recordings = await this.prisma.recording.findMany({
      where: { callId },
      orderBy: { startedAt: 'desc' },
    });

    return { callId, recordings };
  }

  // ── QISM 4: Webhook event handlers ──────────────────────────────────────────

  async handleEgressStarted(egressId: string) {
    const recording = await this.prisma.recording.findFirst({ where: { egressId } });
    if (!recording) { this.logger.warn({ event: 'webhook_no_recording', egressId }); return; }

    await this.prisma.recording.update({
      where: { id: recording.id },
      data: { status: 'active' },
    });

    this.logger.log({ event: 'webhook_egress_started', recordingId: recording.id, egressId });
  }

  async handleEgressEnded(egressId: string, info: any) {
    const recording = await this.prisma.recording.findFirst({ where: { egressId } });
    if (!recording) { this.logger.warn({ event: 'webhook_no_recording', egressId }); return; }

    const durationMs = info?.duration ? Math.round(Number(info.duration) * 1000) : recording.durationMs;
    const sizeBytes = info?.fileSize ? BigInt(info.fileSize) : null;
    const storageKey = info?.fileResults?.[0]?.filename ?? recording.storageKey;

    await this.prisma.recording.update({
      where: { id: recording.id },
      data: {
        status: 'completed',
        durationMs,
        sizeBytes,
        storageKey: storageKey ?? recording.storageKey,
        stoppedAt: new Date(),
      },
    });

    await this.rabbitmq.publish('call.recording.completed', {
      recording_id: recording.id,
      call_id: recording.callId,
      storage_key: storageKey ?? recording.storageKey,
      duration_ms: durationMs,
      ts: Date.now(),
    });

    this.logger.log({ event: 'webhook_egress_ended', recordingId: recording.id, durationMs });
  }

  async handleEgressFailed(egressId: string, reason: string) {
    const recording = await this.prisma.recording.findFirst({ where: { egressId } });
    if (!recording) { this.logger.warn({ event: 'webhook_no_recording', egressId }); return; }

    await this.prisma.recording.update({
      where: { id: recording.id },
      data: { status: 'failed', failedReason: reason },
    });

    this.logger.warn({ event: 'webhook_egress_failed', recordingId: recording.id, egressId, reason });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private assertAccess(user: JwtUser, recording: any) {
    if (PRIVILEGED_ROLES.has(user.role)) return;

    const isCallOperator = recording.call?.calleeId === user.sub;
    const isStartedBy = recording.startedBy === user.sub;

    if (!isCallOperator && !isStartedBy) {
      this.logger.warn({ event: 'recording_access_denied', userId: user.sub, recordingId: recording.id });
      throw new ForbiddenException('Bu yozuvga kirish huquqi yo\'q');
    }
  }
}
