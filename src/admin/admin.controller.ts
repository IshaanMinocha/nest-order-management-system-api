import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { UpdateOrderStatusDto, AnalyticsResponseDto } from './dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { UserRole, User } from '@prisma/client';

@ApiTags('admin')
@Controller('v1/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Patch('orders/:id/status')
  @ApiOperation({
    summary: 'Change order status (Admin only)',
    description:
      'Update order status with automatic stock management. Supports status transitions: PENDING → APPROVED/CANCELLED, APPROVED → FULFILLED/CANCELLED',
  })
  @ApiResponse({
    status: 200,
    description: 'Order status updated successfully with stock adjustments',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid status transition or insufficient stock',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin role required',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  updateOrderStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateOrderStatusDto: UpdateOrderStatusDto,
    @CurrentUser() user: Omit<User, 'passwordHash'>,
  ) {
    return this.adminService.updateOrderStatus(
      id,
      updateOrderStatusDto,
      user.id,
    );
  }

  @Get('analytics')
  @ApiOperation({
    summary: 'Get order analytics (Admin only)',
    description:
      'Retrieve comprehensive analytics including order counts by status, revenue per supplier, and top products',
  })
  @ApiResponse({
    status: 200,
    description: 'Analytics retrieved successfully',
    type: AnalyticsResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin role required',
  })
  getAnalytics() {
    return this.adminService.getAnalytics();
  }
}
