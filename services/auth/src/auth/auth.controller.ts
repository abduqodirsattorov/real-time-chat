import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser, Public } from './decorators/current-user.decorator';
import { JwtPayload } from './strategies/jwt.strategy';
import { RegisterDto } from './dto/register.dto';
import { OtpSendDto } from './dto/otp-send.dto';
import { OtpVerifyDto } from './dto/otp-verify.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { UpdateLocaleDto } from './dto/update-locale.dto';
import { CentrifugoTokenDto } from './dto/centrifugo-token.dto';
import { CentrifugoSubscribeDto } from './dto/centrifugo-subscribe.dto';
import { NovaSsoDto } from './dto/nova-sso.dto';

@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('otp/send')
  @HttpCode(HttpStatus.OK)
  otpSend(@Body() dto: OtpSendDto) {
    return this.authService.otpSend(dto.phone);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  otpVerify(@Body() dto: OtpVerifyDto) {
    return this.authService.otpVerify(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.phone);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@CurrentUser() user: JwtPayload) {
    return this.authService.logout(user.sub, user.jti);
  }

  @Get('me')
  getMe(@CurrentUser() user: JwtPayload) {
    return this.authService.getMe(user.sub);
  }

  @Patch('me/locale')
  updateLocale(@CurrentUser() user: JwtPayload, @Body() dto: UpdateLocaleDto) {
    return this.authService.updateLocale(user.sub, dto.locale);
  }

  @Post('centrifugo/token')
  @HttpCode(HttpStatus.OK)
  centrifugoToken(@CurrentUser() user: JwtPayload, @Body() _dto: CentrifugoTokenDto) {
    return this.authService.centrifugoToken(user.sub, user.role, user.locale);
  }

  @Post('centrifugo/subscribe')
  @HttpCode(HttpStatus.OK)
  centrifugoSubscribe(@CurrentUser() user: JwtPayload, @Body() dto: CentrifugoSubscribeDto) {
    return this.authService.centrifugoSubscribe(user.sub, dto);
  }

  @Public()
  @Post('nova/sso')
  @HttpCode(HttpStatus.OK)
  novaSso(@Body() dto: NovaSsoDto) {
    return this.authService.novaSso(dto);
  }
}
