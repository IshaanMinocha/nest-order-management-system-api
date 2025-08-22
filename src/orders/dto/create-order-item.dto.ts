import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { RequestedUom } from '@prisma/client';
import { IsValidQuantity } from '../../common/validators/custom-validators';

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
    minimum: 0.0001,
    maximum: 1000000,
  })
  @Transform(({ value }) => parseFloat(value))
  @IsValidQuantity()
  quantityRequested: number;

  @ApiProperty({
    description: 'Unit of measurement for requested quantity',
    enum: RequestedUom,
    example: RequestedUom.KILOGRAM,
  })
  @IsEnum(RequestedUom)
  requestedUom: RequestedUom;
}
