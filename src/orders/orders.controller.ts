import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { UserRole, User, OrderStatus } from '@prisma/client';

@ApiTags('Orders')
@Controller('v1/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BUYER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Place a new order (Buyer only)' })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid order data or insufficient stock',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Buyer role required' })
  create(
    @Body() createOrderDto: CreateOrderDto,
    @CurrentUser() user: Omit<User, 'passwordHash'>,
  ) {
    return this.ordersService.create(user.id, createOrderDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get orders (filtered by user role)' })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  @ApiQuery({
    name: 'supplierId',
    required: false,
    description: 'Filter by supplier ID (Admin only)',
    type: Number,
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by order status',
    enum: OrderStatus,
  })
  findAll(
    @CurrentUser() user: Omit<User, 'passwordHash'>,
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: OrderStatus,
  ) {
    const supplierIdNum = supplierId ? parseInt(supplierId, 10) : undefined;
    return this.ordersService.findAll(
      user.id,
      user.role,
      supplierIdNum,
      status,
    );
  }

  @Get('supplier-orders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPPLIER)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get orders for supplier's products" })
  @ApiResponse({
    status: 200,
    description: 'Supplier orders retrieved successfully',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by order status',
    enum: OrderStatus,
  })
  findSupplierOrders(
    @CurrentUser() user: Omit<User, 'passwordHash'>,
    @Query('status') status?: OrderStatus,
  ) {
    return this.ordersService.findBySupplier(user.id, status);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiResponse({ status: 200, description: 'Order retrieved successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Not authorized to view this order',
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: Omit<User, 'passwordHash'>,
  ) {
    return this.ordersService.findOne(id, user.id, user.role);
  }
}
