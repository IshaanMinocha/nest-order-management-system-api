import { ApiProperty } from '@nestjs/swagger';
import { BaseUom } from '@prisma/client';

export class ProductResponseDto {
  @ApiProperty({ description: 'Product ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Supplier ID', example: 1 })
  supplierId: number;

  @ApiProperty({ description: 'Product name', example: 'Premium Basmati Rice' })
  name: string;

  @ApiProperty({
    description: 'Product description',
    example: 'High-quality basmati rice from India',
  })
  description: string | null;

  @ApiProperty({
    description: 'Base unit of measurement',
    enum: BaseUom,
    example: BaseUom.GRAM,
  })
  baseUom: BaseUom;

  @ApiProperty({
    description: 'Conversion factor to base unit',
    example: 1,
  })
  conversionFactorToBase: number;

  @ApiProperty({
    description: 'Price per base unit',
    example: 0.005,
  })
  pricePerBaseUom: number;

  @ApiProperty({
    description: 'Stock Keeping Unit',
    example: 'RICE-BASMATI-001',
  })
  sku: string | null;

  @ApiProperty({ description: 'Is product active', example: true })
  isActive: boolean;

  @ApiProperty({ description: 'Available stock in base UOM', example: 50000 })
  availableStock?: number;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}
