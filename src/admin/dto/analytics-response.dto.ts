import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';

export class OrderCountByStatusDto {
  @ApiProperty({
    description: 'Order status',
    enum: OrderStatus,
    example: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @ApiProperty({
    description: 'Number of orders with this status',
    example: 15,
  })
  count: number;
}

export class RevenueBySupplierDto {
  @ApiProperty({
    description: 'Supplier ID',
    example: 1,
  })
  supplierId: number;

  @ApiProperty({
    description: 'Supplier email',
    example: 'supplier1@oms.com',
  })
  supplierEmail: string;

  @ApiProperty({
    description: 'Supplier name',
    example: 'John Supplier',
  })
  supplierName: string;

  @ApiProperty({
    description: 'Total revenue from this supplier',
    example: 1250.0,
  })
  totalRevenue: number;

  @ApiProperty({
    description: 'Number of orders',
    example: 8,
  })
  orderCount: number;
}

export class TopProductDto {
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
    description: 'Total quantity sold (in base UOM)',
    example: 15000,
  })
  totalQuantitySold: number;

  @ApiProperty({
    description: 'Base unit of measurement',
    example: 'GRAM',
  })
  baseUom: string;

  @ApiProperty({
    description: 'Total revenue from this product',
    example: 750.0,
  })
  totalRevenue: number;

  @ApiProperty({
    description: 'Number of times ordered',
    example: 12,
  })
  orderCount: number;
}

export class AnalyticsResponseDto {
  @ApiProperty({
    description: 'Order counts by status',
    type: [OrderCountByStatusDto],
  })
  ordersByStatus: OrderCountByStatusDto[];

  @ApiProperty({
    description: 'Revenue by supplier',
    type: [RevenueBySupplierDto],
  })
  revenueBySupplier: RevenueBySupplierDto[];

  @ApiProperty({
    description: 'Top selling products',
    type: [TopProductDto],
  })
  topProducts: TopProductDto[];

  @ApiProperty({
    description: 'Total revenue across all orders',
    example: 5425.75,
  })
  totalRevenue: number;

  @ApiProperty({
    description: 'Total number of orders',
    example: 45,
  })
  totalOrders: number;

  @ApiProperty({
    description: 'Average order value',
    example: 120.57,
  })
  averageOrderValue: number;
}
