import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsPositive,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { BaseUom } from '@prisma/client';

export class CreateProductDto {
  @ApiProperty({
    description: 'Product name',
    example: 'Premium Basmati Rice',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Product description',
    example: 'High-quality basmati rice from India',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Base unit of measurement',
    enum: BaseUom,
    example: BaseUom.GRAM,
  })
  @IsEnum(BaseUom)
  baseUom: BaseUom;

  @ApiProperty({
    description: 'Conversion factor to base unit (e.g., 1000 for 1kg = 1000g)',
    example: 1,
    minimum: 0,
  })
  @Transform(({ value }) => parseFloat(value))
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  conversionFactorToBase: number;

  @ApiProperty({
    description: 'Price per base unit',
    example: 0.005,
    minimum: 0,
  })
  @Transform(({ value }) => parseFloat(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pricePerBaseUom: number;

  @ApiProperty({
    description: 'Stock Keeping Unit (SKU)',
    example: 'RICE-BASMATI-001',
    required: false,
  })
  @IsString()
  @IsOptional()
  sku?: string;
}
