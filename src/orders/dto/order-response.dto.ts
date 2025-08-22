import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus, RequestedUom } from '@prisma/client';

export class OrderItemResponseDto {
  @ApiProperty({ description: 'Order item ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Product ID', example: 1 })
  productId: number;

  @ApiProperty({ description: 'Product name', example: 'Premium Basmati Rice' })
  productName: string;

  @ApiProperty({ description: 'Requested quantity', example: 5 })
  quantityRequested: number;

  @ApiProperty({
    description: 'Requested unit of measurement',
    enum: RequestedUom,
    example: RequestedUom.KILOGRAM,
  })
  requestedUom: RequestedUom;

  @ApiProperty({ description: 'Quantity in base UOM', example: 5000 })
  quantityInBaseUom: number;

  @ApiProperty({ description: 'Unit price in base UOM', example: 0.005 })
  unitPriceInBaseUom: number;

  @ApiProperty({ description: 'Line total', example: 25.0 })
  lineTotal: number;
}

export class OrderResponseDto {
  @ApiProperty({ description: 'Order ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Buyer ID', example: 1 })
  buyerId: number;

  @ApiProperty({ description: 'Buyer email', example: 'buyer1@oms.com' })
  buyerEmail?: string;

  @ApiProperty({ description: 'Order number', example: 'ORD-2024-001' })
  orderNumber: string;

  @ApiProperty({
    description: 'Order status',
    enum: OrderStatus,
    example: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @ApiProperty({ description: 'Total amount', example: 65.0 })
  totalAmount: number;

  @ApiProperty({ description: 'Order notes', example: 'Urgent delivery' })
  notes: string | null;

  @ApiProperty({
    description: 'Order items',
    type: [OrderItemResponseDto],
  })
  items: OrderItemResponseDto[];

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}
