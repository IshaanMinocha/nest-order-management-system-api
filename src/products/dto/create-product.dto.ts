import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsPositive,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { BaseUom } from '@prisma/client';
import {
  IsValidPrice,
  IsSafeString,
} from '../../common/validators/custom-validators';

export class CreateProductDto {
  @ApiProperty({
    description: 'Product name',
    example: 'Premium Basmati Rice',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsSafeString()
  name: string;

  @ApiProperty({
    description: 'Product description',
    example: 'High-quality basmati rice from India',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  @IsSafeString()
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
  @IsValidPrice()
  pricePerBaseUom: number;

  @ApiProperty({
    description: 'Stock Keeping Unit (SKU)',
    example: 'RICE-BASMATI-001',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  @Matches(/^[A-Z0-9\-_]+$/, {
    message:
      'SKU must contain only uppercase letters, numbers, hyphens, and underscores',
  })
  sku?: string;
}
