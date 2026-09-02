import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';

function requireAdmin(user: JwtPayload) {
  if (user.role !== 'admin') {
    throw new ForbiddenException('Faqat admin foydalana oladi');
  }
}

function requireStaff(user: JwtPayload) {
  if (user.role !== 'admin' && user.role !== 'supervisor') {
    throw new ForbiddenException('Faqat admin va supervisor foydalana oladi');
  }
}

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  listUsers(
    @CurrentUser() user: JwtPayload,
    @Query('role') role?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    requireStaff(user);
    return this.adminService.listUsers({ role, page: Number(page), limit: Number(limit) });
  }

  @Post('users')
  @HttpCode(HttpStatus.CREATED)
  createUser(@CurrentUser() user: JwtPayload, @Body() dto: CreateUserDto) {
    requireAdmin(user);
    return this.adminService.createUser(dto);
  }

  @Get('users/:id')
  getUser(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    requireStaff(user);
    return this.adminService.getUser(id);
  }

  @Patch('users/:id')
  updateUser(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    requireAdmin(user);
    return this.adminService.updateUser(id, dto);
  }

  @Patch('users/:id/password')
  @HttpCode(HttpStatus.OK)
  updatePassword(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePasswordDto,
  ) {
    requireAdmin(user);
    return this.adminService.updatePassword(id, dto.password);
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.OK)
  deleteUser(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    requireAdmin(user);
    return this.adminService.deleteUser(id, user.sub);
  }
}
