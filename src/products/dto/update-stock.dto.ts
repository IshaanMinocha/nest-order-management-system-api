import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsEnum, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { RequestedUom } from '@prisma/client';

export class UpdateStockDto {
  @ApiProperty({
    description:
      'Quantity to add/subtract (positive to add, negative to subtract)',
    example: 1000,
  })
  @Transform(({ value }) => parseFloat(value))
  @IsNumber({ maxDecimalPlaces: 4 })
  quantity: number;

  @ApiProperty({
    description: 'Unit of measurement for the quantity',
    enum: RequestedUom,
    example: RequestedUom.KILOGRAM,
  })
  @IsEnum(RequestedUom)
  uom: RequestedUom;

  @ApiProperty({
    description: 'Reason for stock update',
    example: 'New stock arrival',
    required: false,
  })
  @IsString()
  @IsOptional()
  reason?: string;
}
