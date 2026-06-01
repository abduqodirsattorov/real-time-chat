import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { CentrifugoService } from '../centrifugo/centrifugo.service';
import { LiveKitService } from '../livekit/livekit.service';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { InitiateCallDto, OutboundCallDto, TransferCallDto, HoldDto, MuteDto } from './calls.dto';
import { CallStatus, TransferType, TransferStatus } from '@prisma/client';

const OPERATOR_ROLES = new Set(['operator', 'supervisor', 'admin']);
const CLAIM_TTL = 5;

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly rabbitmq: RabbitMQService,
    private readonly centrifugo: CentrifugoService,
    private readonly livekit: LiveKitService,
  ) {}

  // ── QISM 3: Inbound call ─────────────────────────────────────────────────────

  async initiateCall(user: JwtUser, dto: InitiateCallDto) {
    const roomName = `call-${Date.now()}-${user.sub.slice(0, 8)}`;

    const call = await this.prisma.call.create({
      data: {
        callerId: user.sub,
        direction: 'inbound',
        status: 'initiating',
        livekitRoom: roomName,
        metadata: { subject: dto.subject ?? null, skills: dto.requiredSkills ?? [] },
      },
    });

    await this.livekit.createRoom(roomName);

    const operator = await this.findAvailableOperator(user.locale, dto.requiredSkills ?? []);

    if (!operator) {
      await this.prisma.call.update({ where: { id: call.id }, data: { status: 'queued' } });
      await this.prisma.callQueue.create({
        data: {
          callId: call.id,
          requiredSkills: dto.requiredSkills ?? [],
          requiredLanguage: (user.locale as any) ?? null,
        },
      });

      const holdMusicUrl = process.env.HOLD_MUSIC_URL ?? '';
      if (holdMusicUrl) await this.centrifugo.playAudioToCall(call.id, holdMusicUrl, 'caller');

      const callerToken = await this.livekit.generateToken(user.sub, roomName);

      // Notify ALL online operators so queue panel updates immediately (no 8s poll wait)
      const onlineOps = await this.prisma.operatorState.findMany({
        where: { status: 'available' as any },
        select: { userId: true },
      });
      await Promise.all(
        onlineOps.map(op => this.centrifugo.publishToUser(op.userId, 'call.queued', {
          callId: call.id, callerId: user.sub, ts: new Date().toISOString(),
        })),
      );

      await this.rabbitmq.publish('call.initiated', {
        call_id: call.id, caller_id: user.sub, direction: 'inbound',
        status: 'queued', livekit_room: roomName, ts: Date.now(),
      });

      this.logger.log({ event: 'call_queued', callId: call.id, userId: user.sub });
      return { call: { ...call, status: 'queued' }, status: 'queued', livekitRoom: roomName, livekitUrl: this.livekit.wsUrl, callerToken };
    }

    await this.prisma.call.update({
      where: { id: call.id },
      data: { calleeId: operator.userId, status: 'ringing', initiatedAt: new Date() },
    });
    await this.prisma.operatorState.updateMany({
      where: { userId: operator.userId },
      data: { onCall: true },
    });

    const callerToken = await this.livekit.generateToken(user.sub, roomName);

    await this.centrifugo.publishToUser(operator.userId, 'call.incoming', {
      callId: call.id, callerId: user.sub, livekitRoom: roomName,
      livekitUrl: this.livekit.wsUrl, ts: new Date().toISOString(),
    });

    await this.rabbitmq.publish('call.initiated', {
      call_id: call.id, caller_id: user.sub, callee_id: operator.userId,
      direction: 'inbound', status: 'ringing', livekit_room: roomName, ts: Date.now(),
    });

    this.logger.log({ event: 'call_ringing', callId: call.id, operatorId: operator.userId });
    return {
      call: { ...call, status: 'ringing', calleeId: operator.userId },
      status: 'ringing',
      livekitRoom: roomName,
      livekitUrl: this.livekit.wsUrl,
      callerToken,
    };
  }

  // ── QISM 4: Answer + Hangup ──────────────────────────────────────────────────

  async answerCall(user: JwtUser, callId: string) {
    const call = await this.getCallOrThrow(callId);

    if (call.calleeId !== user.sub) throw new ForbiddenException('Bu qo\'ng\'iroq sizga tegishli emas');
    if (call.status !== 'ringing') throw new BadRequestException(`Qo'ng'iroq holati: ${call.status}`);

    await this.prisma.call.update({
      where: { id: callId },
      data: { status: 'connected', answeredAt: new Date() },
    });

    const callerToken = await this.livekit.generateToken(call.callerId!, call.livekitRoom!);
    const operatorToken = await this.livekit.generateToken(user.sub, call.livekitRoom!);

    await this.centrifugo.publish(`call:${callId}`, {
      event: 'call.connected',
      callId,
      operatorId: user.sub,
      livekitUrl: this.livekit.wsUrl,
      callerToken,
      ts: new Date().toISOString(),
    });

    await this.rabbitmq.publish('call.connected', {
      call_id: callId, operator_id: user.sub, caller_id: call.callerId, ts: Date.now(),
    });

    this.logger.log({ event: 'call_answered', callId, operatorId: user.sub });
    return {
      callId,
      status: 'connected',
      livekitRoom: call.livekitRoom,
      livekitUrl: this.livekit.wsUrl,
      callerToken,
      operatorToken,
    };
  }

  async hangupCall(user: JwtUser, callId: string, cause?: string) {
    const call = await this.getCallOrThrow(callId);

    const terminal: CallStatus[] = ['completed', 'failed', 'no_answer', 'canceled'];
    if (terminal.includes(call.status)) return { callId, status: call.status };

    const now = new Date();
    const talkMs = call.answeredAt ? now.getTime() - call.answeredAt.getTime() : null;

    const finalStatus: CallStatus = call.status === 'ringing' ? 'no_answer' :
      call.status === 'queued' ? 'canceled' : 'completed';

    await this.prisma.call.update({
      where: { id: callId },
      data: {
        status: finalStatus,
        hangupBy: user.sub,
        hangupCause: cause ?? null,
        endedAt: now,
        talkDurationMs: talkMs,
      },
    });

    await this.livekit.destroyRoom(call.livekitRoom!);

    // Release onCall lock for both caller and callee
    const releaseIds = [call.callerId, call.calleeId].filter(Boolean) as string[];
    if (releaseIds.length > 0) {
      await this.prisma.operatorState.updateMany({
        where: { userId: { in: releaseIds } },
        data: { onCall: false },
      });
    }

    await this.centrifugo.publish(`call:${callId}`, {
      event: 'call.ended', callId, status: finalStatus, hangupBy: user.sub, ts: now.toISOString(),
    });

    await this.rabbitmq.publish('call.ended', {
      call_id: callId, status: finalStatus, hangup_by: user.sub,
      talk_duration_ms: talkMs, ts: Date.now(),
    });

    await this.pollQueueForCaller(user.sub);

    this.logger.log({ event: 'call_ended', callId, status: finalStatus, hangupBy: user.sub });
    return { callId, status: finalStatus };
  }

  // ── QISM 5: Outbound call ─────────────────────────────────────────────────────

  async outboundCall(user: JwtUser, dto: OutboundCallDto) {
    if (!OPERATOR_ROLES.has(user.role)) throw new ForbiddenException('Faqat operatorlar qo\'ng\'iroq qila oladi');

    // Prevent operator from making outbound call if already on a call
    const opState = await this.prisma.operatorState.findUnique({ where: { userId: user.sub } });
    if (opState?.onCall) throw new BadRequestException('Siz allaqachon qo\'ng\'iroqda');

    const callee = await this.prisma.user.findUnique({ where: { id: dto.calleeId } });
    if (!callee) throw new NotFoundException('Foydalanuvchi topilmadi');

    const roomName = `call-${Date.now()}-out-${user.sub.slice(0, 8)}`;

    const call = await this.prisma.call.create({
      data: {
        callerId: user.sub,
        calleeId: dto.calleeId,
        direction: 'outbound',
        status: 'ringing',
        livekitRoom: roomName,
        metadata: { subject: dto.subject ?? null },
      },
    });

    await this.livekit.createRoom(roomName);
    await this.prisma.operatorState.updateMany({
      where: { userId: user.sub },
      data: { onCall: true },
    });

    const online = await this.redis.isOnline(dto.calleeId);
    // Always publish via Centrifugo — subscriber receives it if connected,
    // even if Redis presence is stale (e.g. web client without push proxy).
    await this.centrifugo.publishToUser(dto.calleeId, 'call.incoming', {
      callId: call.id, callerId: user.sub, livekitRoom: roomName, ts: new Date().toISOString(),
    });

    await this.rabbitmq.publish('call.initiated', {
      call_id: call.id, caller_id: user.sub, callee_id: dto.calleeId,
      direction: 'outbound', status: 'ringing', livekit_room: roomName,
      voip_push_needed: !online, ts: Date.now(),
    });

    this.logger.log({ event: 'outbound_call', callId: call.id, callerId: user.sub, calleeId: dto.calleeId });
    return { call, status: 'ringing', livekitRoom: roomName };
  }

  // ── QISM 6: Hold + Mute ───────────────────────────────────────────────────────

  async holdCall(user: JwtUser, callId: string, dto: HoldDto) {
    const call = await this.getCallOrThrow(callId);
    if (call.calleeId !== user.sub && call.callerId !== user.sub)
      throw new ForbiddenException('Bu qo\'ng\'iroqda qatnashmodasiz');

    const newStatus: CallStatus = dto.hold ? 'on_hold' : 'connected';
    await this.prisma.call.update({ where: { id: callId }, data: { status: newStatus } });

    if (dto.hold) {
      const holdMusicUrl = process.env.HOLD_MUSIC_URL ?? '';
      if (holdMusicUrl) await this.centrifugo.playAudioToCall(callId, holdMusicUrl, 'caller');
    }

    await this.centrifugo.publish(`call:${callId}`, { event: 'call.hold', callId, hold: dto.hold, ts: new Date().toISOString() });
    return { callId, status: newStatus };
  }

  async muteCall(user: JwtUser, callId: string, dto: MuteDto) {
    const call = await this.getCallOrThrow(callId);
    await this.livekit.mutePublishedTrack(call.livekitRoom!, user.sub, dto.muted);
    await this.centrifugo.publish(`call:${callId}`, { event: 'call.mute', callId, muted: dto.muted, userId: user.sub, ts: new Date().toISOString() });
    return { callId, muted: dto.muted };
  }

  // ── QISM 7: Cold transfer ─────────────────────────────────────────────────────

  async transferCall(user: JwtUser, callId: string, dto: TransferCallDto) {
    if (!OPERATOR_ROLES.has(user.role)) throw new ForbiddenException('Faqat operatorlar transfer qila oladi');
    const call = await this.getCallOrThrow(callId);
    if (!['connected', 'on_hold'].includes(call.status))
      throw new BadRequestException('Faqat ulangan qo\'ng\'iroqlarni transfer qilish mumkin');

    const transfer = await this.prisma.callTransfer.create({
      data: {
        callId,
        fromOperator: user.sub,
        toOperator: dto.toOperatorId,
        type: dto.type as TransferType,
        status: 'initiated',
        consultRoom: dto.type === 'warm' ? `consult-${callId}` : null,
      },
    });

    if (dto.type === 'cold') {
      return this.executeColdTransfer(call, transfer, user.sub, dto.toOperatorId);
    } else {
      return this.initiateWarmTransfer(call, transfer, user.sub, dto.toOperatorId);
    }
  }

  private async executeColdTransfer(call: any, transfer: any, fromId: string, toId: string) {
    await this.prisma.call.update({ where: { id: call.id }, data: { status: 'transferring', calleeId: toId } });
    await this.livekit.removeParticipant(call.livekitRoom, fromId);

    await this.centrifugo.publishToUser(toId, 'call.transfer.incoming', {
      callId: call.id, fromOperatorId: fromId, livekitRoom: call.livekitRoom, ts: new Date().toISOString(),
    });

    await this.prisma.callTransfer.update({ where: { id: transfer.id }, data: { status: 'completed', completedAt: new Date() } });
    await this.prisma.call.update({ where: { id: call.id }, data: { status: 'connected' } });

    await this.rabbitmq.publish('call.transferred', {
      call_id: call.id, from_operator: fromId, to_operator: toId, type: 'cold', ts: Date.now(),
    });

    this.logger.log({ event: 'cold_transfer', callId: call.id, from: fromId, to: toId });
    return { callId: call.id, transferId: transfer.id, type: 'cold', status: 'completed' };
  }

  private async initiateWarmTransfer(call: any, transfer: any, fromId: string, toId: string) {
    const consultRoom = `consult-${call.id}`;
    await this.livekit.createRoom(consultRoom);
    await this.prisma.call.update({ where: { id: call.id }, data: { status: 'on_hold' } });

    const holdMusicUrl = process.env.HOLD_MUSIC_URL ?? '';
    if (holdMusicUrl) await this.centrifugo.playAudioToCall(call.id, holdMusicUrl, 'caller');

    const fromToken = await this.livekit.generateToken(fromId, consultRoom);
    const toToken = await this.livekit.generateToken(toId, consultRoom);

    await this.centrifugo.publishToUser(toId, 'call.transfer.consult', {
      callId: call.id, transferId: transfer.id, consultRoom, fromOperatorId: fromId, ts: new Date().toISOString(),
    });

    await this.prisma.callTransfer.update({ where: { id: transfer.id }, data: { status: 'consulting' } });

    this.logger.log({ event: 'warm_transfer_initiated', callId: call.id, from: fromId, to: toId });
    return { callId: call.id, transferId: transfer.id, type: 'warm', status: 'consulting', consultRoom, fromToken, toToken };
  }

  async completeWarmTransfer(user: JwtUser, callId: string) {
    const call = await this.getCallOrThrow(callId);
    const transfer = await this.prisma.callTransfer.findFirst({
      where: { callId, status: 'consulting', type: 'warm' },
      orderBy: { initiatedAt: 'desc' },
    });
    if (!transfer) throw new NotFoundException('Aktiv warm transfer topilmadi');

    await this.livekit.removeParticipant(call.livekitRoom!, transfer.fromOperator);
    await this.livekit.destroyRoom(`consult-${callId}`);

    await this.prisma.call.update({ where: { id: callId }, data: { status: 'connected', calleeId: transfer.toOperator } });
    await this.prisma.callTransfer.update({ where: { id: transfer.id }, data: { status: 'completed', completedAt: new Date() } });

    await this.rabbitmq.publish('call.transferred', {
      call_id: callId, from_operator: transfer.fromOperator, to_operator: transfer.toOperator, type: 'warm', ts: Date.now(),
    });

    return { callId, transferId: transfer.id, status: 'completed' };
  }

  async cancelWarmTransfer(user: JwtUser, callId: string) {
    const call = await this.getCallOrThrow(callId);
    const transfer = await this.prisma.callTransfer.findFirst({
      where: { callId, status: 'consulting', type: 'warm' },
      orderBy: { initiatedAt: 'desc' },
    });
    if (!transfer) throw new NotFoundException('Aktiv warm transfer topilmadi');

    await this.livekit.destroyRoom(`consult-${callId}`);
    await this.prisma.call.update({ where: { id: callId }, data: { status: 'connected' } });
    await this.prisma.callTransfer.update({ where: { id: transfer.id }, data: { status: 'canceled', completedAt: new Date() } });

    return { callId, transferId: transfer.id, status: 'canceled' };
  }

  // ── QISM 9: Recording consent flow ───────────────────────────────────────────

  async startRecording(user: JwtUser, callId: string) {
    if (!OPERATOR_ROLES.has(user.role)) throw new ForbiddenException('Faqat operatorlar yozishni boshlaydi');
    const call = await this.getCallOrThrow(callId);
    if (call.status !== 'connected') throw new BadRequestException('Faqat ulangan qo\'ng\'iroqlarni yozish mumkin');

    const existing = await this.prisma.recording.findFirst({
      where: { callId, status: { in: ['starting', 'active'] } },
    });
    if (existing) throw new ConflictException('Yozish allaqachon boshlangan');

    const recording = await this.prisma.recording.create({
      data: { callId, startedBy: user.sub, consentAnnounced: false, status: 'starting' },
    });

    const locale = (call.metadata as any)?.locale ?? 'uz';
    const announcementUrl = locale === 'ru'
      ? (process.env.RECORDING_ANNOUNCEMENT_URL_RU ?? '')
      : (process.env.RECORDING_ANNOUNCEMENT_URL_UZ ?? '');

    if (announcementUrl) {
      await this.centrifugo.playAudioToCall(callId, announcementUrl, 'all');
    }

    // 10 second timeout — if no consent-ack, mark failed
    setTimeout(async () => {
      const rec = await this.prisma.recording.findUnique({ where: { id: recording.id } });
      if (rec && !rec.consentAnnounced && rec.status === 'starting') {
        await this.prisma.recording.update({
          where: { id: recording.id },
          data: { status: 'failed', failedReason: 'consent_timeout' },
        });
        this.logger.warn({ event: 'recording_consent_timeout', recordingId: recording.id, callId });
      }
    }, 10_000);

    return { recordingId: recording.id, status: 'starting', consentAnnounced: false };
  }

  async recordingConsentAck(user: JwtUser, callId: string, recordingId: string) {
    const recording = await this.prisma.recording.findUnique({ where: { id: recordingId } });
    if (!recording || recording.callId !== callId) throw new NotFoundException('Recording topilmadi');
    if (recording.status !== 'starting') throw new BadRequestException('Recording holati noto\'g\'ri');
    if (recording.consentAnnounced) throw new ConflictException('Rozilik allaqachon tasdiqlangan');

    const call = await this.getCallOrThrow(callId);

    await this.prisma.recording.update({
      where: { id: recordingId },
      data: { consentAnnounced: true },
    });

    // Delegate Egress to recording-service
    const recordingServiceUrl = process.env.RECORDING_SERVICE_URL ?? 'http://recording-service:3007';
    let egressId: string | null = null;
    let finalStatus = 'starting';
    try {
      const res = await fetch(`${recordingServiceUrl}/recordings/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordingId, callId, livekitRoom: call.livekitRoom }),
      });
      if (res.ok) {
        const data = await res.json() as any;
        egressId = data.egressId ?? null;
        finalStatus = data.status ?? (egressId ? 'active' : 'starting');
      } else {
        this.logger.error({ event: 'recording_service_error', status: res.status, recordingId });
      }
    } catch (err) {
      this.logger.error({ event: 'recording_service_unreachable', recordingId, err: String(err) });
    }

    await this.rabbitmq.publish('call.recording.started', {
      call_id: callId, recording_id: recordingId, egress_id: egressId, ts: Date.now(),
    });

    return { recordingId, status: finalStatus, egressId };
  }

  async stopRecording(user: JwtUser, callId: string) {
    const recording = await this.prisma.recording.findFirst({
      where: { callId, status: 'active' },
    });
    if (!recording) throw new NotFoundException('Aktiv recording topilmadi');

    if (recording.egressId) await this.livekit.stopEgress(recording.egressId);

    const now = new Date();
    const durationMs = now.getTime() - recording.startedAt.getTime();
    await this.prisma.recording.update({
      where: { id: recording.id },
      data: { status: 'processing', stoppedAt: now, durationMs },
    });

    await this.rabbitmq.publish('call.recording.completed', {
      call_id: callId, recording_id: recording.id, duration_ms: durationMs, ts: Date.now(),
    });

    return { recordingId: recording.id, status: 'processing', durationMs };
  }

  // ── QISM 10: GET /calls, GET /calls/:id, GET /calls/queue ────────────────────

  async getCallQueue() {
    const calls = await this.prisma.call.findMany({
      where: { direction: 'inbound', status: 'queued' },
      orderBy: { initiatedAt: 'asc' },
      take: 50,
      select: {
        id: true, callerId: true, status: true, initiatedAt: true,
        livekitRoom: true, metadata: true,
      },
    });

    const callerIds = [...new Set(calls.map(c => c.callerId).filter(Boolean) as string[])];
    const nameMap = new Map<string, string | null>();
    if (callerIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: callerIds } },
        select: { id: true, fullName: true, phone: true },
      });
      users.forEach(u => nameMap.set(u.id, u.fullName ?? u.phone ?? null));
    }

    return {
      queue: calls.map(c => ({
        ...c,
        callerName: c.callerId ? (nameMap.get(c.callerId) ?? null) : null,
        waitMs: Date.now() - new Date(c.initiatedAt).getTime(),
      })),
      total: calls.length,
    };
  }

  async getCall(callId: string) {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: { transfers: true, recordings: true },
    });
    if (!call) throw new NotFoundException('Qo\'ng\'iroq topilmadi');
    return call;
  }

  async getCalls(user: JwtUser, limit = 20, offset = 0) {
    const where = OPERATOR_ROLES.has(user.role)
      ? { OR: [{ callerId: user.sub }, { calleeId: user.sub }] }
      : { callerId: user.sub };

    const [calls, total] = await Promise.all([
      this.prisma.call.findMany({ where, orderBy: { initiatedAt: 'desc' }, take: limit, skip: offset }),
      this.prisma.call.count({ where }),
    ]);

    // Batch-fetch names for caller/callee
    const userIds = [...new Set(
      calls.flatMap(c => [c.callerId, c.calleeId]).filter(Boolean) as string[]
    )];
    const nameMap = new Map<string, string | null>();
    if (userIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, fullName: true, phone: true },
      });
      users.forEach(u => nameMap.set(u.id, u.fullName ?? u.phone ?? null));
    }

    const enriched = calls.map(c => ({
      ...c,
      callerName: c.callerId ? (nameMap.get(c.callerId) ?? null) : null,
      calleeName: c.calleeId ? (nameMap.get(c.calleeId) ?? null) : null,
    }));

    return { calls: enriched, total, limit, offset };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private async getCallOrThrow(callId: string) {
    const call = await this.prisma.call.findUnique({ where: { id: callId } });
    if (!call) throw new NotFoundException('Qo\'ng\'iroq topilmadi');
    return call;
  }

  private async findAvailableOperator(locale: string, requiredSkills: string[]) {
    const candidates = await this.prisma.operatorState.findMany({
      where: {
        status: 'available' as any,
        onCall: false,
        languages: { has: locale as any },
        ...(requiredSkills.length > 0 ? { skills: { hasSome: requiredSkills } } : {}),
      },
      orderBy: { activeChats: 'asc' },
      take: 20,
    });

    for (const c of candidates) {
      if (c.activeChats >= c.maxConcurrentChats) continue;

      // Skip operators without active Redis presence (stale DB status)
      const online = await this.redis.isOnline(c.userId);
      if (!online) continue;

      const claimKey = `operator:claim:${c.userId}`;
      const claimed = await this.redis.setnx(claimKey, '1', CLAIM_TTL);
      if (claimed) return { userId: c.userId };
    }
    return null;
  }

  private async pollQueueForCaller(operatorId: string) {
    const queued = await this.prisma.callQueue.findFirst({
      where: { assignedAt: null },
      orderBy: [{ priority: 'desc' }, { enqueuedAt: 'asc' }],
    });
    if (!queued) return;

    const op = await this.prisma.operatorState.findFirst({ where: { status: 'available' as any, userId: operatorId } });
    if (!op) return;

    const claimed = await this.redis.setnx(`operator:claim:${operatorId}`, '1', CLAIM_TTL);
    if (!claimed) return;

    await this.prisma.callQueue.update({
      where: { id: queued.id },
      data: { assignedAt: new Date(), assignedTo: operatorId },
    });

    const call = await this.prisma.call.update({
      where: { id: queued.callId },
      data: { calleeId: operatorId, status: 'ringing' },
    });

    await this.centrifugo.publishToUser(operatorId, 'call.incoming', {
      callId: call.id, callerId: call.callerId, livekitRoom: call.livekitRoom, ts: new Date().toISOString(),
    });
  }
}
