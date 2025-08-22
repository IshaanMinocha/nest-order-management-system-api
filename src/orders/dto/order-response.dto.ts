import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus, RequestedUom } from '@prisma/client';

export class OrderItemResponseDto {
  @ApiProperty({
    description: 'Order item ID',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'Product ID',
    example: 1,
  })
  productId: number;

  @ApiProperty({
    description: 'Product name',
    example: 'Premium Basmati Rice',
  })
  productName: string;

  @ApiProperty({
    description: 'Quantity requested by buyer',
    example: 2,
  })
  quantityRequested: number;

  @ApiProperty({
    description: 'Unit of measure requested',
    enum: RequestedUom,
    example: RequestedUom.KILOGRAM,
  })
  requestedUom: RequestedUom;

  @ApiProperty({
    description: 'Quantity converted to base UOM',
    example: 2000,
  })
  quantityInBaseUom: number;

  @ApiProperty({
    description: 'Unit price in base UOM',
    example: 0.05,
  })
  unitPriceInBaseUom: number;

  @ApiProperty({
    description: 'Line total for this item',
    example: 100.0,
  })
  lineTotal: number;

  @ApiProperty({
    description: 'Supplier information',
    type: 'object',
    properties: {
      id: { type: 'number', example: 1 },
      email: { type: 'string', example: 'supplier1@oms.com' },
      firstName: { type: 'string', example: 'John' },
      lastName: { type: 'string', example: 'Supplier' },
    },
  })
  supplier: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
  };
}

export class OrderStatusHistoryDto {
  @ApiProperty({
    description: 'Status history ID',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'Previous status (null for initial status)',
    enum: OrderStatus,
    example: OrderStatus.PENDING,
    nullable: true,
  })
  fromStatus: OrderStatus | null;

  @ApiProperty({
    description: 'New status',
    enum: OrderStatus,
    example: OrderStatus.APPROVED,
  })
  toStatus: OrderStatus;

  @ApiProperty({
    description: 'User who made the change',
    type: 'object',
    properties: {
      id: { type: 'number', example: 1 },
      email: { type: 'string', example: 'admin@oms.com' },
      firstName: { type: 'string', example: 'Admin' },
      lastName: { type: 'string', example: 'User' },
    },
  })
  changedBy: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
  };

  @ApiProperty({
    description: 'Reason for status change',
    example: 'Stock verified and payment confirmed',
  })
  reason: string;

  @ApiProperty({
    description: 'Timestamp of status change',
    example: '2024-01-15T10:30:00.000Z',
  })
  changedAt: string;
}

export class OrderResponseDto {
  @ApiProperty({
    description: 'Order ID',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'Buyer ID',
    example: 2,
  })
  buyerId: number;

  @ApiProperty({
    description: 'Buyer email',
    example: 'buyer1@oms.com',
  })
  buyerEmail: string;

  @ApiProperty({
    description: 'Unique order number',
    example: 'ORD-2024-001',
  })
  orderNumber: string;

  @ApiProperty({
    description: 'Current order status',
    enum: OrderStatus,
    example: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @ApiProperty({
    description: 'Total order amount',
    example: 150.75,
  })
  totalAmount: number;

  @ApiProperty({
    description: 'Order notes',
    example: 'Urgent delivery required',
    nullable: true,
  })
  notes: string | null;

  @ApiProperty({
    description: 'Order items',
    type: [OrderItemResponseDto],
  })
  items: OrderItemResponseDto[];

  @ApiProperty({
    description: 'Order status history',
    type: [OrderStatusHistoryDto],
  })
  statusHistory: OrderStatusHistoryDto[];

  @ApiProperty({
    description: 'Order creation timestamp',
    example: '2024-01-15T09:00:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Order last update timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  updatedAt: string;
}
