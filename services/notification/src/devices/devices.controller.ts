import {
  Controller, Post, Delete, Get, Body, Param, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dto/register-device.dto';

@Controller('devices')
@UseGuards(JwtAuthGuard)
export class DevicesController {
  constructor(private readonly svc: DevicesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  register(@CurrentUser() user: any, @Body() dto: RegisterDeviceDto) {
    return this.svc.register(user.sub, dto);
  }

  @Get()
  list(@CurrentUser() user: any) {
    return this.svc.getUserDevices(user.sub);
  }

  @Delete(':token')
  @HttpCode(HttpStatus.OK)
  unregister(@CurrentUser() user: any, @Param('token') token: string) {
    return this.svc.unregister(user.sub, token);
  }
}
