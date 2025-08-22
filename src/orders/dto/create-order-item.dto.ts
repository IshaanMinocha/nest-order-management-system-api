import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive, IsEnum, IsNumber, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { RequestedUom } from '@prisma/client';

export class CreateOrderItemDto {
  @ApiProperty({
    description: 'Product ID',
    example: 1,
  })
  @IsInt()
  @IsPositive()
  productId: number;

  @ApiProperty({
    description: 'Requested quantity',
    example: 5,
    minimum: 0,
  })
  @Transform(({ value }) => parseFloat(value))
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantityRequested: number;

  @ApiProperty({
    description: 'Unit of measurement for requested quantity',
    enum: RequestedUom,
    example: RequestedUom.KILOGRAM,
  })
  @IsEnum(RequestedUom)
  requestedUom: RequestedUom;
}
