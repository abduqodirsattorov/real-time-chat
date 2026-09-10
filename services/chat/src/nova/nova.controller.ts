import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Headers,
  HttpException,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { NovaService } from './nova.service';
import { AuditService } from '../common/audit/audit.service';
import { CurrentUser, JwtUser, Public } from '../common/decorators/current-user.decorator';
import { ExecuteNovaActionDto } from './dto/nova-action.dto';

const OPERATOR_ROLES = new Set(['operator', 'supervisor', 'admin']);
const SUPERVISOR_ROLES = new Set(['supervisor', 'admin']);

@Controller('nova')
export class NovaController {
  constructor(
    private readonly nova: NovaService,
    private readonly audit: AuditService,
  ) {}

  /** Health — no JWT required. Proxies to Nova/mock-nova. */
  @Get('health')
  @Public()
  async health() {
    try {
      return await this.nova.health();
    } catch {
      throw new HttpException('Nova unreachable', HttpStatus.BAD_GATEWAY);
    }
  }

  /** Fetch profile from Nova. */
  @Get('test/profile/:uid')
  async testProfile(@CurrentUser() user: JwtUser, @Param('uid') uid: string) {
    if (!OPERATOR_ROLES.has(user.role)) throw new ForbiddenException();
    try {
      return await this.nova.getProfile(uid);
    } catch (err: any) {
      const status = err?.response?.status ?? HttpStatus.BAD_GATEWAY;
      throw new HttpException(err?.response?.data ?? 'Nova error', status);
    }
  }

  /** Fetch available actions from Nova. Tests retry logic (mock fail-once). */
  @Get('test/actions/:extId')
  async testActions(@CurrentUser() user: JwtUser, @Param('extId') extId: string) {
    if (!OPERATOR_ROLES.has(user.role)) throw new ForbiddenException();
    try {
      return await this.nova.getActions(extId);
    } catch (err: any) {
      const status = err?.response?.status ?? HttpStatus.BAD_GATEWAY;
      throw new HttpException(err?.response?.data ?? 'Nova error', status);
    }
  }

  /** Execute an action on Nova. Requires supervisor+ role. Operator identity taken STRICTLY from JWT user.sub */
  @Post('action/:extId')
  async executeAction(
    @CurrentUser() user: JwtUser,
    @Param('extId') extId: string,
    @Body() body: ExecuteNovaActionDto,
    @Headers('x-idempotency-key') idempotencyHeader?: string,
  ) {
    if (!SUPERVISOR_ROLES.has(user.role)) throw new ForbiddenException('Faqat supervisor va admin tranzaksiya amallarini bajara oladi');
    const idempotencyKey = idempotencyHeader || body.idempotencyKey;
    const operatorId = user.sub; // Operator ID hech qachon body'dan olinmaydi!

    try {
      const res = await this.nova.executeAction(
        extId,
        body.action,
        operatorId,
        { ...body.params, reason: body.reason, idempotencyKey },
      );

      await this.audit.log({
        actorId: user.sub,
        action: `nova_action_${body.action}`,
        targetType: 'transaction',
        targetId: extId,
        payload: { action: body.action, params: body.params, reason: body.reason, idempotencyKey, success: res.success },
      });

      return res;
    } catch (err: any) {
      await this.audit.log({
        actorId: user.sub,
        action: `nova_action_${body.action}_failed`,
        targetType: 'transaction',
        targetId: extId,
        payload: { action: body.action, params: body.params, reason: body.reason, error: err.message },
      });
      const status = err?.response?.status ?? HttpStatus.BAD_GATEWAY;
      throw new HttpException(err?.response?.data ?? 'Nova error', status);
    }
  }
}
